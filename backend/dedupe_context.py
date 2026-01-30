# dedup_context.py

_seen_keys: set[tuple] = set()


def reset_dedup_context():
    """
    MUST be called once per file upload
    """
    _seen_keys.clear()


def normalize_isin(isin: str) -> str:
    return (isin or "").strip().upper()


def dedup_key(h: dict) -> tuple | None:
    """
    Cross-file dedup rule:
    Same ISIN + same units + same valuation
    BUT from a DIFFERENT source_file.
    """
    isin = normalize_isin(h.get("isin_no"))
    source_file = h.get("source_file")

    if not isin or not source_file:
        return None

    return (
        source_file,
        isin,
        round(float(h.get("units") or 0.0), 6),
        round(float(h.get("valuation") or 0.0), 2),
    )


def is_duplicate(h: dict) -> bool:
    key = dedup_key(h)
    if not key:
        return False

    _, isin, units, valuation = key

    # Check same holding from a DIFFERENT file
    for seen_source, seen_isin, seen_units, seen_val in _seen_keys:
        if (
            seen_isin == isin
            and seen_units == units
            and seen_val == valuation
            and seen_source != key[0]
        ):
            return True

    return False


def mark_seen(h: dict):
    key = dedup_key(h)
    if key:
        _seen_keys.add(key)
