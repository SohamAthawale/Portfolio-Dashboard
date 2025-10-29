# ecasparser.py
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
        blocks.sort(key=lambda b: (b[1], b[0]))
        for b in blocks:
            text += b[4] + "\n"

    text = re.sub(r"[^\x00-\x7F]+", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()

# ------------------ PARSE TEXT INTO HOLDINGS ------------------
def parse_ecas_text(text: str) -> Tuple[List[Dict], float]:
    holdings = []
    total_match = re.search(r"Total Portfolio Value[^\d₹]*₹?\s*([\d,]+\.\d+)", text)
    total_value = float(total_match.group(1).replace(",", "")) if total_match else 0.0

    # Mutual funds
    mf_pattern = re.compile(
        r"([A-Z0-9\- ]+\s*[-]?\s*[A-Za-z0-9\-\(\)&/ ]+?)\s+"
        r"(INF[0-9A-Z]{9})\s+\S+\s+[\d\.]+\s+[\d\.]+\s+[\d,]+\.\d+\s+([\d,]+\.\d+)",
        re.IGNORECASE,
    )
    for m in mf_pattern.finditer(text):
        fund_name, isin, value = m.groups()
        holdings.append({
            "type": "Mutual Fund",
            "fund_name": fund_name.strip(),
            "isin_no": isin.strip(),
            "closing_balance": float(value.replace(",", "")),
        })

    # Equities
    eq_pattern = re.compile(
        r"(INE[0-9A-Z]{9})\s+([A-Z0-9#&\-\s]+?)\s+(?:[\d\.\-]+\s+){3,6}([\d,]+\.\d+)",
        re.IGNORECASE,
    )
    for m in eq_pattern.finditer(text):
        isin, company, value = m.groups()
        holdings.append({
            "type": "Equity",
            "fund_name": company.strip(),
            "isin_no": isin.strip(),
            "closing_balance": float(value.replace(",", "")),
        })

    return holdings, total_value

# ------------------ PROCESS + STORE ------------------
def process_ecas_file(file_path: str, user_id: int, portfolio_id: int, password: str | None = None):
    """Parse ECAS PDF and insert holdings into the portfolios table."""
    text = extract_blocks_text(file_path, password)
    holdings, total_value = parse_ecas_text(text)

    print(f"✅ Parsed ECAS for user {user_id}, portfolio {portfolio_id}")
    print(f"✅ Total value: ₹{total_value:,.2f} | Holdings: {len(holdings)}")

    try:
        conn = get_db_conn()
        cur = conn.cursor()
        for h in holdings:
            cur.execute(
                """
                INSERT INTO portfolios (
                    portfolio_id, user_id, fund_name, isin_no,
                    closing_balance, created_at
                )
                VALUES (%s, %s, %s, %s, %s, NOW())
                """,
                (
                    portfolio_id,
                    user_id,
                    h.get("fund_name", "Unknown"),
                    h.get("isin_no", "N/A"),
                    h.get("closing_balance", 0.0),
                ),
            )
        conn.commit()
        print(f"💾 Inserted {len(holdings)} holdings into DB")

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
