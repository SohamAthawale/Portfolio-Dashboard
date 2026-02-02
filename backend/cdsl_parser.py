import os
import re
import unicodedata
import fitz
from typing import List, Dict, Tuple
from db import get_db_conn
from dedupe_context import is_duplicate, mark_seen

# =====================================================
# 1️⃣ PDF TEXT EXTRACTION
# =====================================================
def extract_blocks_text(file_path: str, password: str | None = None) -> str:
    """Extract text from CDSL eCAS preserving layout order and stripping non-ASCII."""
    doc = fitz.open(file_path)
    if doc.needs_pass:
        if not password:
            raise ValueError("PDF requires a password.")
        if not doc.authenticate(password):
            raise ValueError("Invalid PDF password.")

    text = ""
    for page in doc:
        blocks = page.get_text("blocks")
        blocks.sort(key=lambda b: (b[1], b[0]))  # top→bottom, left→right
        for b in blocks:
            blk_text = b[4]
            blk_text = re.sub(r"[^\x00-\x7F]+", " ", blk_text)
            text += blk_text + "\n"

    text = re.sub(r"\s+", " ", text)
    return text.strip()


# =====================================================
# 2️⃣ CATEGORY + SUBCATEGORY DETECTION
# =====================================================
def classify_instrument(fund_name: str) -> Tuple[str, str]:
    """Enhanced classification of mutual funds and equities by SEBI-style categories."""
    if not fund_name:
        return "Unclassified", "Unknown"
        
    name = fund_name.lower().strip()

    # ===== SOLUTION ORIENTED & SPECIAL SCHEMES (Highest Priority) =====
    if any(k in name for k in ["retirement", "pension"]):
        return "Solution Oriented", "Retirement"
    if any(k in name for k in ["children", "child plan", "education"]):
        return "Solution Oriented", "Children's"
    
    # ===== COMMODITY & ALTERNATIVES =====
    if "gold" in name:
        return "Commodity", "Gold"
    if "silver" in name:
        return "Commodity", "Silver"
    if any(k in name for k in ["reit", "invit", "real estate", "realty"]):
        return "Alternative", "REIT / InvIT"
    if "commodity" in name:
        return "Commodity", "Other Commodity"

    # ===== HYBRID FUNDS =====
    hybrid_patterns = [
        (["arbitrage"], "Arbitrage"),
        (["equity savings"], "Equity Savings"),
        (["conservative hybrid"], "Conservative Hybrid"),
        (["aggressive hybrid"], "Aggressive Hybrid"),
        (["balanced advantage", "dynamic asset"], "Balanced Advantage"),
        (["multi asset"], "Multi Asset Allocation"),
        (["hybrid"], "Aggressive Hybrid")  # default
    ]
    
    for keywords, subcat in hybrid_patterns:
        if any(keyword in name for keyword in keywords):
            return "Hybrid", subcat

    # ===== EQUITY FUNDS =====
    # ELSS (Tax Saving) - High priority
    if any(k in name for k in ["elss", "tax saver", "tax savings", "80c"]):
        return "Equity", "ELSS"
    
    # Market Cap Based
    if "small cap" in name:
        return "Equity", "Small Cap"
    if "mid cap" in name:
        return "Equity", "Mid Cap"
    if "large cap" in name or "bluechip" in name:
        return "Equity", "Large Cap"
    if "large & mid cap" in name or "large and mid" in name:
        return "Equity", "Large & Mid Cap"
    
    # Multi Cap & Flexi Cap
    if any(k in name for k in ["flexi cap", "flexicap"]):
        return "Equity", "Flexi Cap"
    if any(k in name for k in ["multi cap", "multicap"]):
        return "Equity", "Multi Cap"
    
    # Focused Funds
    if "focused" in name:
        return "Equity", "Focused"
    
    # Value/Contra Funds
    if "contra" in name:
        return "Equity", "Contra"
    if "value" in name:
        return "Equity", "Value"
    
    # Dividend Yield
    if "dividend yield" in name:
        return "Equity", "Dividend Yield"
    
    # Sectoral/Thematic Funds
    sectoral_keywords = {
        "Banking & Financial Services": ["bank", "financial", "bfsi", "psu bank"],
        "Infrastructure": ["infra", "infrastructure"],
        "Technology": ["technology", "tech", "it", "software"],
        "Pharma & Healthcare": ["pharma", "pharmaceutical", "healthcare", "health"],
        "Consumption": ["consumption", "consumer", "fmcg"],
        "Auto & Auto Ancillaries": ["auto", "automobile"],
        "Energy": ["energy", "power", "oil & gas"],
        "Manufacturing": ["manufacturing", "capital goods"],
        "Metals & Mining": ["metal", "mining"],
        "Media & Entertainment": ["media", "entertainment"],
        "Chemicals": ["chemical", "specialty chemical"],
        "Real Estate": ["realty", "real estate"],
        "Transportation & Logistics": ["transport", "logistics"],
        "Defence": ["defence", "defense"],
        "ESG": ["esg", "responsible", "sustainable", "sustainability"]
    }
    
    for sector, keywords in sectoral_keywords.items():
        if any(keyword in name for keyword in keywords):
            return "Equity", f"Sectoral - {sector}"
    
    # Index Funds
    if any(k in name for k in ["index", "nifty", "sensex", "bse"]):
        return "Equity", "Index"
    
    # Default Equity
    if "equity" in name:
        return "Equity", "Diversified"

    # ===== DEBT FUNDS =====
    debt_patterns = [
        (["overnight"], "Overnight"),
        (["liquid"], "Liquid"),
        (["money market"], "Money Market"),
        (["ultra short", "ultrashort"], "Ultra Short Duration"),
        (["low duration"], "Low Duration"),
        (["short term", "short duration"], "Short Duration"),
        (["medium duration", "medium term"], "Medium Duration"),
        (["medium to long", "long term", "long duration"], "Medium to Long Duration"),
        (["gilt", "government security"], "Gilt"),
        (["dynamic bond"], "Dynamic Bond"),
        (["corporate bond"], "Corporate Bond"),
        (["credit risk", "credit opportunities"], "Credit Risk"),
        (["banking & psu", "psu bond"], "Banking & PSU"),
        (["floater", "floating rate"], "Floating Rate"),
        (["debt", "income", "bond"], "Medium Duration")  # default debt
    ]
    
    for keywords, subcat in debt_patterns:
        if any(keyword in name for keyword in keywords):
            return "Debt", subcat

    # ===== FUND OF FUNDS =====
    if any(k in name for k in ["fund of funds", "fof"]):
        if any(k in name for k in ["international", "global", "overseas"]):
            return "Fund of Funds", "International FoF"
        return "Fund of Funds", "Domestic FoF"

    # ===== INTERNATIONAL FUNDS =====
    international_patterns = [
        (["us", "usa", "america", "s&p", "nasdaq"], "US Focused"),
        (["global", "world", "international"], "Global"),
        (["asia", "china", "japan", "emerging"], "Asia/EM"),
        (["europe", "euro", "germany", "uk"], "Europe")
    ]
    
    for keywords, subcat in international_patterns:
        if any(keyword in name for keyword in keywords):
            return "International", subcat

    # ===== INFERENCE FROM COMMON WORDS =====
    words = set(name.split())
    equity_indicators = {"growth", "cap", "equity", "mid", "small", "large", "sector"}
    debt_indicators = {"income", "bond", "gilt", "duration", "credit", "corporate"}
    
    if words.intersection(equity_indicators):
        return "Equity", "Diversified"
    if words.intersection(debt_indicators):
        return "Debt", "Medium Duration"

    # ===== INDIVIDUAL STOCKS/ETFs =====
    if any(k in name for k in ["equity shares", "share", "stock", "etf"]):
        return "Equity", "Individual Stock"

    return "Unclassified", "Unknown"


