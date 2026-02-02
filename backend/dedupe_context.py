from collections import defaultdict

# (isin, units, valuation) -> set(source_file)
_seen: dict[tuple, set[str]] = defaultdict(set)


def reset_dedup_context():
    """Call once per upload request"""
    _seen.clear()


def normalize_isin(isin: str) -> str:
    return (isin or "").strip().upper()


import re

def holding_key(h: dict) -> tuple | None:
    isin = normalize_isin(h.get("isin_no"))
    units = round(float(h.get("units") or 0.0), 6)
    valuation = round(float(h.get("valuation") or 0.0), 2)

    # ✅ ISIN-based instruments
    if isin:
        return (isin, units, valuation)

    # ✅ NON-ISIN instruments (NPS, Pension, etc.)
    fund_name = (h.get("fund_name") or "").strip().upper()
    htype = (h.get("type") or "").strip().upper()

    if not fund_name or not htype:
        return None

    # normalize spacing & symbols (PDF noise)
    fund_name = re.sub(r"\s+", " ", fund_name)
    fund_name = re.sub(r"[–—−]", "-", fund_name)

    return (htype, fund_name, units, valuation)

def is_duplicate(h: dict) -> bool:
    """
    ✅ ONLY cross-file duplicates
    ❌ NEVER same-file NSDL repeats
    """
    key = holding_key(h)
    source = h.get("source_file")

    if not key or not source:
        return False

    seen_sources = _seen.get(key, set())

    # duplicate ONLY if seen in another file
    return bool(seen_sources and source not in seen_sources)


def mark_seen(h: dict):
    key = holding_key(h)
    source = h.get("source_file")

    if key and source:
        _seen[key].add(source)
