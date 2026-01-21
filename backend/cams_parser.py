import re
import fitz  # PyMuPDF
from typing import List, Dict, Tuple, Optional
from db import get_db_conn
from cdsl_parser import classify_instrument


# =====================================================
# 1️⃣ EXTRACT CAMS BLOCKS (GROUND TRUTH)
# =====================================================
def extract_cams_blocks(
    file_path: str,
    password: Optional[str] = None
):
    """
    Extract text blocks from CAMS PDF, sorted top-to-bottom, left-to-right.
    CAMS data appears as LEFT + RIGHT block pairs.
    """
    doc = fitz.open(file_path)

    if doc.needs_pass:
        if not password or not doc.authenticate(password):
            raise ValueError("Invalid or missing PDF password")

    all_blocks = []

    for page in doc:
        blocks = page.get_text("blocks")

        # Sort blocks visually
        blocks.sort(key=lambda b: (round(b[1], 1), b[0]))  # Y then X

        for b in blocks:
            text = re.sub(r"[^\x00-\x7F]+", " ", b[4]).strip()
            if text:
                all_blocks.append((b[0], b[1], b[2], b[3], text))

    doc.close()
    return all_blocks


# =====================================================
# 2️⃣ PARSE CAMS BLOCK PAIRS (CORRECT METHOD)
# =====================================================
def parse_cams_ecas_blocks(
    blocks: List[tuple]
) -> Tuple[List[Dict], float]:
    """
    CAMS layout (confirmed from debug):

    LEFT BLOCK:
      Folio No
      Market Value
      Scheme Name (multi-line)

    RIGHT BLOCK:
      Units + NAV Date
      NAV
      Registrar
      ISIN
      Cost Value
    """

    holdings: List[Dict] = []
    total_value = 0.0

    i = 0
    while i < len(blocks) - 1:
        left = blocks[i]
        right = blocks[i + 1]

        # Must be visually aligned (same row)
        if abs(left[1] - right[1]) > 4:
            i += 1
            continue

        left_text = left[4]
        right_text = right[4]

        # Left must contain folio
        folio_match = re.search(r"\d+/\d+", left_text)
        if not folio_match:
            i += 1
            continue

        # Right must contain ISIN
        isin_match = re.search(r"(INF[0-9A-Z]{9})", right_text)
        if not isin_match:
            i += 1
            continue

        # ---------------- LEFT BLOCK ----------------
        left_lines = [l.strip() for l in left_text.splitlines() if l.strip()]

        folio_no = left_lines[0]
        market_value = None
        scheme_lines = []

        for l in left_lines[1:]:
            if re.match(r"[\d,]+\.\d+", l):
                market_value = float(l.replace(",", ""))
            else:
                scheme_lines.append(l)

        scheme = " ".join(scheme_lines)
        scheme = re.sub(r"\s{2,}", " ", scheme).strip()

        # ---------------- RIGHT BLOCK ----------------
        nums = re.findall(r"[\d,]+\.\d+", right_text)
        if len(nums) < 3:
            i += 2
            continue

        units = float(nums[0].replace(",", ""))
        nav = float(nums[1].replace(",", ""))
        cost = float(nums[-1].replace(",", ""))

        isin = isin_match.group(1)

        category, sub_category = classify_instrument(scheme)

        valuation = market_value if market_value else round(units * nav, 2)

        holdings.append({
            "type": "Mutual Fund",
            "fund_name": scheme[:255],
            "isin_no": isin,
            "folio_no": folio_no,
            "units": units,
            "nav": nav,
            "invested_amount": cost,
            "valuation": valuation,
            "category": category,
            "sub_category": sub_category,
        })

        total_value += valuation
        i += 2  # consume block pair

    print(f"📊 Found {len(holdings)} CAMS holdings")
    return holdings, total_value


# =====================================================
# 3️⃣ PROCESS + DB INSERTION (NSDL STYLE)
# =====================================================
def process_cams_file(
    file_path: str,
    user_id: int,
    portfolio_id: int,
    password: Optional[str] = None,
    *,
    member_id: Optional[int] = None,
    clear_existing: bool = False,
):
    print(f"📙 Processing CAMS eCAS for user {user_id}, portfolio {portfolio_id}")

    blocks = extract_cams_blocks(file_path, password)
    holdings, total_value = parse_cams_ecas_blocks(blocks)

    conn = None
    try:
        conn = get_db_conn()
        cur = conn.cursor()

        if clear_existing:
            if member_id:
                cur.execute(
                    """
                    DELETE FROM portfolios
                    WHERE user_id=%s AND portfolio_id=%s AND member_id=%s
                    """,
                    (user_id, portfolio_id, member_id),
                )
            else:
                cur.execute(
                    """
                    DELETE FROM portfolios
                    WHERE user_id=%s AND portfolio_id=%s AND member_id IS NULL
                    """,
                    (user_id, portfolio_id),
                )

        inserted = 0
        for h in holdings:
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
                    h["units"],
                    h["nav"],
                    h["invested_amount"],
                    h["valuation"],
                    h["category"],
                    h["sub_category"],
                    h["type"],
                ),
            )
            inserted += 1

        conn.commit()
        cur.close()
        print(f"💾 Inserted {inserted} CAMS holdings into DB")

    except Exception as e:
        if conn:
            conn.rollback()
        print(f"❌ CAMS DB insert failed: {e}")
        raise
    finally:
        if conn:
            conn.close()

    # STRICT CONTRACT (matches NSDL / CDSL)
    return {
        "holdings": holdings,
        "total_value": total_value,
    }