# =====================================================
# 3️⃣ PARSE CDSL ECAS TEXT
# =====================================================
def parse_cdsl_ecas_text(text: str) -> Tuple[List[Dict], float]:
    holdings = []

    total_match = re.search(r"Total Portfolio Value[^\d₹]*₹?\s*([\d,]+\.\d+)", text)
    total_value = float(total_match.group(1).replace(",", "")) if total_match else 0.0

    # ----------- MUTUAL FUNDS -----------
    mf_pattern = re.compile(
        r"([A-Za-z0-9&\-\(\)/ ]+?Fund[^\n\r]{0,80})"  # Scheme name
        r"\s+(INF[0-9A-Z]{9})"
        r"(?:\s+[A-Z0-9/\-]+){0,3}"
        r"\s+([\d,]+\.\d+)"  # Units
        r"\s+([\d,]+\.\d+)"  # NAV
        r"\s+([\d,]+\.\d+)"  # Invested
        r"\s+([\d,]+\.\d+)", # Valuation
        re.IGNORECASE,
    )

    for m in mf_pattern.finditer(text):
        fund_name, isin, units, nav, invested, valuation = m.groups()
        fund_name = unicodedata.normalize("NFKC", fund_name)
        fund_name = re.sub(r"[\u00A0\u200B\u200C\u200D\uFEFF]", " ", fund_name)  # invisible spaces
        fund_name = re.sub(r"[–—−]", "-", fund_name)                             # fancy hyphens → normal
        fund_name = re.sub(r"[^\x20-\x7E]", "", fund_name)                       # strip non-printables

        # --- Join multi-line fund names ---
        fund_name = re.sub(r"\s*\n\s*", " ", fund_name)
        fund_name = re.sub(r"\s{2,}", " ", fund_name).strip()

        # --- If there's a ')' followed by a word, remove everything before that ')' ---
        # Example: ") Regular Direct terms - in INR) D464D - SBI..." → "D464D - SBI..."
        fund_name = re.sub(r"^[^)]*\)\s*(?=\w)", "", fund_name)

        # --- Remove known ECAS prefixes like "Regular Direct terms - in INR)" ---
        fund_name = re.sub(
            r"""(?ix)
            ^\s*
            (?:regular\s+direct\s*terms?|
            regular\s*terms?|
            direct\s*terms?|
            regular\s+direct|
            regular|
            direct)
            \s*[-:;()]*\s*
            (?:in\s*inr\)*)?
            \s*
            """,
            "",
            fund_name.strip()
        )
        fund_name = re.sub(
            r"(?i)^\s*profit\s*/?\s*loss\s*inr\)?\s*",
            "",
            fund_name.strip()
        )

        # --- Remove leading row numbers but keep scheme codes (e.g., '48 D033 -' -> 'D033 -') ---
        fund_name = re.sub(r"^\s*\d{1,3}\s+([A-Z0-9]{2,10}\s*-)", r"\1", fund_name)

        # --- Final cleanup for punctuation and spaces ---
        fund_name = re.sub(r"^[\s\-\:\;\,\|\.#']+", "", fund_name)
        fund_name = re.sub(r"[\s\-\:\;\,\|\.#']+$", "", fund_name)
        fund_name = re.sub(r"\s{2,}", " ", fund_name).strip()

        category, sub_category = classify_instrument(fund_name)
        holdings.append({
            "type": "Mutual Fund",
            "fund_name": fund_name,
            "isin_no": isin.strip(),
            "units": float(units.replace(",", "")),
            "nav": float(nav.replace(",", "")),
            "invested_amount": float(invested.replace(",", "")),
            "valuation": float(valuation.replace(",", "")),
            "category": category,
            "sub_category": sub_category,
        })

    # ----------- EQUITIES -----------
    eq_pattern = re.compile(
        r"(INE[0-9A-Z]{9})\s+([A-Za-z0-9#&\-\(\)\.,\s]+?)"
        r"\s+(?:[\d\.\-]+\s+){0,6}?([\d,]+\.\d+)\s+([\d,]+\.\d+)\s+([\d,]+\.\d+)",
        re.IGNORECASE,
    )

    for m in eq_pattern.finditer(text):
        isin, company, units, nav, value = m.groups()

        if "portfolio value" in company.lower():
            continue

        company = re.sub(r"^[\s\)\(\-_:;|.,#']+", "", company.strip())
        company = re.sub(r"[\s\-\(\):;|.,#']+$", "", company)
        company = re.sub(r"\s{2,}", " ", company).strip()


        def to_float(x):
            try:
                return float(str(x).replace(",", "").strip())
            except:
                return 0.0

        units_f = to_float(units)
        nav_f = to_float(nav)
        value_f = to_float(value)

        if nav_f > value_f:
            nav_f, value_f = value_f, nav_f

        if not value_f and units_f and nav_f:
            value_f = units_f * nav_f

        holdings.append({
            "type": "Shares",
            "fund_name": company,
            "isin_no": isin.strip(),
            "units": units_f,
            "nav": nav_f,
            "invested_amount": 0.0,
            "valuation": value_f,
            "category": 'Shares',
            "sub_category": 'Shares',
        })

    total_value = sum(h["valuation"] for h in holdings)
    print(f"✅ Parsed {len(holdings)} CDSL holdings | Total ₹{total_value:,.2f}")
    return holdings, total_value


