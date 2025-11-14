import re
import fitz  # PyMuPDF
from typing import List, Dict, Tuple
from db import get_db_conn


# ---------------------------------------------------------
# STEP 1: Extract text from PDF
# ---------------------------------------------------------
def extract_blocks_text(file_path: str, password: str | None = None) -> str:
    doc = fitz.open(file_path)
    if doc.needs_pass:
        doc.authenticate(password)
    text = ""
    for page in doc:
        text += page.get_text("text")
    doc.close()
    return text


# ---------------------------------------------------------
# STEP 2: Clean Fund Name (skip for Government)
# ---------------------------------------------------------
def clean_fund_name(name: str, htype: str = "") -> str:
    if not name:
        return name

    # Keep full name for Govt securities
    if htype.lower() == "govt security" or "govt" in name.lower() or "government" in name.lower():
        return re.sub(r"\s+", " ", name.strip())[:255]

    name = re.sub(r"\s+", " ", name).strip()
    name = re.split(r"(\s*#|\s+O[Ff]\s+|\s+0[Ff]\s+)", name, flags=re.IGNORECASE)[0]
    name = re.sub(r"[-,/:\s]+$", "", name).strip()
    return name[:255]


# ---------------------------------------------------------
# STEP 3: Classify Mutual Funds
# ---------------------------------------------------------
def classify_mutual_fund(fund_name: str) -> tuple[str, str]:
    """
    Enhanced mutual fund classification with comprehensive category detection
    Returns: (main_category, sub_category)
    """
    if not fund_name:
        return "Others", "Unclassified"
    
    name = fund_name.lower()
    
    # ELSS/Tax Saving (highest priority - specific purpose)
    if any(term in name for term in ["elss", "tax saver", "tax savings", "tax benefit", "80c"]):
        return "Equity", "ELSS"
    
    # Retirement Funds
    if any(term in name for term in ["retirement", "pension"]):
        return "Solution Oriented", "Retirement"
    
    # Children's Funds
    if any(term in name for term in ["children", "child", "education"]):
        return "Solution Oriented", "Children's"
    
    # Index Funds & ETFs
    if any(term in name for term in ["index", "nifty", "sensex", "bse", "etf", "exchange traded"]):
        if "sectoral" in name or any(sector in name for sector in ["bank", "pharma", "it", "tech"]):
            return "Index", "Sectoral Index"
        return "Index", "Broad Market Index"
    
    # Sectoral/Thematic Funds
    sectoral_keywords = {
        "technology": ["technology", "tech", "software", "it"],
        "banking": ["banking", "bank", "financial", "bfsi"],
        "pharma": ["pharma", "pharmaceutical", "healthcare"],
        "infrastructure": ["infrastructure", "infra"],
        "consumption": ["consumption", "consumer", "fmcg"],
        "auto": ["auto", "automobile"],
        "energy": ["energy", "power", "oil & gas"],
        "real estate": ["real estate", "reality"],
        "manufacturing": ["manufacturing", "make in india"],
        "defence": ["defence", "defense"]
    }
    
    for sector, keywords in sectoral_keywords.items():
        if any(keyword in name for keyword in keywords):
            return "Sectoral/Thematic", sector.title()
    
    # Market Cap Based Equity
    if "small cap" in name:
        return "Equity", "Small Cap"
    if "mid cap" in name:
        return "Equity", "Mid Cap"
    if "large cap" in name:
        return "Equity", "Large Cap"
    if "large & mid cap" in name or "large and mid" in name:
        return "Equity", "Large & Mid Cap"
    
    # Multi Cap & Flexi Cap
    if any(term in name for term in ["flexi", "multi cap", "multicap"]):
        return "Equity", "Flexi Cap"
    
    # Focused Funds
    if "focused" in name:
        return "Equity", "Focused"
    
    # Value/Contra Funds
    if any(term in name for term in ["value", "contra"]):
        return "Equity", "Value"
    
    # Dividend Yield
    if "dividend yield" in name:
        return "Equity", "Dividend Yield"
    
    # Arbitrage Funds
    if "arbitrage" in name:
        return "Hybrid", "Arbitrage"
    
    # Hybrid Funds
    hybrid_patterns = [
        (["aggressive", "equity hybrid"], "Aggressive Hybrid"),
        (["conservative", "debt hybrid"], "Conservative Hybrid"),
        (["balanced", "balanced advantage", "dynamic asset"], "Balanced/BA"),
        (["multi asset"], "Multi Asset")
    ]
    
    for keywords, subcat in hybrid_patterns:
        if any(keyword in name for keyword in keywords):
            return "Hybrid", subcat
    
    if "hybrid" in name:
        return "Hybrid", "Aggressive Hybrid"  # default hybrid
    
    # Debt Funds by Duration
    debt_patterns = [
        (["overnight"], "Overnight"),
        (["liquid"], "Liquid"),
        (["ultra short", "ultrashort"], "Ultra Short Duration"),
        (["low duration"], "Low Duration"),
        (["short term", "short duration"], "Short Duration"),
        (["medium term", "medium duration"], "Medium Duration"),
        (["long term", "long duration"], "Long Duration"),
        (["gilt"], "Gilt"),
        (["credit risk"], "Credit Risk"),
        (["corporate bond", "corporate"], "Corporate Bond"),
        (["banking & psu", "psu"], "Banking & PSU"),
        (["dynamic bond"], "Dynamic Bond"),
        (["floater", "floating"], "Floater")
    ]
    
    for keywords, subcat in debt_patterns:
        if any(keyword in name for keyword in keywords):
            return "Debt", subcat
    
    # Commodity Funds
    if any(term in name for term in ["gold", "silver", "commodity"]):
        return "Commodity", "Gold" if "gold" in name else "Other Commodity"
    
    # International Funds
    if any(term in name for term in ["international", "global", "us", "usa", "america", "europe", "asia"]):
        return "International", "Global Equity"
    
    # Fund of Funds (FoFs)
    if any(term in name for term in ["fund of fund", "fof"]):
        return "Fund of Funds", "Domestic FoF" if "international" not in name else "International FoF"
    
    # Default categories based on common terms
    if any(term in name for term in ["equity", "growth"]):
        return "Equity", "Diversified"
    if any(term in name for term in ["debt", "income", "bond"]):
        return "Debt", "Medium Duration"  # default debt
    
    # If nothing matches, try to infer from common patterns
    words = name.split()
    if any(word in ["equity", "growth", "mid", "small", "large", "cap"] for word in words):
        return "Equity", "Diversified"
    if any(word in ["debt", "income", "bond", "gilt"] for word in words):
        return "Debt", "Medium Duration"
    
    return "Others", "Unclassified"

