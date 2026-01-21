import os
from typing import Optional

from cams_parser import process_cams_file
from nsdl_parser import process_nsdl_file
from cdsl_parser import process_cdsl_file


# =====================================================
# UNIVERSAL UPLOAD PROCESSOR (NO DETECTION)
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
    Master entrypoint for uploaded files.
    Routing is STRICTLY based on file_type from frontend dropdown.

    Supported file_type values:
    - ecas_nsdl
    - ecas_cdsl
    - bank_statement
    - mutual_fund_statement
    """

    print("=" * 70)
    print("📄 Processing uploaded file")
    print(f"👤 user_id={user_id}")
    print(f"📁 portfolio_id={portfolio_id}")
    print(f"📄 file={file_path}")
    print(f"📌 file_type={file_type}")
    print(f"🔐 password={'Yes' if password else 'No'}")
    print("=" * 70)

    # -------------------------------------------------
    # ECAS – NSDL
    # -------------------------------------------------
    if file_type == "ecas_nsdl":
        print(f"📘 Routing to NSDL parser ({process_nsdl_file.__module__})")

        result = process_nsdl_file(
            file_path=file_path,
            user_id=user_id,
            portfolio_id=portfolio_id,
            password=password,
            member_id=member_id,
        )

    # -------------------------------------------------
    # ECAS – CDSL
    # -------------------------------------------------
    elif file_type == "ecas_cdsl":
        print(f"📗 Routing to CDSL parser ({process_cdsl_file.__module__})")

        result = process_cdsl_file(
            file_path=file_path,
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
            portfolio_id=portfolio_id,
            password=password,
            member_id=member_id,
            clear_existing=clear_existing,
        )
    # -------------------------------------------------
    # BANK STATEMENT (future-ready)
    # -------------------------------------------------
    elif file_type == "bank_statement":
        raise NotImplementedError(
            "Bank statement processing not implemented yet"
        )

    # -------------------------------------------------
    # MUTUAL FUND STATEMENT (future-ready)
    # -------------------------------------------------
    elif file_type == "mutual_fund_statement":
        raise NotImplementedError(
            "Mutual fund statement processing not implemented yet"
        )

    # -------------------------------------------------
    # DEFENSIVE FALLBACK
    # -------------------------------------------------
    else:
        raise ValueError(f"Unsupported file_type: {file_type}")

    # -------------------------------------------------
    # Summary logs
    # -------------------------------------------------
    print(f"✅ Parsing completed successfully for user {user_id}")
    print(f"💰 Total Portfolio Value: ₹{result.get('total_value', 0):,.2f}")
    print(f"📊 Holdings Count: {len(result.get('holdings', []))}")
    print("=" * 70)

    return result
