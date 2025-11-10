import re
import unicodedata
import fitz  # PyMuPDF
from typing import List, Dict, Tuple
from db import get_db_conn


# -----------------------------------------------------
# PDF TEXT EXTRACTIONX
# -----------------------------------------------------
def extract_blocks_text(file_path: str, password: str | None = None) -> str:
    """Extract text from PDF preserving layout and stripping non-ASCII."""
    doc = fitz.open(file_path)
    if doc.needs_pass:
        if not password:
            raise ValueError("PDF requires a password.")
        if not doc.authenticate(password):
            raise ValueError("Invalid PDF password.")

    text = ""
    for page in doc:
        blocks = page.get_text("blocks")
        blocks.sort(key=lambda b: (b[1], b[0]))  # top-to-bottom, left-to-right
        for b in blocks:
            text += b[4] + "\n"

    text = re.sub(r"[^\x00-\x7F]+", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


# -----------------------------------------------------
# CATEGORY + SUBCATEGORY DETECTION
# -----------------------------------------------------
from typing import Tuple

def classify_instrument(fund_name: str) -> Tuple[str, str]:
    """
    Classify a mutual fund into SEBI-style Category and Subcategory.
    Covers Equity, Debt, Hybrid, Commodity, Sectoral, ESG, International, and Others.
    """

    name = fund_name.lower().strip()

    # --- 1️⃣ Commodity / Gold / REITs ---
    if "gold" in name:
        return "Commodity", "Gold"
    if "silver" in name:
        return "Commodity", "Silver"
    if any(k in name for k in ["reit", "invit", "real estate"]):
        return "Commodity", "REIT / InvIT"

    # --- 2️⃣ Hybrid Funds (check before Equity because of overlap like "Equity Hybrid") ---
    if any(k in name for k in [
        "balanced", "hybrid", "advantage", "asset allocator",
        "multi asset", "dynamic asset", "aggressive hybrid"
    ]):
        if "aggressive" in name:
            return "Hybrid", "Aggressive Hybrid"
        if "balanced" in name or "advantage" in name:
            return "Hybrid", "Balanced Advantage"
        if "multi asset" in name or "asset allocator" in name:
            return "Hybrid", "Multi Asset"
        return "Hybrid", "Hybrid"

    if "arbitrage" in name:
        return "Hybrid", "Arbitrage"
    if "equity savings" in name:
        return "Hybrid", "Equity Savings"

    # --- 3️⃣ Equity: Core Subtypes ---
    if "small cap" in name:
        return "Equity", "Small Cap"
    if "mid cap" in name:
        return "Equity", "Mid Cap"
    if "large cap" in name or "bluechip" in name:
        return "Equity", "Large Cap"
    if any(k in name for k in ["flexi", "multi cap", "multicap"]):
        return "Equity", "Flexi Cap"
    if "focused" in name:
        return "Equity", "Focused"
    if "elss" in name or "tax saver" in name:
        return "Equity", "ELSS / Tax Saving"
    if "contra" in name:
        return "Equity", "Contra"
    if "value" in name:
        return "Equity", "Value"
    if "dividend yield" in name or "dividend" in name:
        return "Equity", "Dividend Yield"

    # --- 4️⃣ Equity: Sectoral / Thematic / ESG / Index ---
    if any(k in name for k in [
        "bank", "financial", "psu", "infra", "infrastructure", "energy",
        "power", "auto", "manufacturing", "consumption", "pharma", "health",
        "it", "tech", "fmcg", "transport", "commodity", "defence",
        "chemical", "metal", "metals", "realty", "export", "service"
    ]):
        return "Equity", "Sectoral / Thematic"

    if any(k in name for k in ["esg", "responsible", "sustain"]):
        return "Equity", "ESG / Responsible"

    if any(k in name for k in ["index", "nifty", "sensex"]):
        return "Equity", "Index"

    if "equity" in name:
        return "Equity", "Equity Diversified"

    # --- 5️⃣ Debt / Fixed Income ---
    if any(k in name for k in [
        "debt", "income", "bond", "short term", "liquid", "credit", "corporate",
        "low duration", "overnight", "gilt", "treasury", "ultra short", "floating", "floater",
        "money market", "duration", "fund income"
    ]):
        if "overnight" in name:
            return "Debt", "Overnight"
        if "liquid" in name:
            return "Debt", "Liquid"
        if "money market" in name:
            return "Debt", "Money Market"
        if "low duration" in name:
            return "Debt", "Low Duration"
        if "short term" in name:
            return "Debt", "Short Duration"
        if "medium" in name or "long" in name:
            return "Debt", "Medium / Long Duration"
        if "corporate" in name or "credit" in name:
            return "Debt", "Corporate / Credit Risk"
        if "gilt" in name or "treasury" in name:
            return "Debt", "Gilt"
        if "floater" in name or "floating" in name:
            return "Debt", "Floating Rate"
        return "Debt", "Bond / Income"

    # --- 6️⃣ Fund of Funds (check before International) ---
    if "fund of funds" in name or "fof" in name:
        return "Others", "Fund of Funds"

    # --- 7️⃣ International / Global Funds ---
    if any(k in name for k in ["global", "international", "us", "overseas", "world"]):
        return "International", "Global / Overseas"

    # --- 8️⃣ Default Fallback ---
    return "Unclassified", "Unknown"


# -----------------------------------------------------
# PARSE ECAS TEXT
# -----------------------------------------------------
def parse_ecas_text(text: str) -> Tuple[List[Dict], float]:
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
            "units": float(str(units).replace(",", "")),
            "nav": float(str(nav).replace(",", "")),
            "invested_amount": float(str(invested).replace(",", "")),
            "valuation": float(str(valuation).replace(",", "")),
            "category": category,
            "sub_category": sub_category,
        })

    # ----------- EQUITIES -----------
    eq_pattern = re.compile(
        # Works for ISIN-first ECAS with multiple numeric columns (like yours)
        r"(INE[0-9A-Z]{9})\s+([A-Za-z0-9#&\-\(\)\.,\s]+?)"
        r"\s+(?:[\d\.\-]+\s+){0,6}?([\d,]+\.\d+)\s+([\d,]+\.\d+)\s+([\d,]+\.\d+)",
        re.IGNORECASE,
    )

    for m in eq_pattern.finditer(text):
        try:
            isin, company, units, nav, value = m.groups()
        except ValueError:
            print(f"⚠️ Skipping malformed equity line: {m.groups()}")
            continue

        # Skip footer lines like "Portfolio Value ₹ ..."
        if "portfolio value" in company.lower():
            continue

        # --- Clean company name ---
        company = re.sub(r"^[\s\)\(\-_:;|.,#']+", "", company.strip())
        company = re.sub(r"[\s\-\(\):;|.,#']+$", "", company)
        company = re.sub(r"\s{2,}", " ", company).strip()

        # --- Classify safely ---
        category, sub_category = classify_instrument(company) or (None, None)

        # --- Convert numeric fields ---
        def to_float(x):
            try:
                return float(str(x).replace(",", "").strip())
            except ValueError:
                return 0.0

        units_f = to_float(units)
        nav_f = to_float(nav)
        value_f = to_float(value)

        # ✅ Detect & fix misassigned NAV/Value
        # If nav_f * units_f ≈ value_f (within 2%), it's correct.
        # If nav_f > value_f, then value and nav were swapped in parsing.
        if nav_f > value_f:
            nav_f, value_f = value_f, nav_f

        # ✅ If valuation seems 0 but we have units and nav, compute it
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
            "category": category,
            "sub_category": sub_category,
        })

    # --- Normalize ---
    for h in holdings:
        h["isin_no"] = h["isin_no"].strip().upper()
        h["fund_name"] = re.sub(r"\s{2,}", " ", h.get("fund_name", "").strip())

    print("\n🔍 Parsed holdings with categories:")
    for h in holdings:
        print(
            f"{h['fund_name']:<55} | ISIN={h['isin_no']} | Units={h['units']} | "
            f"NAV={h['nav']} | Value={h['valuation']} | "
            f"Cat={h['category']} | Sub={h['sub_category']}"
        )

    total_value = sum(h["valuation"] for h in holdings if h["type"] == "Equity")
    return holdings, total_value