# =====================================================
# 4️⃣ PROCESS + DB INSERTION
# =====================================================
def process_cdsl_file(
    file_path: str,
    user_id: int,
    portfolio_id: int,
    password: str | None = None,
    *,
    member_id: int | None = None,
    clear_existing: bool = False,
    file_type: str,
):
    print(f"📗 Processing CDSL eCAS for user {user_id}, portfolio {portfolio_id}")

    text = extract_blocks_text(file_path, password)
    holdings, total_value = parse_cdsl_ecas_text(text)
    source = os.path.basename(file_path)
    inserted = 0

    def normalize_type(t: str) -> str:
        t = (t or "").strip().lower()
        if t in {"mutual fund", "mutual", "mf", "mutual fund folio", "folio"}:
            return "mutual fund"
        if t in {"equity", "share", "shares", "stock", "stocks"}:
            return "equity"
        if t == "nps":
            return "nps"
        if t in {"govt security", "government security"}:
            return "govt security"
        if t in {"corporate bond", "bond"}:
            return "corporate bond"
        return ""

    try:
        conn = get_db_conn()
        cur = conn.cursor()

        # --------------------------------------------------
        # OPTIONAL CLEAR EXISTING
        # --------------------------------------------------
        if clear_existing:
            if member_id:
                cur.execute(
                    "DELETE FROM portfolios WHERE user_id=%s AND member_id=%s AND portfolio_id=%s",
                    (user_id, member_id, portfolio_id),
                )
            else:
                cur.execute(
                    "DELETE FROM portfolios WHERE user_id=%s AND portfolio_id=%s AND member_id IS NULL",
                    (user_id, portfolio_id),
                )

        for h in holdings:
            h["source_file"] = source
            htype = normalize_type(h.get("type"))

            # --------------------------------------------------
            # DUPLICATES → portfolio_duplicates (FULL METADATA)
            # --------------------------------------------------
            if is_duplicate(h):
                cur.execute(
                    """
                    INSERT INTO portfolio_duplicates (
                        portfolio_id, user_id, member_id,
                        isin_no, fund_name,
                        units, nav,
                        invested_amount, valuation,
                        category, sub_category, type,
                        file_type, source_file
                    )
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    """,
                    (
                        portfolio_id,
                        user_id,
                        member_id,
                        h.get("isin_no"),
                        h.get("fund_name"),
                        float(h.get("units") or 0.0),
                        float(h.get("nav") or 0.0),
                        float(h.get("invested_amount") or 0.0),
                        float(h.get("valuation") or 0.0),
                        h.get("category") or "",
                        h.get("sub_category") or "",
                        htype,
                        file_type,
                        source,
                    ),
                )
                continue

            # --------------------------------------------------
            # NORMAL INSERT → portfolios
            # --------------------------------------------------
            cur.execute(
                """
                INSERT INTO portfolios (
                    portfolio_id, user_id, member_id,
                    fund_name, isin_no,
                    units, nav, invested_amount, valuation,
                    category, sub_category, type, created_at
                )
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW())
                """,
                (
                    portfolio_id,
                    user_id,
                    member_id,
                    h["fund_name"],
                    h["isin_no"],
                    float(h.get("units") or 0.0),
                    float(h.get("nav") or 0.0),
                    float(h.get("invested_amount") or 0.0),
                    float(h.get("valuation") or 0.0),
                    h.get("category") or "",
                    h.get("sub_category") or "",
                    htype,
                ),
            )

            mark_seen(h)
            inserted += 1

        conn.commit()
        print(f"💾 Inserted {inserted} unique holdings into DB successfully")

    except Exception:
        if conn:
            conn.rollback()
        raise
    finally:
        if conn:
            conn.close()

    return {"holdings": holdings, "total_value": total_value}
