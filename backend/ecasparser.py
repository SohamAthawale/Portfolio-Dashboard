import os
from typing import Optional, List

import fitz  # PyMuPDF

from dedupe_context import reset_dedup_context
from cams_parser import process_cams_file
from nsdl_parser import process_nsdl_file
from cdsl_parser import process_cdsl_file


# =====================================================
# PDF TEXT EXTRACTION (FIRST PAGE ONLY)
# =====================================================
def extract_first_page_text(file_path: str, password: Optional[str] = None) -> str:
    try:
        doc = fitz.open(file_path)
        if doc.needs_pass:
            if not password:
                raise ValueError("PDF is password protected but no password was provided")
            if not doc.authenticate(password):
                raise ValueError("Incorrect PDF password")
        return doc[0].get_text()
    except Exception as e:
        raise ValueError(f"Failed to read PDF: {e}")


# =====================================================
# FILE TYPE VALIDATORS
# =====================================================
def is_nsdl_ecas(text: str) -> bool:
    return (
        "National Securities Depository Limited" in text
        or "NSDL Consolidated Account Statement" in text
    )


def is_cdsl_ecas(text: str) -> bool:
    return (
        "Central Depository Services" in text
        or "CDSL Consolidated Account Statement" in text
        or "CDSL" in text
    )


def is_cams_ecas(text: str) -> bool:
    return (
        "Computer Age Management Services" in text
        or "CAMS Consolidated Statement" in text
        or "CAMS" in text
    )


# =====================================================
# UNIVERSAL UPLOAD PROCESSOR (SINGLE FILE)
# =====================================================
def process_uploaded_file(
    *,
    file_path: str,
    user_id: int,
    portfolio_id: int,
    file_type: str,
    password: Optional[str] = None,
    member_id: Optional[int] = None,
    clear_existing: bool = False,
):
    """
    Processes ONE uploaded file.
    Dedup is handled inside individual parsers via dedupe_context.
    """

    print("=" * 70)
    print("📄 Processing uploaded file")
    print(f"👤 user_id={user_id}")
    print(f"📁 portfolio_id={portfolio_id}")
    print(f"📄 file={file_path}")
    print(f"📌 file_type={file_type}")
    print(f"🔐 password={'Yes' if password else 'No'}")
    print("=" * 70)

    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")

    if not file_path.lower().endswith(".pdf"):
        raise ValueError("Only PDF files are supported")

    text = extract_first_page_text(file_path, password=password)

    if file_type == "ecas_nsdl" and not is_nsdl_ecas(text):
        raise ValueError("Selected NSDL eCAS but uploaded file is NOT an NSDL statement")

    if file_type == "ecas_cdsl" and not is_cdsl_ecas(text):
        raise ValueError("Selected CDSL eCAS but uploaded file is NOT a CDSL statement")

    if file_type == "ecas_cams" and not is_cams_ecas(text):
        raise ValueError("Selected CAMS eCAS but uploaded file is NOT a CAMS statement")

    if file_type == "ecas_nsdl":
        result = process_nsdl_file(
            file_path=file_path,
            user_id=user_id,
            file_type=file_type,
            portfolio_id=portfolio_id,
            password=password,
            member_id=member_id,
        )

    elif file_type == "ecas_cdsl":
        result = process_cdsl_file(
            file_path=file_path,
            file_type=file_type,
            user_id=user_id,
            portfolio_id=portfolio_id,
            password=password,
            member_id=member_id,
            clear_existing=clear_existing,
        )

    elif file_type == "ecas_cams":
        result = process_cams_file(
            file_path=file_path,
            user_id=user_id,
            file_type=file_type,
            portfolio_id=portfolio_id,
            password=password,
            member_id=member_id,
            clear_existing=clear_existing,
        )
    else:
        raise ValueError(f"Unsupported file_type: {file_type}")

    print(f"✅ Completed: {file_type} | Holdings: {len(result.get('holdings', []))}")
    return result


# =====================================================
# ✅ NEW: MULTI-FILE PROCESSOR (DEDUP ACROSS FILES)
# =====================================================
def process_uploaded_files(
    *,
    file_paths: List[str],
    file_types: List[str],
    user_id: int,
    portfolio_id: int,
    password: Optional[str] = None,
    member_id: Optional[int] = None,
):
    """
    Processes MULTIPLE uploaded files in sequence.
    Dedup applies ACROSS ALL files via dedupe_context.
    """

    if len(file_paths) != len(file_types):
        raise ValueError("file_paths and file_types length mismatch")
    reset_dedup_context()
    all_holdings = []
    total_value = 0.0

    for idx, (path, ftype) in enumerate(zip(file_paths, file_types)):
        print(f"\n🔁 Processing file {idx + 1}/{len(file_paths)} → {ftype}")

        result = process_uploaded_file(
            file_path=path,
            file_type=ftype,
            user_id=user_id,
            portfolio_id=portfolio_id,
            password=password,
            member_id=member_id,
            clear_existing=False,  # IMPORTANT: never clear between files
        )

        all_holdings.extend(result.get("holdings", []))
        total_value += result.get("total_value", 0.0)

    return {
        "holdings": all_holdings,
        "total_value": round(total_value, 2),
    }
