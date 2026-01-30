import requests
import xml.etree.ElementTree as ET
import logging
from datetime import datetime
from db import get_db_conn

# -------------------------------------------------------------------
# CONFIG
# -------------------------------------------------------------------

MSTAR_BASE_URL = "https://api.morningstar.com/v2/service/mf/TrailingTotalReturn"
ACCESS_CODE = ""
TIMEOUT = 10

# -------------------------------------------------------------------
# HELPERS
# -------------------------------------------------------------------

def safe_float(val):
    """
    Convert Morningstar XML value to float safely.
    Returns None if value is missing or invalid.
    """
    try:
        if val is None:
            return None
        val = str(val).strip()
        if val == "":
            return None
        return float(val)
    except Exception:
        return None


def normalize_isin(isin: str) -> str | None:
    """
    Remove CAMS / suffix junk like _7, _12 etc
    """
    if not isin:
        return None
    return isin.split("_")[0].strip()


# -------------------------------------------------------------------
# FETCH FROM MORNINGSTAR (XML → DICT)
# -------------------------------------------------------------------

def fetch_morningstar_returns(isin: str) -> dict | None:
    """
    Fetch 1Y, 3Y, 5Y, 10Y calendar year returns from Morningstar.
    Returns a clean dict ready for DB insert.
    """

    isin = normalize_isin(isin)
    if not isin:
        return None

    url = f"{MSTAR_BASE_URL}/ISIN/{isin}?accesscode={ACCESS_CODE}"

    try:
        r = requests.get(url, timeout=TIMEOUT)

        if r.status_code != 200 or not r.text:
            logging.error(f"Morningstar HTTP error for {isin}")
            return None

        root = ET.fromstring(r.text)

        status_code = root.findtext(".//status/code")
        if status_code != "0":
            logging.warning(f"Morningstar returned no data for {isin}")
            return None

        api = root.find(".//api")
        data_node = root.find(".//data")

        if api is None or data_node is None:
            return None

        # -----------------------------
        # EXTRACT RETURNS
        # -----------------------------
        returns = {
            "isin": isin,
            "1y": safe_float(api.findtext("Return1Yr")),
            "3y": safe_float(api.findtext("Return3Yr")),
            "5y": safe_float(api.findtext("Return5Yr")),
            "10y": safe_float(api.findtext("Return10Yr")),
            "currency": data_node.attrib.get("_CurrencyId", "INR"),
            "as_of_date": api.findtext("CalendarYearReturnDate"),
        }

        # Normalize date
        if returns["as_of_date"]:
            returns["as_of_date"] = datetime.strptime(
                returns["as_of_date"], "%Y-%m-%d"
            ).date()
        else:
            returns["as_of_date"] = None

        # Remove completely empty rows
        if not any(returns[k] is not None for k in ("1y", "3y", "5y", "10y")):
            return None

        return returns

    except Exception as e:
        logging.error(f"Morningstar fetch failed for {isin}: {e}")
        return None


# -------------------------------------------------------------------
# DB UPSERT
# -------------------------------------------------------------------

def upsert_morningstar_returns(data: dict):
    """
    Insert or update historic_returns table.
    HARD REQUIREMENT: data MUST contain 'isin'
    """

    if not data or "isin" not in data:
        raise ValueError("upsert_morningstar_returns called without ISIN")

    conn = get_db_conn()
    cur = conn.cursor()

    cur.execute(
        """
        INSERT INTO historic_returns (
            isin,
            return_1y,
            return_3y,
            return_5y,
            return_10y,
            currency,
            as_of_date,
            updated_at
        )
        VALUES (%s,%s,%s,%s,%s,%s,%s,NOW())
        ON CONFLICT (isin)
        DO UPDATE SET
            return_1y = EXCLUDED.return_1y,
            return_3y = EXCLUDED.return_3y,
            return_5y = EXCLUDED.return_5y,
            return_10y = EXCLUDED.return_10y,
            currency = EXCLUDED.currency,
            as_of_date = EXCLUDED.as_of_date,
            updated_at = NOW();
        """,
        (
            data["isin"],
            data.get("1y"),
            data.get("3y"),
            data.get("5y"),
            data.get("10y"),
            data.get("currency"),
            data.get("as_of_date"),
        )
    )

    conn.commit()
    cur.close()
    conn.close()


# -------------------------------------------------------------------
# PUBLIC API (USE THIS IN dashboard_data)
# -------------------------------------------------------------------

def get_and_store_morningstar_returns(isin: str) -> dict | None:
    """
    One-call function:
    - Fetch Morningstar
    - Upsert DB
    - Return frontend-safe dict
    """

    data = fetch_morningstar_returns(isin)
    if not data:
        return None

    upsert_morningstar_returns(data)

    # Frontend only needs returns
    return {
        "1y": data.get("1y"),
        "3y": data.get("3y"),
        "5y": data.get("5y"),
        "10y": data.get("10y"),
    }
