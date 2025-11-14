import re
import fitz
import os
from typing import Optional
import nsdl_parser
import cdsl_parser
from nsdl_parser import process_nsdl_file
from cdsl_parser import process_cdsl_file

# Log active parser location for clarity
print("🧠 ACTIVE NSDL PARSER FILE:", nsdl_parser.__file__)

# =====================================================
# 1️⃣ PDF TEXT EXTRACTION (for detection only)
# =====================================================
def extract_text_for_detection(file_path: str, password: Optional[str] = None) -> str:
    """
    Extract minimal text for detecting Depository type (CDSL/NSDL).
    Does not perform layout parsing — only a lightweight text read.
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")

    doc = fitz.open(file_path)
    if doc.needs_pass:
        if not password:
            raise ValueError("PDF requires a password.")
        if not doc.authenticate(password):
            raise ValueError("Invalid PDF password.")

    text = ""
    for page in doc:
        text += page.get_text("text") + "\n"
    doc.close()

    return text.lower().strip()


# =====================================================
# 2️⃣ DEPOSITORY DETECTION LOGIC (Content-based, strict)
# =====================================================
def detect_depository_type_from_text(text: str) -> str:
    """
    Detect whether the eCAS belongs to NSDL or CDSL
    purely from PDF content (no reliance on filename).
    Raises an error if no explicit classification can be made.
    """
    t = text.lower().replace("\n", " ")

    # NSDL indicators
    nsdl_markers = [
        "national securities depository limited",
        "about nsdl",
        "we at nsdl",
        "nsdl demat account",
        "nsdl id",
        "nsdl national insurance repository",
    ]

    # CDSL indicators
    cdsl_markers = [
        "central depository services",
        "cdsl demat account",
        "beneficiary id",
        "cdsl easi",
        "cdsl easiest",
    ]

    nsdl_score = sum(m in t for m in nsdl_markers)
    cdsl_score = sum(m in t for m in cdsl_markers)

    print(f"🔎 Detection scan: NSDL hits={nsdl_score}, CDSL hits={cdsl_score}")

    
    # --- Decide by dominance rather than exclusivity ---
    if nsdl_score > cdsl_score:
        print("📘 Detected Depository: NSDL (dominant markers)")
        return "NSDL"
    if cdsl_score > nsdl_score:
        print("📗 Detected Depository: CDSL (dominant markers) ")
        return "CDSL"
    if cdsl_score == nsdl_score:
        return "CDSL"
    raise ValueError(
        "⚠️ Unable to confidently detect Depository type "
        f"(NSDL={nsdl_score}, CDSL={cdsl_score})"
    )
# =====================================================
# 3️⃣ UNIVERSAL PROCESSOR
# =====================================================
def process_ecas_file(
    file_path: str,
    user_id: int,
    portfolio_id: int,
    password: Optional[str] = None,
    *,
    member_id: Optional[int] = None,
    clear_existing: bool = False,
):
    """
    Master entrypoint for any uploaded eCAS (CDSL or NSDL):
    - Extracts PDF text
    - Detects Depository type using internal content
    - Routes to the correct parser
    - Performs DB insertions
    - Strict mode: raises error if detection uncertain
    """
    print("=" * 70)
    print(f"📄 Processing uploaded eCAS for user_id={user_id}, portfolio_id={portfolio_id}")
    print(f"📁 File: {file_path}")
    print(f"🔐 Password provided: {'Yes' if password else 'No'}")

    # --- Step 1: Extract text and detect Depository type ---
    text = extract_text_for_detection(file_path, password)
    depository = detect_depository_type_from_text(text)
    print(f"🏦 Detected Depository: {depository}")

    # --- Step 2: Route to appropriate parser ---
    if depository == "NSDL":
        print(f"📘 Routing to NSDL parser ({process_nsdl_file.__module__})")
        result = process_nsdl_file(
            file_path=file_path,
            user_id=user_id,
            portfolio_id=portfolio_id,
            password=password,
            member_id=member_id,
        )

    else:  # CDSL
        print(f"📗 Routing to CDSL parser ({process_cdsl_file.__module__})")
        result = process_cdsl_file(
            file_path=file_path,
            user_id=user_id,
            portfolio_id=portfolio_id,
            password=password,
            member_id=member_id,
            clear_existing=clear_existing,
        )

    # --- Step 3: Log summary ---
    print(f"✅ Parsing completed successfully for user {user_id}")
    print(f"💰 Total Portfolio Value: ₹{result['total_value']:,.2f}")
    print(f"📊 Holdings Count: {len(result['holdings'])}")
    print("=" * 70)

    return result
