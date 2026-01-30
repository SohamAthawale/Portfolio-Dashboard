import os
import re
import fitz  # PyMuPDF
from typing import List, Dict, Tuple
from db import get_db_conn
from dedupe_context import is_duplicate, mark_seen

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
    if not fund_name:
        return "Others", "Unclassified"
    
    name = fund_name.lower()
    
    # ELSS/Tax Saving
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
    
    # Sectoral/Thematic
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
    
    # Market Cap Categories
    if "small cap" in name: return "Equity", "Small Cap"
    if "mid cap" in name: return "Equity", "Mid Cap"
    if "large cap" in name: return "Equity", "Large Cap"
    if "large & mid cap" in name or "large and mid" in name:
        return "Equity", "Large & Mid Cap"
    
    # Flexi/Multi
    if any(term in name for term in ["flexi", "multi cap", "multicap"]):
        return "Equity", "Flexi Cap"
    
    # Focused
    if "focused" in name:
        return "Equity", "Focused"
    
    # Value / Contra
    if any(term in name for term in ["value", "contra"]):
        return "Equity", "Value"
    
    # Dividend Yield
    if "dividend yield" in name:
        return "Equity", "Dividend Yield"
    
    # Arbitrage
    if "arbitrage" in name:
        return "Hybrid", "Arbitrage"
    
    # Hybrid
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
        return "Hybrid", "Aggressive Hybrid"
    
    # Debt Categories
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
    
    # Commodity
    if any(term in name for term in ["gold", "silver", "commodity"]):
        return "Commodity", "Gold" if "gold" in name else "Other Commodity"
    
    # International
    if any(term in name for term in ["international", "global", "us", "usa", "america", "europe", "asia"]):
        return "International", "Global Equity"
    
    # FoF
    if any(term in name for term in ["fund of fund", "fof"]):
        return "Fund of Funds", "Domestic FoF" if "international" not in name else "International FoF"
    
    # Default equity/debt
    if any(term in name for term in ["equity", "growth"]):
        return "Equity", "Diversified"
    if any(term in name for term in ["debt", "income", "bond"]):
        return "Debt", "Medium Duration"
    
    return "Others", "Unclassified"


