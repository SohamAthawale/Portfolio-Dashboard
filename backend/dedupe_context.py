# dedup_context.py

_seen_keys: set[tuple] = set()


def reset_dedup_context():
    """Call ONCE per upload request"""
    _seen_keys.clear()


def normalize_isin(isin: str) -> str:
    return (isin or "").strip().upper()


def dedup_key(h: dict) -> tuple:
    """
    Cross-file dedup rule:
    Same ISIN + same units + same valuation = duplicate
    """
    return (
        normalize_isin(h.get("isin_no")),
        round(float(h.get("units") or 0.0), 6),
        round(float(h.get("valuation") or 0.0), 2),
    )


def is_duplicate(h: dict) -> bool:
    return dedup_key(h) in _seen_keys


def mark_seen(h: dict):
    _seen_keys.add(dedup_key(h))