# ---------------------------------------------------------
# STEP 4: Parse NSDL Text (Enhanced for all formats)
# ---------------------------------------------------------
def parse_nsdl_ecas_text(text: str) -> Tuple[List[Dict], float]:
    holdings = []
    total_value = 0.0

    # === EQUITIES PARSING ===
    equity_patterns = [
        # Pattern for both INE and IN[0-9] ISIN formats
        r"(IN[E0-9][A-Z0-9]{9,})\s+([A-Z0-9&\-\.\s#/\(\)]+?)\s+([\d,]+\.?\d*)\s+[\d,]+\.?\d*\s+[\d,]+\.?\d*\s+[\d,]+\.?\d*\s+[\d,]+\.?\d*\s+[\d,]+\.?\d*\s+[\d,]+\.?\d*\s+[\d,]+\.?\d*\s+[\d,]+\.?\d*\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)",
        r"(IN[E0-9][A-Z0-9]{9,})\s+([A-Z0-9&\-\.\s#/\(\)]+?)\s+([\d,]+\.?\d*)(?:\s+[\d,]+\.?\d*){2,}\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)",
        r"(IN[E0-9][A-Z0-9]{9,})\s+([A-Za-z0-9\s\-\&\.\(\)\/#]+?)\s+([\d,]+(?:\.\d+)?)(?:\s+[\d,]+(?:\.\d+)?){2,8}\s+([\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)"
    ]

    for pattern in equity_patterns:
        for match in re.finditer(pattern, text, re.IGNORECASE):
            isin, security_name, units, nav, value = match.groups()
            
            # Clean security name
            security_name = re.sub(
                r"\s*(EQUITY SHARES.*|AFTER SUB DIVISION|SPLIT|FV.*|OF RS[\d/-]+.*)$",
                "",
                security_name,
                flags=re.IGNORECASE
            ).strip()
            
            security_name = clean_fund_name(security_name, "Equity")
            
            holdings.append({
                "type": "Shares",
                "isin_no": isin.strip(),
                "fund_name": security_name[:255],
                "units": float(units.replace(",", "")),
                "nav": float(nav.replace(",", "")),
                "invested_amount": 0.0,
                "valuation": float(value.replace(",", "")),
                "category": "Shares",
                "sub_category": "Shares"
            })
            total_value += float(value.replace(",", ""))

    # === FIXED MUTUAL FUND FOLIOS (F) PARSING ===
    mf_folio_patterns = [
        # Pattern for MF Folios with all 9 columns
        r"(INF[A-Z0-9]{9,})\s+(?:NOT AVAILABLE\s+)?([A-Za-z0-9\s\-\&\.\(\)\/#]+?(?:Fund|Scheme|Plan)[^\n]*?)\s+[\d,]+\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)",
        
        # Alternative pattern with fewer columns
        r"(INF[A-Z0-9]{9,})\s+(?:NOT AVAILABLE\s+)?([A-Za-z0-9\s\-\&\.\(\)\/#]+?)\s+[\d,]+\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)"
    ]

    folio_index = 1  # <--- added just to keep duplicates distinct

    for pattern in mf_folio_patterns:
        for match in re.finditer(pattern, text, re.IGNORECASE):
            groups = match.groups()
            
            if len(groups) == 9:
                isin, fund_name, units, avg_cost, total_cost, current_nav, current_value, unrealised_pnl, annual_return = groups
            elif len(groups) == 7:
                isin, fund_name, units, avg_cost, total_cost, current_nav, current_value = groups
            else:
                continue
            
            # Skip if ISIN is invalid
            if not isin.startswith("INF") or len(isin) < 10:
                continue
                
            category, sub_category = classify_mutual_fund(fund_name)

            # 👇 This line ensures each folio entry remains unique (but parsing is untouched)
            unique_isin = f"{isin.strip()}_{folio_index}"
            folio_index += 1
            
            holdings.append({
                "type": "Mutual Fund Folio",
                "isin_no": unique_isin,  # use unique ID only to prevent overwriting in DB
                "fund_name": clean_fund_name(fund_name, "Mutual Fund"),
                "units": float(units.replace(",", "")),           # No. of Units
                "nav": float(current_nav.replace(",", "")),       # Current NAV per unit
                "invested_amount": float(total_cost.replace(",", "")),  # Total Cost
                "valuation": float(current_value.replace(",", "")),     # Current Value
                "category": category,
                "sub_category": sub_category
            })
            total_value += float(current_value.replace(",", ""))

    # === MUTUAL FUNDS (M) PARSING ===
    mf_patterns = [
        r"(INF[A-Z0-9]{9,})\s+([A-Za-z0-9\s\-\&\.\(\)\/#]+?(?:MUTUAL FUND|FUND)[^\n]*?)\s+([\d,]+\.?\d*)(?:\s+[\d,]+\.?\d*){2,}\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)",
        r"(INF[A-Z0-9]{9,})\s+([A-Za-z0-9\s\-\&\.\(\)\/#]+?)\s+([\d,]+\.?\d*)(?:\s+[\d,]+\.?\d*){2,6}\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)"
    ]

    for pattern in mf_patterns:
        for match in re.finditer(pattern, text, re.IGNORECASE):
            isin, fund_name, units, nav, value = match.groups()
            category, sub_category = classify_mutual_fund(fund_name)
            
            holdings.append({
                "type": "Mutual Fund",
                "isin_no": isin.strip(),
                "fund_name": clean_fund_name(fund_name, "Mutual Fund"),
                "units": float(units.replace(",", "")),
                "nav": float(nav.replace(",", "")),
                "invested_amount": 0.0,
                "valuation": float(value.replace(",", "")),
                "category": category,
                "sub_category": sub_category
            })
            total_value += float(value.replace(",", ""))

    # === KEEP ALL HOLDINGS ===
    valid_holdings = []

    for h in holdings:
        isin = h.get("isin_no", "").strip()
        
        if isin and isin == 'INFRASTRUCTURE' and len(isin) < 10:
            continue
            
        if h["valuation"] == 0 and h["units"] > 0 and h["nav"] > 0:
            h["valuation"] = round(h["units"] * h["nav"], 2)
            
        valid_holdings.append(h)
    
    return valid_holdings, total_value