# -----------------------------------------------------
# PROCESS + STORE
# -----------------------------------------------------
def process_ecas_file(
    file_path: str,
    user_id: int,
    portfolio_id: int,
    password: str | None = None,
    *,
    member_id: int | None = None,
    aggregate_duplicates: bool = False,
    clear_existing: bool = False,
):
    text = extract_blocks_text(file_path, password)
    holdings, total_value = parse_ecas_text(text)

    print(f"\n✅ Parsed ECAS for user {user_id}, portfolio {portfolio_id}")
    if member_id:
        print(f"👨‍👩‍👧 Uploading for member_id={member_id}")
    print(f"✅ Total value: ₹{total_value:,.2f} | Holdings: {len(holdings)}\n")

    # Aggregate duplicate ISINs if needed
    if aggregate_duplicates:
        agg = {}
        for h in holdings:
            key = h["isin_no"].strip().upper() or f"{h.get('fund_name','')}_{len(agg)}"
            if key in agg:
                agg[key]["valuation"] += h.get("valuation", 0)
                agg[key]["invested_amount"] += h.get("invested_amount", 0)
                agg[key]["units"] += h.get("units", 0)
            else:
                agg[key] = {**h}
        holdings = list(agg.values())
        print(f"⚙️ Aggregated into {len(holdings)} holdings after dedupe")

    try:
        conn = get_db_conn()
        cur = conn.cursor()

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
            print(f"⚠️ Cleared existing rows for user {user_id}, portfolio {portfolio_id}")

        for h in holdings:
            cur.execute(
                """
                INSERT INTO portfolios (
                    portfolio_id, user_id, member_id, fund_name, isin_no,
                    units, nav, invested_amount, valuation,
                    category, sub_category, type, created_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                """,
                (
                    portfolio_id,
                    user_id,
                    member_id,
                    h.get("fund_name", "Unknown"),
                    h.get("isin_no", "N/A"),
                    h.get("units", 0.0),
                    h.get("nav", 0.0),
                    h.get("invested_amount", 0.0),
                    h.get("valuation", 0.0),
                    h.get("category", "Others"),
                    h.get("sub_category", "Unclassified"),
                    h.get("type", "Mutual Fund"),
                ),
            )

        conn.commit()
        print(f"💾 Inserted {len(holdings)} holdings into DB successfully")

    except Exception as e:
        if conn:
            conn.rollback()
        print(f"❌ DB insert failed: {e}")
        raise
    finally:
        if conn:
            cur.close()
            conn.close()

    return {"holdings": holdings, "total_value": total_value}