# ---------------------------------------------------------
# STEP 4: Parse NSDL Text (Enhanced for all formats)
# ---------------------------------------------------------
def parse_nsdl_ecas_text(text: str) -> Tuple[List[Dict], float]:
    holdings = []
    total_value = 0.0

    # === EQUITIES PARSING === (UNCHANGED)
    equity_patterns = [
        r"(IN[E0-9][A-Z0-9]{9,})\s+([A-Z0-9&\-\.\s#/\(\)]+?)\s+([\d,]+\.?\d*)\s+[\d,]+\.?\d*\s+[\d,]+\.?\d*\s+[\d,]+\.?\d*\s+[\d,]+\.?\d*\s+[\d,]+\.?\d*\s+[\d,]+\.?\d*\s+[\d,]+\.?\d*\s+[\d,]+\.?\d*\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)",
        r"(IN[E0-9][A-Z0-9]{9,})\s+([A-Z0-9&\-\.\s#/\(\)]+?)\s+([\d,]+\.?\d*)(?:\s+[\d,]+\.?\d*){2,}\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)",
        r"(IN[E0-9][A-Z0-9]{9,})\s+([A-Za-z0-9\s\-\&\.\(\)\/#]+?)\s+([\d,]+(?:\.\d+)?)(?:\s+[\d,]+(?:\.\d+)?){2,8}\s+([\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)"
    ]

    for pattern in equity_patterns:
        for match in re.finditer(pattern, text, re.IGNORECASE):
            isin, security_name, units, nav, value = match.groups()
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

    # === MUTUAL FUND FOLIO PARSING (UNCHANGED) ===
    mf_folio_patterns = [
        r"(INF[A-Z0-9]{9,})\s+(?:NOT AVAILABLE\s+)?([A-Za-z0-9\s\-\&\.\(\)\/#]+?(?:Fund|Scheme|Plan)[^\n]*?)\s+[\d,]+\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)",
        r"(INF[A-Z0-9]{9,})\s+(?:NOT AVAILABLE\s+)?([A-Za-z0-9\s\-\&\.\(\)\/#]+?)\s+[\d,]+\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)"
    ]

    folio_index = 1

    for pattern in mf_folio_patterns:
        for match in re.finditer(pattern, text, re.IGNORECASE):
            groups = match.groups()

            if len(groups) == 9:
                isin, fund_name, units, avg_cost, total_cost, current_nav, current_value, _, _ = groups
            elif len(groups) == 7:
                isin, fund_name, units, avg_cost, total_cost, current_nav, current_value = groups
            else:
                continue

            if not isin.startswith("INF") or len(isin) < 10:
                continue

            category, sub_category = classify_mutual_fund(fund_name)
            unique_isin = f"{isin.strip()}_{folio_index}"
            folio_index += 1

            holdings.append({
                "type": "Mutual Fund Folio",
                "isin_no": unique_isin,
                "fund_name": clean_fund_name(fund_name, "Mutual Fund"),
                "units": float(units.replace(",", "")),
                "nav": float(current_nav.replace(",", "")),
                "invested_amount": float(total_cost.replace(",", "")),
                "valuation": float(current_value.replace(",", "")),
                "category": category,
                "sub_category": sub_category
            })

            total_value += float(current_value.replace(",", ""))

    # === MUTUAL FUND (M) PARSING (UNCHANGED) ===
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
    # ---------------------------------------------------------------------------
    # ✅ ADDITION 1 — GOVERNMENT SECURITIES (G)
    # ---------------------------------------------------------------------------
    # === GOVERNMENT SECURITIES (G) PARSING ===
    gov_patterns = [
    # Full row — many numeric columns between security and NAV
    r"(IN0\d{9})\s+([A-Za-z0-9\-\&\.\s#/\(\)%]+?)\s+([\d,]+\.?\d*)(?:\s+[\d,]+\.?\d*){5,10}\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)",

    # Flexi version — if column counts vary
    r"(IN0\d{9})\s+([A-Za-z0-9\-\&\.\s#/\(\)%]+?)\s+([\d,]+(?:\.\d+)?)(?:\s+[\d,]+(?:\.\d+)?){3,12}\s+([\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)"
]


    for pattern in gov_patterns:
        for match in re.finditer(pattern, text, re.IGNORECASE):

            isin, sec_name, units, nav, value = match.groups()

            holdings.append({
                "type": "Govt Security",
                "isin_no": isin.strip(),
                "fund_name": clean_fund_name(sec_name, "Govt Security"),
                "units": float(units.replace(",", "")),
                "nav": float(nav.replace(",", "")),
                "invested_amount": 0.0,
                "valuation": float(value.replace(",", "")),
                "category": "Government Securities",
                "sub_category": "Govt Bond"
            })

            total_value += float(value.replace(",", ""))


    # ---------------------------------------------------------------------------
    # ✅ ADDITION 2 — NPS TIER I PARSER
    # ---------------------------------------------------------------------------
    nps_pattern = re.compile(
        r"([A-Za-z0-9\-\&\.\(\)\/#\s]+?TIER\s+[I|II]+)\s+"
        r"([\d,]+\.\d+)\s+"     # Units
        r"([\d,]+\.\d+)\s+"     # NAV
        r"([\d,]+\.\d+)",        # Value
        re.IGNORECASE
    )

    for m in nps_pattern.finditer(text):
        scheme, units, nav, value = m.groups()

        # ✅ ONLY capture real pension schemes
        if "pension" not in scheme.lower():
            continue

        holdings.append({
            "type": "NPS",
            "isin_no": "",  # NPS DOES NOT HAVE ISIN
            "fund_name": clean_fund_name(scheme, "NPS"),
            "units": float(units.replace(",", "")),
            "nav": float(nav.replace(",", "")),
            "invested_amount": 0.0,
            "valuation": float(value.replace(",", "")),
            "category": "NPS",
            "sub_category": "Tier I"
        })



    # ---------------------------------------------------------------------------
    # ✅ CORPORATE BONDS (C)
    # ---------------------------------------------------------------------------
    # === CORPORATE BONDS (C) PARSING ===
    corp_patterns = [
        # Full row — many numeric columns between security name and NAV
        r"(IN[E][A-Z0-9]{9})\s+([A-Za-z0-9\-\&\.\s#/\(\)%]+?)\s+([\d,]+\.?\d*)"
        r"(?:\s+[\d,]+\.?\d*){5,10}\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)",

        # Flexi version — if column counts vary (3–12 numeric columns)
        r"(IN[E][A-Z0-9]{9})\s+([A-Za-z0-9\-\&\.\s#/\(\)%]+?)\s+([\d,]+(?:\.\d+)?)"
        r"(?:\s+[\d,]+(?:\.\d+)?){3,12}\s+([\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)"
        ]



    for pattern in corp_patterns:
        for m in re.finditer(pattern, text):
            isin, sec_name, units, market_price, value = m.groups()
            holdings.append({
                "type": "Corporate Bond",
                "isin_no": isin.strip(),
                "fund_name": clean_fund_name(sec_name, "Corporate Bond"),
                "units": float(units.replace(",", "")),
                "nav": float(market_price.replace(",", "")),
                "invested_amount": 0.0,
                "valuation": float(value.replace(",", "")),
                "category": "Corporate Bonds",
                "sub_category": "Corporate Bond"
            })

            total_value += float(value.replace(",", ""))


    # === KEEP ALL HOLDINGS === (UNCHANGED)
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
    file_type: str,
    user_id: int,
    portfolio_id: int,
    password: str | None = None,
    *,
    member_id: int | None = None,
):
    print(f"📘 Processing NSDL eCAS for user {user_id}, portfolio {portfolio_id}")

    text = extract_blocks_text(file_path, password)
    holdings, total_value = parse_nsdl_ecas_text(text)

    # REMOVE DUPES for MF (UNCHANGED)
    folio_isins = {h["isin_no"].split("_")[0] for h in holdings if h["type"] == "Mutual Fund Folio"}
    holdings = [
        h for h in holdings
        if not (h["type"] == "Mutual Fund" and h["isin_no"].split("_")[0] in folio_isins)
    ]

    # REMOVE EXACT EQUITY DUPES (UNCHANGED)
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

    # DEBUG PRINTS (UNCHANGED)
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
            # ONLY evaluate dedupe on FINAL accepted holdings
            isin = (h.get("isin_no") or "").strip()

            if is_duplicate(h):
                cur.execute(
                    """
                    INSERT INTO portfolio_duplicates (
                        portfolio_id, user_id, member_id,
                        isin_no, fund_name, units, nav, valuation,
                        file_type, source_file
                    )
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    """,
                    (
                        portfolio_id,
                        user_id,
                        member_id,
                        isin,
                        h.get("fund_name"),
                        h.get("units"),
                        h.get("nav"),
                        h.get("valuation"),
                        file_type,
                        os.path.basename(file_path),
                    ),
                )
                continue


            isin = (h.get("isin_no") or "").strip()
            units = float(h.get("units") or 0.0)
            nav = float(h.get("nav") or 0.0)
            valuation = float(h.get("valuation") or 0.0)
            htype = h.get("type") or ""
            fund_name = clean_fund_name(h.get("fund_name") or "", htype)

            # FIX NPS INSERTION (Your condition was wrong)
            if not isin and htype != "NPS":
                continue

            # SKIP INVALID ISIN (UNCHANGED)
            if (
                isin 
                and (len(isin) < 10 or "INFRASTRUCTURE" in isin.upper())
            ):
                continue

            # DEDUPE ISIN-BASED (UNCHANGED)
            if isin:
                existing_entry = next((x for x in holdings if x.get("isin_no") == isin), None)

                if isin in seen_isins:
                    if h.get("type") == "Shares":
                        existing_val = existing_entry.get("valuation") if existing_entry else None
                        current_val = h.get("valuation")
                        if existing_val and abs(existing_val - current_val) > 1:
                            pass
                        else:
                            continue
                    else:
                        continue

                seen_isins.add(isin)
            else:
                # NPS & Non-ISIN ITEMS
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
            mark_seen(h) 
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