# ---------------------------------------------------------
# STEP 5: Insert into Database (dedupe by ISIN only)
# ---------------------------------------------------------
def process_nsdl_file(
    file_path: str,
    user_id: int,
    portfolio_id: int,
    password: str | None = None,
    *,
    member_id: int | None = None,
):
    print(f"📘 Processing NSDL eCAS for user {user_id}, portfolio {portfolio_id}")

    text = extract_blocks_text(file_path, password)
    holdings, total_value = parse_nsdl_ecas_text(text)

    # ✅ Remove Mutual Fund duplicates already captured as Folios
    folio_isins = {h["isin_no"].split("_")[0] for h in holdings if h["type"] == "Mutual Fund Folio"}
    holdings = [
        h for h in holdings
        if not (h["type"] == "Mutual Fund" and h["isin_no"].split("_")[0] in folio_isins)
    ]

    # ✅ Remove exact duplicate equity entries (same ISIN, same units, same valuation)
    seen_equity_keys = set()
    unique_holdings = []

    for h in holdings:
        if h.get("type") == "Shares":
            key = (
                h.get("isin_no"),
                round(h.get("units") or 0.0, 4),
                round(h.get("valuation") or 0.0, 2)
            )
            if key in seen_equity_keys:
                continue
            seen_equity_keys.add(key)
        unique_holdings.append(h)

    holdings = unique_holdings

    # Debug: Print what we found
    print(f"📊 Found {len(holdings)} holdings:")
    for h in holdings:
        print(f"  - {h['type']}: {h['fund_name']} (ISIN: {h['isin_no']}) - Value: {h['valuation']}")

    conn = None
    try:
        conn = get_db_conn()
        cur = conn.cursor()

        seen_isins = set()
        seen_composites = set()
        inserted = 0

        for h in holdings:
            isin = (h.get("isin_no") or "").strip()
            units = float(h.get("units") or 0.0)
            nav = float(h.get("nav") or 0.0)
            valuation = float(h.get("valuation") or 0.0)
            htype = h.get("type") or ""
            fund_name = clean_fund_name(h.get("fund_name") or "", htype)

            # Skip entries without ISIN (except NPS)
            if not isin and htype:
                continue
                
            # Skip entries with invalid ISIN format
            # Skip entries with invalid ISIN format or 'INFRASTRUCTURE' placeholder
            if (
                not isin
                or len(isin) < 10
                or isin.strip().upper() == "INFRASTRUCTURE"
                or "INFRASTRUCTURE" in isin.strip().upper()
            ):
                continue


            if isin:
                # ✅ Allow same ISIN again if valuation differs (common in equities)
                existing_entry = next((h for h in holdings if h.get("isin_no") == isin), None)

                if isin in seen_isins:
                    if h.get("type") == "Shares":
                        # Allow duplicate if valuation differs
                        existing_val = existing_entry.get("valuation") if existing_entry else None
                        current_val = h.get("valuation")
                        if existing_val and abs(existing_val - current_val) > 1:
                            # Different valuation, so keep this record
                            pass
                        else:
                            continue
                    else:
                        continue

                seen_isins.add(isin)

            else:
                composite_key = (
                    htype,
                    fund_name,
                    round(units, 6),
                    round(nav, 6),
                    round(valuation, 2),
                )
                if composite_key in seen_composites:
                    continue
                seen_composites.add(composite_key)

            cur.execute(
                """
                INSERT INTO portfolios (
                    portfolio_id, user_id, member_id,
                    fund_name, isin_no, units, nav,
                    invested_amount, valuation,
                    category, sub_category, type, created_at
                )
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW())
                """,
                (
                    portfolio_id,
                    user_id,
                    member_id,
                    fund_name[:255],
                    isin,
                    units,
                    nav,
                    float(h.get("invested_amount") or 0.0),
                    valuation,
                    h.get("category") or "",
                    h.get("sub_category") or "",
                    htype,
                ),
            )
            inserted += 1

        conn.commit()
        cur.close()
        print(f"💾 Inserted {inserted} holdings into DB successfully")

    except Exception as e:
        if conn:
            conn.rollback()
        print(f"❌ Database insertion failed: {e}")
        raise
    finally:
        if conn:
            conn.close()

    return {"holdings": holdings, "total_value": total_value}
