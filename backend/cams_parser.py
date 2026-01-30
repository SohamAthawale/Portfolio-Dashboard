import os
import re
import fitz  # PyMuPDF
from typing import List, Dict, Tuple, Optional
from db import get_db_conn
from cdsl_parser import classify_instrument
from dedupe_context import is_duplicate, mark_seen


# =====================================================
# 1️⃣ EXTRACT CAMS BLOCKS (VISUAL ORDER)
# =====================================================
def extract_cams_blocks(file_path: str, password: Optional[str] = None) -> List[Dict]:
    doc = fitz.open(file_path)

    if doc.needs_pass:
        if not password or not doc.authenticate(password):
            raise ValueError("Invalid or missing PDF password")

    blocks_out = []

    for page in doc:
        blocks = page.get_text("blocks")
        blocks.sort(key=lambda b: (round(b[1], 1), b[0]))  # Y then X

        for b in blocks:
            text = re.sub(r"[^\x00-\x7F]+", " ", b[4]).strip()
            if not text:
                continue

            blocks_out.append({
                "x": b[0],
                "y": b[1],
                "text": text
            })

    doc.close()
    return blocks_out


# =====================================================
# 2️⃣ PARSE CAMS TWO-COLUMN LAYOUT (ROBUST)
# =====================================================
def parse_cams_two_column(blocks: List[Dict]) -> Tuple[List[Dict], float]:
    holdings: List[Dict] = []
    total_value = 0.0
    used = set()

    for i, left in enumerate(blocks):
        if i in used:
            continue

        # LEFT block must contain folio
        folio_match = re.search(r"\d+/\d+|\d{6,}", left["text"])
        if not folio_match:
            continue

        # Find matching RIGHT block on same row
        right = None
        for j in range(i + 1, min(i + 6, len(blocks))):
            if j in used:
                continue

            candidate = blocks[j]
            if abs(candidate["y"] - left["y"]) <= 5 and re.search(r"INF[0-9A-Z]{9}", candidate["text"]):
                right = candidate
                used.add(j)
                break

        if not right:
            continue

        used.add(i)

        # ---------------- LEFT ----------------
        left_lines = [l.strip() for l in left["text"].splitlines() if l.strip()]
        folio_no = left_lines[0]

        scheme_parts = []
        market_value = None

        for l in left_lines[1:]:
            if re.match(r"[\d,]+\.\d+", l):
                market_value = float(l.replace(",", ""))
            else:
                scheme_parts.append(l)

        scheme = re.sub(r"\s+", " ", " ".join(scheme_parts)).strip()

        # ---------------- RIGHT ----------------
        nums = re.findall(r"[\d,]+\.\d+", right["text"])
        if len(nums) < 3:
            continue

        units = float(nums[0].replace(",", ""))
        nav = float(nums[1].replace(",", ""))
        invested = float(nums[-1].replace(",", ""))

        isin_match = re.search(r"(INF[0-9A-Z]{9})", right["text"])
        if not isin_match:
            continue

        isin = isin_match.group(1)

        valuation = market_value if market_value else round(units * nav, 2)

        category, sub_category = classify_instrument(scheme)

        holdings.append({
            "type": "Mutual Fund",
            "fund_name": scheme[:255],
            "isin_no": isin,
            "folio_no": folio_no,
            "units": units,
            "nav": nav,
            "invested_amount": invested,
            "valuation": valuation,
            "category": category,
            "sub_category": sub_category,
        })

        total_value += valuation

    print(f"📊 Found {len(holdings)} CAMS holdings")
    return holdings, total_value


# =====================================================
# 3️⃣ MAIN ENTRYPOINT (UPLOAD PIPELINE)
# =====================================================
def process_cams_file(
    file_path: str,
    file_type: str,
    user_id: int,
    portfolio_id: int,
    password: Optional[str] = None,
    *,
    member_id: Optional[int] = None,
    clear_existing: bool = False,
):
    print(f"📙 Processing CAMS eCAS for user {user_id}, portfolio {portfolio_id}")

    blocks = extract_cams_blocks(file_path, password)
    holdings, total_value = parse_cams_two_column(blocks)

    conn = None
    inserted = 0   # ✅ ADDED (safe)

    try:
        conn = get_db_conn()
        cur = conn.cursor()

        if clear_existing:
            if member_id:
                cur.execute(
                    "DELETE FROM portfolios WHERE user_id=%s AND portfolio_id=%s AND member_id=%s",
                    (user_id, portfolio_id, member_id),
                )
            else:
                cur.execute(
                    "DELETE FROM portfolios WHERE user_id=%s AND portfolio_id=%s AND member_id IS NULL",
                    (user_id, portfolio_id),
                )

        for h in holdings:     # ✅ ADDED
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
                h.get("isin_no"),
                h.get("fund_name"),
                h.get("units"),
                h.get("nav"),
                h.get("valuation"),
                file_type,           # pass this down
                os.path.basename(file_path),
            )
        )        
                continue
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

            mark_seen(h)             # ✅ ADDED
            inserted += 1            # ✅ ADDED

        conn.commit()
        cur.close()
        print(f"💾 Inserted {inserted} unique CAMS holdings into DB")

    except Exception as e:
        if conn:
            conn.rollback()
        raise e
    finally:
        if conn:
            conn.close()

    return {
        "holdings": holdings,
        "total_value": total_value,
    }