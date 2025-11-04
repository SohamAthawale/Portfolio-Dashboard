import re
import fitz  # PyMuPDF
from typing import List, Dict, Tuple
from db import get_db_conn


# ------------------ PDF TEXT EXTRACTION ------------------
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

    # Clean up weird characters and spacing
    text = re.sub(r"[^\x00-\x7F]+", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


# ------------------ PARSE TEXT INTO HOLDINGS ------------------
def parse_ecas_text(text: str) -> Tuple[List[Dict], float]:
    holdings = []

    # Extract total portfolio value (best-effort)
    total_match = re.search(r"Total Portfolio Value[^\d₹]*₹?\s*([\d,]+\.\d+)", text)
    total_value = float(total_match.group(1).replace(",", "")) if total_match else 0.0

    # ------------------ MUTUAL FUNDS ------------------
    mf_pattern = re.compile(
        r"(?:\d+|Profit/Loss\s*INR\)?\s*)?"
        r"([A-Z0-9]{0,6}\s*[-]?\s*[A-Za-z0-9\-\(\)&/ ]+?Fund[^\n\r]{0,80})"
        r"\s+(INF[0-9A-Z]{9}|INE[0-9A-Z]{9})"
        r"[\s\S]{0,120}?"
        r"(?:[\d,]+\.\d+\s+){0,3}([\d,]+\.\d+)",
        re.IGNORECASE,
    )

    for m in mf_pattern.finditer(text):
        fund_name, isin, value = m.groups()
        fund_name = re.sub(
            r"^[\s\)\(\-_:;|.,#']*(?:\d+\s*|Profit/Loss\s*INR\)?\s*)*", "", fund_name.strip()
        )
        fund_name = re.sub(r"^(?:[A-Z]\s*[-]\s+|[-,:;|.]\s+)+", "", fund_name)
        fund_name = re.sub(r"[\s\-\(\):;|.,#']+$", "", fund_name)
        fund_name = re.sub(r"\s{2,}", " ", fund_name).strip()

        holdings.append({
            "type": "Mutual Fund",
            "fund_name": fund_name,
            "isin_no": isin.strip(),
            "closing_balance": float(str(value).replace(",", "").strip()),
        })

    # ------------------ EQUITIES (INE first) ------------------
    eq_pattern = re.compile(
        r"(INE[0-9A-Z]{9})\s+([A-Z0-9#&\-\s]+?)\s+(?:[\d\.\-]+\s+){2,6}([\d,]+\.\d+)",
        re.IGNORECASE,
    )
    for m in eq_pattern.finditer(text):
        isin, company, value = m.groups()

        company = re.sub(r"^[\s\)\(\-_:;|.,#']+", "", company)
        company = re.sub(r"[\s\-\(\):;|.,#']+$", "", company)
        company = re.sub(r"\s{2,}", " ", company).strip()

        holdings.append({
            "type": "Equity",
            "fund_name": company,
            "isin_no": isin.strip(),
            "closing_balance": float(str(value).replace(",", "").strip()),
        })

    # ------------------ GENERIC FALLBACK ------------------
    generic_pattern = re.compile(
        r"([A-Z0-9#&\-\s]+?)\s+(INF[0-9A-Z]{9}|INE[0-9A-Z]{9})\s+[\d,\.]+\s+₹\s*([\d,]+\.\d+)",
        re.IGNORECASE,
    )
    for m in generic_pattern.finditer(text):
        name, isin, value = m.groups()
        isin = isin.strip().upper()
        name = re.sub(r"^[\s\)\(\-_:;|.,#']+", "", name)
        name = re.sub(r"[\s\-\(\):;|.,#']+$", "", name)
        name = re.sub(r"\s{2,}", " ", name).strip()
        type_ = "Equity" if "INE" in isin else "Mutual Fund"
        holdings.append({
            "type": type_,
            "fund_name": name,
            "isin_no": isin,
            "closing_balance": float(str(value).replace(",", "").strip()),
        })

    # ------------------ NORMALIZATION ------------------
    def canonical_isin(raw: str) -> str:
        if not raw:
            return ""
        raw = raw.strip().upper()
        m = re.search(r"(IN[EF][0-9A-Z]{9})", raw)
        return m.group(1) if m else raw

    for h in holdings:
        h["isin_no"] = canonical_isin(h.get("isin_no", ""))
        h["fund_name"] = re.sub(r"\s{2,}", " ", h.get("fund_name", "").strip())

    # Debug
    print("\n🔍 Parsed holdings (debug):")
    for h in holdings:
        print(
            f" - {h.get('fund_name')!r} | ISIN={h.get('isin_no')!r} | Type={h.get('type')} | Value={h.get('closing_balance')}"
        )

    # Reclassify any INF/INE mismatches
    for h in holdings:
        if "INE" in h["isin_no"] and h["type"] == "Mutual Fund":
            print(f"⚙️ Reclassifying {h['isin_no']} ({h['fund_name']}) → Equity")
            h["type"] = "Equity"

    return holdings, total_value


# ------------------ PROCESS + STORE ------------------
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
    """
    Parse ECAS PDF and insert holdings into the portfolios table.

    - member_id: optional, used when uploading for a family member
    - aggregate_duplicates=False (default): insert every parsed holding
    - aggregate_duplicates=True: combine holdings by ISIN before insert
    - clear_existing=False (default): if True, deletes existing rows first
    """
    text = extract_blocks_text(file_path, password)
    holdings, total_value = parse_ecas_text(text)

    print(f"\n✅ Parsed ECAS for user {user_id}, portfolio {portfolio_id}")
    if member_id:
        print(f"👨‍👩‍👧 Uploading for member_id={member_id}")
    print(f"✅ Total value: ₹{total_value:,.2f} | Holdings: {len(holdings)}\n")

    if aggregate_duplicates:
        agg = {}
        for h in holdings:
            key = h["isin_no"].strip().upper()
            if not key:
                key = f"{h.get('fund_name','')}_{len(agg)}"
            amt = float(h.get("closing_balance", 0) or 0)
            if key in agg:
                agg[key]["closing_balance"] += amt
            else:
                agg[key] = {
                    "fund_name": h.get("fund_name", "Unknown"),
                    "isin_no": key,
                    "type": h.get("type", "Mutual Fund"),
                    "closing_balance": amt,
                }
        holdings = [v for v in agg.values()]
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

        inserted = 0
        for h in holdings:
            fund_name = h.get("fund_name", "Unknown")
            isin_no = h.get("isin_no", "N/A")
            type_ = h.get("type", "Mutual Fund")
            value = float(h.get("closing_balance", 0) or 0)

            cur.execute(
                """
                INSERT INTO portfolios (
                    portfolio_id, user_id, member_id, fund_name, isin_no,
                    closing_balance, type, created_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, NOW())
                """,
                (
                    portfolio_id,
                    user_id,
                    member_id,
                    fund_name,
                    isin_no,
                    value,
                    type_,
                ),
            )
            inserted += 1

        conn.commit()
        print(f"💾 Inserted {inserted} holdings into DB successfully")

    except Exception as e:
        if conn:
            conn.rollback()
        print(f"❌ DB insert failed: {e}")
        raise e
    finally:
        if conn:
            cur.close()
            conn.close()

    return {"holdings": holdings, "total_value": total_value}
