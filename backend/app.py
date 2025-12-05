import traceback
from typing import Any, Dict, Optional
from flask import Flask, request, jsonify, send_from_directory, session
from flask_cors import CORS
from flask_session import Session
import psycopg2
from werkzeug.utils import secure_filename
from werkzeug.security import generate_password_hash, check_password_hash
import os
from ecasparser import process_ecas_file
from db import get_db_conn
from functools import wraps


# -----------------------------------------------------
# CONFIG
# -----------------------------------------------------
UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

app = Flask(__name__, static_folder="dist", static_url_path="/")
app.secret_key = "supersecretkey123"

# ✅ Enable cross-origin cookies from React app
CORS(
    app,
    supports_credentials=True,
    origins=["http://localhost:5173", "http://127.0.0.1:5173"],
)

# ✅ Persistent Flask session configuration
app.config.update(
    SESSION_TYPE="filesystem",           # store session on disk
    SESSION_PERMANENT=True,              # keep session active across restarts
    SESSION_USE_SIGNER=True,             # adds extra security
    SESSION_COOKIE_NAME="pms_session",   # custom cookie name
    SESSION_COOKIE_SAMESITE="Lax",      # allow cross-origin (React <-> Flask)
    SESSION_COOKIE_SECURE=False,         # only True if you serve via HTTPS
)

Session(app)


# -----------------------------------------------------
# HELPERS
# -----------------------------------------------------
import psycopg2.extras

def find_user(email):
    conn = get_db_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT * FROM users WHERE email=%s LIMIT 1", (email,))
    user = cur.fetchone()
    cur.close()
    conn.close()
    return user


def create_user(email, phone, password):
    conn = get_db_conn()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO users (email, phone, password_hash) VALUES (%s, %s, %s) RETURNING *",
        (email, phone, generate_password_hash(password)),
    )
    user = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    return user

def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if session.get("role") != "admin":
            return jsonify({"error": "Admin access required"}), 403
        return f(*args, **kwargs)
    return decorated

def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if "user_id" not in session:
            return jsonify({"error": "Unauthorized"}), 401
        return f(*args, **kwargs)
    return decorated_function


def get_current_user():
    """Fetch logged-in user's info from session + DB."""
    user_id = session.get("user_id")
    if not user_id:
        return None

    conn = get_db_conn()
    cur = conn.cursor()
    cur.execute(
        "SELECT user_id, email, phone, family_id FROM users WHERE user_id = %s",
        (user_id,),
    )
    user = cur.fetchone()
    cur.close()
    conn.close()

    if not user:
        return None

    return {
        "user_id": user["user_id"] if isinstance(user, dict) else user[0],
        "email": user["email"] if isinstance(user, dict) else user[1],
        "phone": user["phone"] if isinstance(user, dict) else user[2],
        "family_id": user["family_id"] if isinstance(user, dict) else user[3],
    }

def fetch_user_family_id(cur, user_id: int) -> Optional[int]:
    cur.execute("SELECT family_id FROM users WHERE user_id = %s", (user_id,))
    r = cur.fetchone()
    return r["family_id"] if r else None


def resolve_per_family_member_to_canonical(cur, family_id: int, per_family_member_id: int) -> Optional[int]:
    """
    The client sends per-family member_id (1,2,3...). We map it to the canonical family_members.id
    by searching family_members WHERE member_id = <per_family_member_id> AND family_id = <family_id>.
    Returns canonical family_members.id or None if not found.
    """
    cur.execute(
        "SELECT id FROM family_members WHERE member_id = %s AND family_id = %s",
        (per_family_member_id, family_id),
    )
    r = cur.fetchone()
    return r["id"] if r else None


def get_service_request(cur, req_id: int) -> Optional[Dict[str, Any]]:
    cur.execute("SELECT * FROM service_requests WHERE id = %s", (req_id,))
    return cur.fetchone()



# -----------------------------------------------------
# ROUTES
# -----------------------------------------------------
@app.route("/")
def home():
    return jsonify({"message": "Flask backend running ✅"})


# ---------- Register ----------
# ---------------------------------------------------------
# ASSIGN DEFAULT ROLE (UPDATED)
# ---------------------------------------------------------
def assign_default_role(user_id, cur):
    """Assign the 'user' role within the SAME transaction + cursor."""
    cur.execute("SELECT role_id FROM roles WHERE role_name = 'user'")
    row = cur.fetchone()

    if not row:
        raise Exception("Default 'user' role not found in roles table")

    role_id = row["role_id"]

    cur.execute("""
        INSERT INTO user_roles (user_id, role_id, scope)
        VALUES (%s, %s, %s)
    """, (user_id, role_id, "default"))
            

# ---------------------------------------------------------
# USER REGISTRATION - PENDING APPROVAL
# ---------------------------------------------------------
@app.route("/register", methods=["POST"])
def register():
    data = request.get_json() or {}
    email = (data.get("email") or "").strip().lower()
    phone = (data.get("phone") or "").strip()
    password = data.get("password")

    if not email or not phone or not password:
        return jsonify({"error": "All fields are required"}), 400

    if not phone.isdigit() or len(phone) != 10:
        return jsonify({"error": "Invalid phone number format"}), 400

    existing_user = find_user(email)
    if existing_user:
        return jsonify({"error": "Email already registered"}), 409

    conn = get_db_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    cur.execute("SELECT id FROM pending_registrations WHERE email=%s OR phone=%s", (email, phone))
    existing_pending = cur.fetchone()

    if existing_pending:
        cur.close()
        conn.close()
        return jsonify({"error": "Registration already pending approval"}), 409

    password_hash = generate_password_hash(password)

    cur.execute("""
        INSERT INTO pending_registrations (email, phone, password_hash)
        VALUES (%s, %s, %s)
        RETURNING id
    """, (email, phone, password_hash))

    row = cur.fetchone()
    if not row:
        cur.close()
        conn.close()
        return jsonify({"error": "Something went wrong"}), 500

    pending_id = row["id"]

    conn.commit()
    cur.close()
    conn.close()

    return jsonify({
        "message": "Registration submitted. Waiting for admin approval.",
        "pending_id": pending_id
    }), 201


# ---------------------------------------------------------
# GET PENDING REGISTRATIONS
# ---------------------------------------------------------
@app.route("/admin/pending-registrations", methods=["GET"])
@admin_required
@login_required
def get_pending_registrations():
    conn = get_db_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    try:
        cur.execute("""
            SELECT id, email, phone, created_at
            FROM pending_registrations
            ORDER BY created_at ASC
        """)
        rows = cur.fetchall()

    except Exception as e:
        return jsonify({"error": "Failed to fetch pending registrations", "detail": str(e)}), 500

    finally:
        cur.close()
        conn.close()

    return jsonify(rows), 200


# ---------------------------------------------------------
# APPROVE REGISTRATION
# ---------------------------------------------------------
@app.route("/admin/approve-registration/<int:pending_id>", methods=["POST"])
@admin_required
def approve_registration(pending_id):

    conn = get_db_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    try:
        # 1️⃣ Fetch pending registration
        cur.execute("SELECT * FROM pending_registrations WHERE id=%s", (pending_id,))
        pending = cur.fetchone()

        if not pending:
            return jsonify({"error": "Pending registration not found"}), 404

        # 2️⃣ Create family with auto-name
        family_name = f"{pending['email']}'s Family"
        cur.execute("""
            INSERT INTO families (family_name)
            VALUES (%s)
            RETURNING family_id
        """, (family_name,))
        family_id = cur.fetchone()["family_id"]

        # 3️⃣ Create user
        cur.execute("""
            INSERT INTO users (email, phone, password_hash, family_id)
            VALUES (%s, %s, %s, %s)
            RETURNING user_id
        """, (pending["email"], pending["phone"], pending["password_hash"], family_id))

        new_user = cur.fetchone()
        if not new_user:
            conn.rollback()
            return jsonify({"error": "User insert returned no data"}), 500

        user_id = new_user["user_id"]

        # 4️⃣ Assign role inside SAME transaction
        assign_default_role(user_id, cur)

        # 5️⃣ Delete pending request
        cur.execute("DELETE FROM pending_registrations WHERE id=%s", (pending_id,))

        conn.commit()

        return jsonify({
            "message": "User approved successfully",
            "user_id": user_id,
            "family_id": family_id
        }), 201

    except Exception as e:
        conn.rollback()
        return jsonify({"error": "Approval failed", "detail": str(e)}), 500

    finally:
        cur.close()
        conn.close()


# ---------------------------------------------------------
# REJECT REGISTRATION
# ---------------------------------------------------------
@app.route("/admin/reject-registration/<int:pending_id>", methods=["DELETE"])
@admin_required
def reject_registration(pending_id):

    conn = get_db_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    cur.execute("DELETE FROM pending_registrations WHERE id=%s RETURNING id", (pending_id,))
    deleted = cur.fetchone()

    conn.commit()
    cur.close()
    conn.close()

    if not deleted:
        return jsonify({"error": "Pending registration not found"}), 404

    return jsonify({"message": "Registration rejected"}), 200


# ---------------------------------------------------------
# APPROVED USERS LIST
# ---------------------------------------------------------
@app.route("/admin/approved-accounts", methods=["GET"])
@admin_required
@login_required
def approved_accounts():

    conn = get_db_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    try:
        cur.execute("""
            SELECT user_id, email, phone, created_at
            FROM users
            ORDER BY created_at DESC
        """)
        rows = cur.fetchall()

    except Exception as e:
        return jsonify({"error": str(e)}), 500

    finally:
        cur.close()
        conn.close()

    return jsonify(rows), 200

#-----------------login----------------------

@app.route("/login", methods=["POST"])
def login():
    data = request.get_json() or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password", "")

    print("\n===== LOGIN DEBUG =====")
    print("Incoming email:", email)
    print("Incoming password:", password)

    if not email or not password:
        print("ERROR: Missing email or password")
        return jsonify({"error": "Email and password are required"}), 400

    user = find_user(email)
    print("User from DB:", user)

    if not user:
        print("ERROR: No account found")
        return jsonify({"error": "No account found for this email"}), 404

    # Extract hash safely
    stored_hash = user.get("password_hash") if isinstance(user, dict) else user[4]
    print("Stored hash:", stored_hash)

    try:
        check_result = check_password_hash(stored_hash, password)
        print("Password match result:", check_result)
    except Exception as e:
        print("ERROR during password check:", str(e))
        return jsonify({"error": "Internal password check error"}), 500

    if not check_result:
        print("ERROR: Incorrect password")
        return jsonify({"error": "Incorrect password"}), 401

    print("Password OK!")

    user_id = user["user_id"] if isinstance(user, dict) else user[0]

    conn = get_db_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT r.role_name
        FROM user_roles ur
        JOIN roles r ON ur.role_id = r.role_id
        WHERE ur.user_id = %s
        LIMIT 1
    """, (user_id,))
    role_row = cur.fetchone()
    cur.close()
    conn.close()

    role = role_row["role_name"] if role_row else "user"
    print("User role:", role)

    session["user_id"] = user_id
    session["user_email"] = user["email"]
    session["role"] = role

    print("LOGIN SUCCESS:", email, "as", role)
    print("=========================\n")

    return jsonify({
        "message": "Login successful",
        "user": {
            "user_id": user_id,
            "email": user["email"],
            "phone": user.get("phone"),
            "role": role
        }
    }), 200



# ---------- Logout ----------
@app.route("/logout", methods=["POST"])
def logout():
    if "user_id" not in session:
        return jsonify({"error": "No active session"}), 400
    user_email = session.get("user_email")
    session.clear()
    print(f"👋 Logged out {user_email}")
    return jsonify({"message": "Logged out successfully"}), 200


# ---------- Upload ECAS ----------
@app.route("/upload", methods=["POST"])
def upload_ecas():
    try:
        file = request.files.get("file")
        email = request.form.get("email")
        pdf_password = request.form.get("password")

        if not file or not email:
            return jsonify({"error": "File and email required"}), 400

        user = find_user(email)
        if not user:
            return jsonify({"error": "User not found"}), 404
        user_id = user["user_id"]

        conn = get_db_conn()
        cur = conn.cursor()
        cur.execute("""
            SELECT COALESCE(MAX(portfolio_id), 0) + 1 AS next_id
            FROM portfolios
            WHERE user_id = %s
        """, (user_id,))
        row = cur.fetchone()
        next_portfolio_id = row["next_id"] if row else 1
        conn.close()

        user_folder = os.path.join(UPLOAD_FOLDER, f"user_{user_id}")
        os.makedirs(user_folder, exist_ok=True)
        file_path = os.path.join(user_folder, f"portfolio_{next_portfolio_id}_{secure_filename(file.filename)}")
        file.save(file_path)

        print(f"📄 Processing ECAS for user {user_id}, portfolio {next_portfolio_id}")
        result = process_ecas_file(file_path, user_id, next_portfolio_id, pdf_password)

        return jsonify({
            "message": "Portfolio uploaded successfully",
            "user_id": user_id,
            "portfolio_id": next_portfolio_id,
            "total_value": result["total_value"],
            "holdings_count": len(result["holdings"]),
        }), 200
    except Exception as e:
        print("❌ Upload error:", e)
        return jsonify({"error": str(e)}), 500


# ---------- Dashboard Data ----------
from flask import jsonify, request, session
from psycopg2.extras import RealDictCursor
from db import get_db_conn
@app.route("/dashboard-data")
def dashboard_data():
    """
    Returns enriched dashboard data for the user + selected members.
    """

    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    include_user = request.args.get("include_user", "true").lower() == "true"
    members_param = request.args.get("members", "")

    # Per-family member_ids (1,2,3...)
    per_family_ids = [
        int(x) for x in members_param.split(",") if x.strip().isdigit()
    ] if members_param else []

    # If nothing selected → return empty
    if not include_user and not per_family_ids:
        return jsonify({
            "summary": {
                "invested_value_mf": 0,
                "current_value_mf": 0,
                "profit_mf": 0,
                "profit_percent_mf": 0,
                "equity_value": 0,
                "total_portfolio_value": 0
            },
            "asset_allocation": [],
            "top_amc": [],
            "top_category": [],
            "holdings": [],
            "filters": {"user": False, "members": []},
        }), 200

    conn = get_db_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    # ------------------------------------------------------------
    # 1️⃣ Convert per-family member_ids → global PRIMARY KEY IDs
    # ------------------------------------------------------------
    global_member_ids = []
    if per_family_ids:
        cur.execute("""
            SELECT id 
            FROM family_members
            WHERE member_id = ANY(%s)
              AND family_id = (SELECT family_id FROM users WHERE user_id = %s)
        """, (per_family_ids, user_id))

        rows = cur.fetchall()
        global_member_ids = [r["id"] for r in rows]

    # ------------------------------------------------------------
    # 2️⃣ Fetch latest portfolios per user or per selected members
    # ------------------------------------------------------------
    query = """
        SELECT 
            p.user_id,
            p.member_id,
            p.portfolio_id,
            p.fund_name,
            p.isin_no,
            p.units,
            p.nav,
            p.invested_amount,
            p.valuation,
            p.type,
            p.category,
            p.sub_category,
            p.created_at
        FROM portfolios p
        WHERE 
            (
                (%s = TRUE AND p.user_id = %s AND p.member_id IS NULL)
                OR (p.member_id = ANY(%s))
            )
            AND p.portfolio_id = (
                SELECT MAX(portfolio_id)
                FROM portfolios p2
                WHERE p2.user_id = p.user_id
                  AND COALESCE(p2.member_id, 0) = COALESCE(p.member_id, 0)
            );
    """

    cur.execute(query, (include_user, user_id, global_member_ids))
    holdings = cur.fetchall()

    # ------------------------------------------------------------
    # If no holdings → return empty result
    # ------------------------------------------------------------
    if not holdings:
        cur.close()
        conn.close()
        return jsonify({
            "summary": {
                "total_invested": 0,
                "current_value": 0,
                "profit": 0,
                "profit_percent": 0
            },
            "asset_allocation": [],
            "top_amc": [],
            "top_category": [],
            "holdings": [],
            "filters": {"user": include_user, "members": per_family_ids},
        }), 200

    # -------------------------------------------------
    # CALCULATE TOTALS
    # -------------------------------------------------
# Calculate MF totals - INCLUDING MUTUAL FUND FOLIO
    mf_invested = sum(
        float(h.get("invested_amount") or 0)
        for h in holdings
        if str(h.get("type", "")).lower() in {"mutual fund", "mutual", "mf", "mutual fund folio", "folio"}
    )

    mf_value = sum(
        float(h.get("valuation") or 0)
        for h in holdings
        if str(h.get("type", "")).lower() in {"mutual fund", "mutual", "mf", "mutual fund folio", "folio"}
    )

    # Calculate equity totals
    equity_value = sum(
        float(h.get("valuation") or 0)
        for h in holdings
        if str(h.get("type", "")).lower() in {"equity", "share", "shares", "stock", "stocks"}
    )

    nps_value = sum(
        float(h.get("valuation") or 0)
        for h in holdings
        if str(h.get("type", "")).lower() in {"nps"}
    )
    govsec_value = sum(
        float(h.get("valuation") or 0)
        for h in holdings
        if str(h.get("type", "")).lower() in {"govt security"}
    )
    corpbonds_value = sum(
        float(h.get("valuation") or 0)
        for h in holdings
        if str(h.get("type", "")).lower() in {"corporate bond"}
    )
    total_value = mf_value + equity_value + nps_value + govsec_value +corpbonds_value

    profit = mf_value - mf_invested
    profit_percent = (profit / mf_invested * 100) if mf_invested > 0 else 0


    # -------------------------------------------------
    # MODEL ASSET ALLOCATION
    # -------------------------------------------------
    asset_summary = {}
    for h in holdings:
        cat = h.get("category") or "Others"
        val = float(h.get("valuation") or 0)
        asset_summary[cat] = asset_summary.get(cat, 0) + val

    asset_allocation = []
    for cat, val in asset_summary.items():
        pct = (val / total_value * 100) if total_value > 0 else 0
        asset_allocation.append({
            "category": cat,
            "value": round(val, 2),
            "percentage": round(pct, 2)
        })

    asset_allocation.sort(key=lambda x: x["value"], reverse=True)

   # -------------------------------------------------
# TOP 10 AMCs — robust name detection + grouping (EXCLUDING SHARES)
    # -------------------------------------------------
    amc_summary = {}

    junk_terms = [
        "DIRECT PLAN", "DIRECT GROWTH", "PLAN GROWTH", "GROWTH PLAN", "PLAN- GROWTH",
        "GROWTH OPTION", "GROWTH", "IDCW", "DIR GR", "DIRECT PLAN-GROWTH",
        "EQUITY SHARES", "PLAN", "OPTION", "REGULAR DIRECT", "TERMS", "INR", "LIMITED",
        "SCHEME", "FUND MANAGEMENT", "#","NEW"
    ]

    stop_words = {
        "SMALL", "CAP", "LARGE", "MID", "OPPORTUNITIES", "OPPORTUNITY", "YIELD",
        "STRATEGY", "COMMODITIES", "INFRASTRUCTURE", "SERVICES", "BFSI",
        "DIVIDEND", "CONSUMPTION", "ESG", "BANKING", "FINANCIAL", "FLEXI",
        "FLEXI CAP", "FLEXI-CAP","TIER"
    }

    known_amcs = [
        # Large established AMCs
        "SBI", "HDFC", "ICICI PRUDENTIAL", "KOTAK", "AXIS", "NIPPON INDIA",
        "ADITYA BIRLA SUN LIFE", "TATA", "UTI", "DSP", "IDFC", "CANARA ROBECO",
        "SUNDARAM", "FRANKLIN TEMPLETON", "HSBC", "BARODA BNP PARIBAS",
        
        # Mid-sized and growing AMCs
        "MIRAE ASSET", "MOTILAL OSWAL", "PGIM", "QUANT", "BANDHAN", "JM FINANCIAL",
        "INVESCO", "MAHINDRA MANULIFE", "SAMCO", "WHITE OAK", "TRUST",
        
        # Specialized and newer AMCs
        "PARAG PARIKH", "EDELWEISS", "ITI", "NAVI", "UNION", "TAURUS",
        "BOI AXA", "LIC", "INDIABULLS", "SHRIRAM",
        
        # International players
        "ABSL", "BNP PARIBAS", "GOLDMAN SACHS", "MIRAE", "PRINCIPAL",
        
        # Hybrid and thematic focused
        "SUNDARAM", "L&T", "IDBI", "SHRIRAM", "JIFFY",
        
        # Updated and merged entities
        "ADITYA BIRLA", "ICICI", "PRUDENTIAL", "SUN LIFE", "BIRLA SUN LIFE"
    ]

    # Sort by length (longest first) for better matching
    known_amcs = sorted([k.upper() for k in known_amcs], key=lambda x: -len(x))

    def extract_amc_name(fund_name: str) -> str:
        """Robust AMC extraction with multiple fallbacks"""
        if not fund_name:
            return "OTHERS"

        text = fund_name.upper().strip()
        for junk in junk_terms:
            text = text.replace(junk, "")
        text = text.strip()

        candidate_sections = []
        if "-" in text:
            candidate_sections.append(text.split("-", 1)[1].strip())
        candidate_sections.append(text)

        for section in candidate_sections:
            for known in known_amcs:
                if section.startswith(known) or f" {known} " in f" {section} ":
                    return known

        for section in candidate_sections:
            words = section.split()
            if "FUND" in words:
                idx = words.index("FUND")
                for take in (2, 1):
                    if idx - take >= 0:
                        candidate = " ".join(words[idx - take:idx]).strip()
                        cand_clean = candidate.replace("&", "").replace(",", "").strip()
                        for known in known_amcs:
                            if cand_clean.startswith(known):
                                return known
                        tokens = [t for t in cand_clean.split() if t.isalpha()]
                        if tokens and all(tok not in stop_words for tok in tokens):
                            return " ".join(tokens).upper()

        for section in candidate_sections:
            tokens = [t for t in section.replace(",", " ").split() if t.isalpha()]
            for known in known_amcs:
                known_tokens = known.split()
                for i in range(len(tokens) - len(known_tokens) + 1):
                    if tokens[i:i+len(known_tokens)] == known_tokens:
                        return known

        for section in candidate_sections:
            tokens = [t for t in section.split() if t.isalpha()]
            for t in tokens:
                if t not in stop_words and len(t) > 1:
                    return t.upper()

        return "OTHERS"

    # EXCLUDE SHARES from AMC summary
    for h in holdings:
        # Skip if it's equity/shares
        if str(h.get("type", "")).lower() in {"equity", "share", "shares", "stock", "stocks","govt security","nps","corporate bond"}:
            continue
            
        fund_name = h.get("fund_name") or ""
        val = float(h.get("valuation") or 0)
        amc = extract_amc_name(fund_name)
        if val <= 0:
            continue
        amc_summary[amc] = amc_summary.get(amc, 0) + val

    top_amc = sorted(
        [{"amc": k, "value": round(v, 2)} for k, v in amc_summary.items()],
        key=lambda x: x["value"],
        reverse=True
    )[:10]

    # -------------------------------------------------
    # TOP 10 CATEGORIES (by sub_category) - EXCLUDING SHARES
    # -------------------------------------------------
    subcat_summary = {}
    for h in holdings:
        # Skip if it's equity/shares
        if str(h.get("type", "")).lower() in {"shares", "share", "equity", "stock", "stocks", "govt security", "nps","corporate bond"}:
            continue
            
        sub = h.get("sub_category") or "Unclassified"
        val = float(h.get("valuation") or 0)
        subcat_summary[sub] = subcat_summary.get(sub, 0) + val

    top_category = sorted(
        [{"category": k, "value": round(v, 2)} for k, v in subcat_summary.items()],
        key=lambda x: x["value"],
        reverse=True
    )[:10]

    # -------------------------------------------------
    # CLEAN HOLDINGS FOR FRONTEND
    # -------------------------------------------------
    clean_holdings = []
    for h in holdings:
        qty = float(h.get("units") or 0)
        clean_holdings.append({
            "company": h.get("fund_name") or "Unknown Fund",
            "isin": h.get("isin_no") or "-",
            "category": h.get("category") or "N/A",
            "sub_category": h.get("sub_category") or "N/A",
            "quantity": qty,  # Now always a float (even if 0)
            "nav": float(h.get("nav") or 0),
            "invested_amount": float(h.get("invested_amount") or 0),
            "value": float(h.get("valuation") or 0),
            "type": h.get("type") or "N/A",
            # We are not providing scheme_type and amc, so they will be undefined in React
        })
    # -------------------------------------------------
    # FINAL RESPONSE
    # -------------------------------------------------
    return jsonify({
        "summary": {
            "invested_value_mf": round(mf_invested, 2),
            "current_value_mf": round(mf_value, 2),
            "profit_mf": round(profit, 2),
            "profit_percent_mf": round(profit_percent, 2),
            "equity_value": round(equity_value, 2),
            "total_portfolio_value": round(total_value, 2)
        },
        "asset_allocation": asset_allocation,
        "top_amc": top_amc,
        "top_category": top_category,
        "holdings": clean_holdings,
        "filters": {"user": include_user, "members": per_family_ids},
    }), 200

# ---------- History ----------
@app.route("/history-data")
def history_data():
    """Return summary of all uploaded portfolios (user + family members)."""
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    conn = get_db_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    # ✅ Step 1: Find user's family_id
    cur.execute("SELECT family_id FROM users WHERE user_id = %s", (user_id,))
    family = cur.fetchone()
    family_id = family["family_id"] if family else None
    if not family_id:
        cur.close()
        conn.close()
        return jsonify({"error": "Family not found"}), 404

    # ✅ Step 2: Fetch all portfolios belonging to user OR their family members
    cur.execute("""
        SELECT 
            p.portfolio_id,
            MAX(p.created_at) AS uploaded_at,
            COALESCE(SUM(p.valuation), 0) AS total_value
        FROM portfolios p
        LEFT JOIN family_members fm ON p.member_id = fm.id
        LEFT JOIN users u ON p.user_id = u.user_id
        WHERE (u.user_id = %s OR fm.family_id = %s)
        GROUP BY p.portfolio_id
        ORDER BY uploaded_at DESC, p.portfolio_id DESC
    """, (user_id, family_id))
    portfolio_rows = cur.fetchall()

    # ✅ Step 3: For each portfolio, get member info (who contributed)
    history = []
    for r in portfolio_rows:
        pid = r["portfolio_id"]
        uploaded_at = r["uploaded_at"]
        total = r["total_value"]
        upload_date = uploaded_at.isoformat() if uploaded_at else None

        # Find members who have data in this portfolio
        cur.execute("""
            SELECT DISTINCT 
                COALESCE(fm.name, 'You') AS member_name
            FROM portfolios p
            LEFT JOIN family_members fm ON p.member_id = fm.id
            LEFT JOIN users u ON p.user_id = u.user_id
            WHERE p.portfolio_id = %s
              AND (u.user_id = %s OR fm.family_id = %s)
        """, (pid, user_id, family_id))
        member_rows = cur.fetchall()
        member_names = [m["member_name"] for m in member_rows]
        member_count = len(member_names)

        history.append({
            "portfolio_id": int(pid),
            "upload_date": upload_date,
            "total_value": float(total or 0),
            "member_count": member_count,
            "members": member_names,
        })

    cur.close()
    conn.close()
    return jsonify(history), 200

#----------------------Member Portfolios---------------------------------
from flask import jsonify, session
from psycopg2.extras import RealDictCursor
from db import get_db_conn

@app.route("/portfolio/<int:portfolio_id>/members", methods=["GET"])
def portfolio_with_members(portfolio_id):
    """
    Historical portfolio breakdown:
      - Member-wise holdings
      - Member-wise + All Members graph data (AMC, Category, Allocation)
      - NAV, units, invested, values, categories, subcategories
    """

    # -----------------------------
    # 0️⃣ AUTH CHECK
    # -----------------------------
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    conn = get_db_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    # -----------------------------
    # 1️⃣ GET FAMILY ID
    # -----------------------------
    cur.execute("SELECT family_id FROM users WHERE user_id = %s", (user_id,))
    row = cur.fetchone()
    family_id = row["family_id"] if row else None

    if not family_id:
        cur.close()
        conn.close()
        return jsonify({"error": "Family not found"}), 404

    # -----------------------------
    # 2️⃣ FETCH ALL HOLDINGS FOR THIS HISTORICAL PORTFOLIO
    # -----------------------------
    cur.execute("""
        SELECT 
            p.member_id,
            fm.name AS member_name,
            p.fund_name,
            p.isin_no,
            p.units,
            p.nav,
            p.invested_amount,
            p.valuation,
            p.type,
            p.category,
            p.sub_category
        FROM portfolios p
        LEFT JOIN family_members fm ON p.member_id = fm.id
        JOIN users u ON p.user_id = u.user_id
        WHERE p.portfolio_id = %s
          AND (u.user_id = %s OR fm.family_id = %s)
        ORDER BY p.member_id NULLS FIRST, p.fund_name
    """, (portfolio_id, user_id, family_id))

    rows = cur.fetchall()
    if not rows:
        cur.close()
        conn.close()
        return jsonify({"error": "No holdings found"}), 404

    # -----------------------------
    # 3️⃣ GROUP HOLDINGS BY MEMBER
    # -----------------------------
    members = {}
    all_holdings = []

    for r in rows:
        mid = r["member_id"]
        name = r["member_name"] or "You"

        if mid not in members:
            members[mid] = {
                "label": name,
                "member_id": mid,
                "holdings": []
            }

        holding = {
            "company": r["fund_name"],
            "isin": r["isin_no"],
            "quantity": float(r["units"] or 0),
            "nav": float(r["nav"] or 0),
            "invested_amount": float(r["invested_amount"] or 0),
            "value": float(r["valuation"] or 0),
            "category": r["category"] or "N/A",
            "sub_category": r["sub_category"] or "Unclassified",
            "type": r["type"] or "N/A"
        }

        members[mid]["holdings"].append(holding)
        all_holdings.append(holding)

    # -----------------------------
    # AMC DETECTION UTIL LOGIC
    # -----------------------------
    junk_terms = [
        "DIRECT PLAN","DIRECT GROWTH","PLAN GROWTH","GROWTH PLAN","PLAN- GROWTH",
        "GROWTH OPTION","GROWTH","IDCW","DIR GR","DIRECT PLAN-GROWTH",
        "EQUITY SHARES","PLAN","OPTION","REGULAR DIRECT","TERMS","INR","LIMITED",
        "SCHEME","FUND MANAGEMENT","#","NEW"
    ]

    stop_words = {
        "SMALL","CAP","LARGE","MID","OPPORTUNITIES","OPPORTUNITY","YIELD",
        "STRATEGY","COMMODITIES","INFRASTRUCTURE","SERVICES","BFSI",
        "DIVIDEND","CONSUMPTION","ESG","BANKING","FINANCIAL","FLEXI",
        "FLEXI CAP","FLEXI-CAP","TIER"
    }

    known_amcs = sorted([
        "SBI","HDFC","ICICI PRUDENTIAL","KOTAK","AXIS","NIPPON INDIA",
        "ADITYA BIRLA SUN LIFE","TATA","UTI","DSP","IDFC","CANARA ROBECO",
        "SUNDARAM","FRANKLIN TEMPLETON","HSBC","BARODA BNP PARIBAS",
        "MIRAE ASSET","MOTILAL OSWAL","PGIM","QUANT","BANDHAN",
        "JM FINANCIAL","INVESCO","MAHINDRA MANULIFE","SAMCO",
        "WHITE OAK","TRUST","PARAG PARIKH","EDELWEISS","ITI","NAVI",
        "UNION","TAURUS","BOI AXA","LIC","INDIABULLS","SHRIRAM",
        "ABSL","BNP PARIBAS","GOLDMAN SACHS","MIRAE","PRINCIPAL",
        "L&T","IDBI","JIFFY","ADITYA BIRLA","ICICI","PRUDENTIAL",
        "SUN LIFE","BIRLA SUN LIFE"
    ], key=lambda x: -len(x))

    def extract_amc_name(text):
        if not text:
            return "OTHERS"

        t = text.upper()
        for junk in junk_terms:
            t = t.replace(junk, "")
        t = t.strip()

        parts = [t]
        if "-" in t:
            parts.append(t.split("-", 1)[1].strip())

        for p in parts:
            for amc in known_amcs:
                if p.startswith(amc) or f" {amc} " in f" {p} ":
                    return amc

        words = t.split()
        for w in words:
            if w not in stop_words and len(w) > 1:
                return w

        return "OTHERS"

    # -----------------------------
    # 4️⃣ PER-MEMBER COMPUTATION
    # -----------------------------
    member_results = []

    SKIP_TYPES = {
        "equity","share","shares","stock","stocks",
        "govt security","nps","corporate bond"
    }

    for mid, data in members.items():
        holdings = data["holdings"]
        total_value = sum(h["value"] for h in holdings)

        # ---- Asset Allocation ----
        alloc_map = {}
        for h in holdings:
            cat = h["category"]
            alloc_map[cat] = alloc_map.get(cat, 0) + h["value"]

        asset_allocation = [{
            "category": c,
            "value": round(v, 2),
            "percentage": round((v / total_value * 100), 2) if total_value else 0
        } for c, v in alloc_map.items()]
        asset_allocation.sort(key=lambda x: x["value"], reverse=True)

        # ---- AMC ----
        amc_map = {}
        for h in holdings:
            if h["type"].lower() in SKIP_TYPES:
                continue
            amc = extract_amc_name(h["company"])
            amc_map[amc] = amc_map.get(amc, 0) + h["value"]

        top_amc = sorted(
            [{"amc": k, "value": round(v, 2)} for k, v in amc_map.items()],
            key=lambda x: x["value"],
            reverse=True
        )[:10]

        # ---- Category ----
        subcat_map = {}
        for h in holdings:
            if h["type"].lower() in SKIP_TYPES:
                continue
            sub = h["sub_category"]
            subcat_map[sub] = subcat_map.get(sub, 0) + h["value"]

        top_category = sorted(
            [{"category": k, "value": round(v, 2)} for k, v in subcat_map.items()],
            key=lambda x: x["value"],
            reverse=True
        )[:10]

        # ---- Final Member Entry ----
        member_results.append({
            "label": data["label"],
            "member_id": mid,
            "summary": {"total": round(total_value, 2)},
            "holdings": holdings,
            "asset_allocation": asset_allocation,
            "top_amc": top_amc,
            "top_category": top_category
        })

    # -----------------------------
    # 5️⃣ BUILD “ALL MEMBERS” ENTRY
    # -----------------------------
    all_total_value = sum(h["value"] for h in all_holdings)

    # Asset allocation
    alloc_map = {}
    for h in all_holdings:
        cat = h["category"]
        alloc_map[cat] = alloc_map.get(cat, 0) + h["value"]

    all_asset_allocation = [{
        "category": c,
        "value": round(v, 2),
        "percentage": round((v / all_total_value * 100), 2) if all_total_value else 0
    } for c, v in alloc_map.items()]
    all_asset_allocation.sort(key=lambda x: x["value"], reverse=True)

    # AMC
    amc_map = {}
    for h in all_holdings:
        if h["type"].lower() in SKIP_TYPES:
            continue
        amc = extract_amc_name(h["company"])
        amc_map[amc] = amc_map.get(amc, 0) + h["value"]

    all_top_amc = sorted(
        [{"amc": k, "value": round(v, 2)} for k, v in amc_map.items()],
        key=lambda x: x["value"],
        reverse=True
    )[:10]

    # Category
    subcat_map = {}
    for h in all_holdings:
        if h["type"].lower() in SKIP_TYPES:
            continue
        sub = h["sub_category"]
        subcat_map[sub] = subcat_map.get(sub, 0) + h["value"]

    all_top_category = sorted(
        [{"category": k, "value": round(v, 2)} for k, v in subcat_map.items()],
        key=lambda x: x["value"],
        reverse=True
    )[:10]

    # ADD first entry
    all_entry = {
        "label": "All Members",
        "member_id": None,
        "summary": {"total": round(all_total_value, 2)},
        "holdings": all_holdings,
        "asset_allocation": all_asset_allocation,
        "top_amc": all_top_amc,
        "top_category": all_top_category
    }

    # Prepend it
    member_results = [all_entry] + member_results

    # -----------------------------
    # 6️⃣ RETURN COMPLETE RESPONSE
    # -----------------------------
    cur.close()
    conn.close()

    return jsonify({
        "portfolio_id": portfolio_id,
        "members": member_results
    }), 200


# ---------- Delete Portfolio ----------
@app.route("/delete-portfolio/<int:portfolio_id>", methods=["DELETE"])
def delete_portfolio(portfolio_id):
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    conn = get_db_conn()
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) AS count FROM portfolios WHERE user_id=%s AND portfolio_id=%s",
                (user_id, portfolio_id))
    row = cur.fetchone()
    count = row["count"] if isinstance(row, dict) else row[0]

    if count == 0:
        cur.close()
        conn.close()
        return jsonify({"error": "Portfolio not found"}), 404

    cur.execute("DELETE FROM portfolios WHERE user_id=%s AND portfolio_id=%s",
                (user_id, portfolio_id))
    conn.commit()
    cur.close()
    conn.close()
    print(f"✅ Deleted portfolio {portfolio_id} for user {user_id}")
    return jsonify({"message": f"Portfolio {portfolio_id} deleted successfully"}), 200


# -----------------------------------------------------
# FAMILY ROUTES
# -----------------------------------------------------

@app.route("/upload-member", methods=["POST"])
def upload_member_ecas():
    """Upload ECAS PDF for a specific family member and store parsed holdings."""
    if "user_id" not in session:
        return jsonify({"error": "Unauthorized"}), 401

    user_id = session["user_id"]
    per_family_member_id = request.form.get("member_id", type=int)  # frontend sends member_id (1,2,3...)
    pdf_password = request.form.get("password")
    file = request.files.get("file")

    if not file or per_family_member_id is None:
        return jsonify({"error": "File and member ID are required"}), 400

    conn = None
    cur = None

    try:
        conn = get_db_conn()
        cur = conn.cursor(cursor_factory=RealDictCursor)

        # -------------------------------------------------------------
        # 1️⃣ Convert per-family member_id --> global PK id
        # -------------------------------------------------------------
        cur.execute("""
            SELECT fm.id AS global_id, fm.family_id
            FROM family_members fm
            JOIN users u ON u.family_id = fm.family_id
            WHERE fm.member_id = %s 
              AND u.user_id = %s
        """, (per_family_member_id, user_id))

        member_row = cur.fetchone()

        if not member_row:
            return jsonify({"error": "Unauthorized: member not in your family"}), 403

        global_member_id = member_row["global_id"]
        family_id = member_row["family_id"]

        # -------------------------------------------------------------
        # 2️⃣ Find latest portfolio for this user
        # -------------------------------------------------------------
        cur.execute("""
            SELECT MAX(portfolio_id) AS latest_portfolio
            FROM portfolios
            WHERE user_id = %s
        """, (user_id,))
        result = cur.fetchone()
        latest_portfolio_id = result["latest_portfolio"] if result and result["latest_portfolio"] else 1

        # Close DB before file operations
        cur.close()
        conn.close()

        # -------------------------------------------------------------
        # 3️⃣ Save uploaded file
        # -------------------------------------------------------------
        member_folder = os.path.join(UPLOAD_FOLDER, f"member_{global_member_id}")
        os.makedirs(member_folder, exist_ok=True)

        file_path = os.path.join(
            member_folder,
            f"portfolio_{latest_portfolio_id}_{secure_filename(file.filename)}"
        )
        file.save(file_path)

        print(f"📄 Processing ECAS: user={user_id}, member_global_id={global_member_id}, portfolio={latest_portfolio_id}")

        # -------------------------------------------------------------
        # 4️⃣ Parse & Insert holdings
        # -------------------------------------------------------------
        result = process_ecas_file(
            file_path=file_path,
            user_id=user_id,
            portfolio_id=latest_portfolio_id,
            password=pdf_password,
            member_id=global_member_id   # IMPORTANT: pass global PK
        )

        return jsonify({
            "message": "Member ECAS uploaded successfully",
            "member_id": per_family_member_id,
            "global_member_id": global_member_id,
            "portfolio_id": latest_portfolio_id,
            "total_value": result.get("total_value", 0),
            "holdings_count": len(result.get("holdings", [])),
        }), 200

    except Exception as e:
        print("❌ Error uploading member ECAS:", e)
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


#-------------------add-members-----------------------

@app.route("/family/add-member", methods=["POST"])
def add_family_member():
    if "user_id" not in session:
        return jsonify({"error": "Unauthorized"}), 401

    user_id = session["user_id"]

    conn = get_db_conn()
    cur = conn.cursor()

    # Get family_id
    cur.execute("SELECT family_id FROM users WHERE user_id = %s", (user_id,))
    row = cur.fetchone()
    if not row:
        cur.close()
        conn.close()
        return jsonify({"error": "User not found"}), 404

    family_id = row[0] if isinstance(row, tuple) else row["family_id"]

    data = request.get_json() or {}
    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    phone = (data.get("phone") or "").strip()

    if not name:
        return jsonify({"error": "Name is required"}), 400

    try:
        # 1️⃣ Get next member_id per family
        cur.execute("""
            SELECT COALESCE(MAX(member_id), 0) + 1
            FROM family_members
            WHERE family_id = %s
        """, (family_id,))
        
        row_member = cur.fetchone()
        next_member_id = (
            row_member[0] if isinstance(row_member, tuple)
            else list(row_member.values())[0]
        )

        # 2️⃣ Insert
        cur.execute("""
            INSERT INTO family_members (
                family_id, member_id, name, email, phone, created_at
            )
            VALUES (%s, %s, %s, %s, %s, NOW())
            RETURNING member_id
        """, (family_id, next_member_id, name, email or None, phone or None))

        result = cur.fetchone()
        member_id = (
            result[0] if isinstance(result, tuple)
            else result["member_id"]
        )

        conn.commit()
        cur.close()
        conn.close()

        return jsonify({
            "message": "Family member added successfully",
            "member": {
                "member_id": member_id,
                "name": name,
                "email": email,
                "phone": phone
            }
        }), 201

    except Exception as e:
        print("❌ Error adding family member:", e)
        traceback.print_exc()
        conn.rollback()
        cur.close()
        conn.close()
        return jsonify({"error": str(e)}), 500

#--------------------delete-member----------------------
@app.route("/family/delete-member/<int:member_id>", methods=["DELETE"])
def delete_family_member(member_id):
    if "user_id" not in session:
        return jsonify({"error": "Unauthorized"}), 401

    user_id = session["user_id"]

    conn = get_db_conn()
    cur = conn.cursor()

    try:
        # ✅ Get the family_id of the current user
        cur.execute("SELECT family_id FROM users WHERE user_id = %s", (user_id,))
        row = cur.fetchone()
        if not row:
            cur.close()
            conn.close()
            return jsonify({"error": "User not found"}), 404

        family_id = row["family_id"] if isinstance(row, dict) else row[0]

        # ✅ Check if the member exists and belongs to the same family
        cur.execute(
            "SELECT member_id FROM family_members WHERE member_id = %s AND family_id = %s",
            (member_id, family_id),
        )
        member = cur.fetchone()
        if not member:
            cur.close()
            conn.close()
            return jsonify({"error": "Family member not found or unauthorized"}), 404

        # ✅ Delete the member safely
        cur.execute(
            "DELETE FROM family_members WHERE member_id = %s AND family_id = %s",
            (member_id, family_id),
        )
        conn.commit()

        cur.close()
        conn.close()

        return jsonify({
            "message": "Family member deleted successfully",
            "member_id": member_id
        }), 200

    except Exception as e:
        print("❌ Error deleting family member:", e)
        traceback.print_exc()
        conn.rollback()
        cur.close()
        conn.close()
        return jsonify({"error": str(e)}), 500

#--------------------get-members------------------------
@app.route("/family/members", methods=["GET"])
@login_required
def get_family_members():
    user = get_current_user()
    if not user:
        return jsonify({"error": "Unauthorized"}), 401

    try:
        conn = get_db_conn()
        cur = conn.cursor()
        cur.execute(
            """
            SELECT member_id, name, email, phone, created_at
            FROM family_members
            WHERE family_id = %s
            ORDER BY created_at ASC
            """,
            (user["family_id"],),
        )
        members = cur.fetchall()
        cur.close()
        conn.close()

        return jsonify([
            {
                "member_id": m["member_id"] if isinstance(m, dict) else m[0],
                "name": m["name"] if isinstance(m, dict) else m[1],
                "email": m["email"] if isinstance(m, dict) else m[2],
                "phone": m["phone"] if isinstance(m, dict) else m[3],
                "created_at": (
                    m["created_at"].isoformat() if isinstance(m, dict) and m["created_at"]
                    else (m[4].isoformat() if len(m) > 4 and m[4] else None)
                ),
            }
            for m in members
        ])

    except Exception as e:
        print("❌ Error fetching family members:", e)
        return jsonify({"error": "Could not fetch family members"}), 500

# ---------- Session Routes ----------
@app.route("/check-session")
def check_session():
    logged_in = session.get("user_id") is not None

    if not logged_in:
        return jsonify({"logged_in": False}), 200

    return jsonify({
        "logged_in": True,
        "user_id": session.get("user_id"),
        "email": session.get("user_email"),
        "role": session.get("role"),  # ✅ SEND ROLE TO FRONTEND
        "phone": session.get("phone")
    }), 200



@app.route("/session-user", methods=["GET"])
def session_user():
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"error": "Not logged in"}), 401

    conn = get_db_conn()
    cur = conn.cursor()
    cur.execute("""
        SELECT u.user_id, u.email, u.phone, r.role_name
        FROM users u
        JOIN user_roles ur ON u.user_id = ur.user_id
        JOIN roles r ON ur.role_id = r.role_id
        WHERE u.user_id = %s
    """, (user_id,))
    user = cur.fetchone()
    cur.close()
    conn.close()

    if not user:
        return jsonify({"error": "User not found"}), 404

    return jsonify({
        "user": {
            "user_id": user["user_id"],
            "email": user["email"],
            "phone": user["phone"],
            "role": user["role_name"]
        }
    }), 200
# -----------------------------------------------------
# USER SIDE — SERVICE REQUESTS
# -----------------------------------------------------
VALID_REQUEST_TYPES = {"Change Email", "Change Phone", "Portfolio Update", "General Query"}
VALID_REQUEST_STATUSES = {"pending", "processing", "completed", "rejected"}

ALLOWED_PORTFOLIO_COLUMNS = {
    "member_id",
    "valuation",
    "fund_name",
    "booking_date",
    "isin_no",
    "transaction_no",
    "type",
    "units",
    "invested_amount",
    "nav",
    "category",
    "sub_category",
}

# -------------------------
# USER SIDE — SERVICE REQUESTS
# -------------------------

# Create a request
@app.route("/service-requests", methods=["POST"])
@login_required
def create_service_request():
    data = request.get_json() or {}
    user_id = session.get("user_id")
    family_id = session.get("family_id")  # optional; prefer server-side family check when available

    req_type = data.get("request_type")
    description = data.get("description", "")
    member_input = data.get("member_id")  # per-family member_id (1,2,3...)

    if not req_type or req_type not in VALID_REQUEST_TYPES:
        return jsonify({"error": "Invalid or missing request_type"}), 400

    conn = get_db_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    try:
        # Resolve per-family member id (client sends) -> canonical family_members.id
        if member_input is not None:
            # Try to obtain family_id from session; if missing, fetch from users table
            if not family_id:
                family_id = fetch_user_family_id(cur, user_id)
                if family_id is None:
                    return jsonify({"error": "Requesting user/family not found"}), 404

            canonical_member_id = resolve_per_family_member_to_canonical(cur, family_id, member_input)
            if not canonical_member_id:
                return jsonify({"error": "Invalid member_id for this family"}), 400
        else:
            canonical_member_id = None

        sql = """
            INSERT INTO service_requests (
                user_id, member_id, request_type, description, status, created_at
            ) VALUES (%s, %s, %s, %s, 'pending', now())
            RETURNING *
        """

        cur.execute(sql, (user_id, canonical_member_id, req_type, description))
        new_req = cur.fetchone()
        conn.commit()
    except Exception as e:
        conn.rollback()
        cur.close()
        conn.close()
        return jsonify({"error": "Failed to create request", "detail": str(e)}), 500

    cur.close()
    conn.close()
    return jsonify(new_req), 201


# Get own requests
@app.route("/service-requests", methods=["GET"])
@login_required
def user_get_requests():
    user_id = session.get("user_id")
    conn = get_db_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    try:
        cur.execute(
            """
            SELECT 
                sr.id,
                sr.request_id,
                sr.user_id,
                sr.member_id,
                sr.request_type,
                sr.description,
                sr.status,
                sr.created_at,
                sr.updated_at,
                sr.admin_description,
                COALESCE(fm.name, 'Self') AS member_name
            FROM service_requests sr
            LEFT JOIN family_members fm ON fm.id = sr.member_id
            WHERE sr.user_id = %s
            ORDER BY sr.created_at DESC

            """,
            (user_id,),
        )
        rows = cur.fetchall()
    except Exception as e:
        cur.close()
        conn.close()
        return jsonify({"error": "Failed to fetch requests", "detail": str(e)}), 500

    cur.close()
    conn.close()
    return jsonify(rows), 200


# Delete own request (only pending)
@app.route("/service-requests/<int:req_id>", methods=["DELETE"])
@login_required
def user_delete_request(req_id: int):
    user_id = session.get("user_id")
    conn = get_db_conn()
    cur = conn.cursor()

    try:
        cur.execute(
            """
            DELETE FROM service_requests
            WHERE id = %s AND user_id = %s AND status = 'pending'
            RETURNING id
            """,
            (req_id, user_id),
        )
        deleted = cur.fetchone()
        if not deleted:
            conn.rollback()
            cur.close()
            conn.close()
            return jsonify({"error": "Cannot delete this request (not found / not pending / not yours)"}), 400
        conn.commit()
    except Exception as e:
        conn.rollback()
        cur.close()
        conn.close()
        return jsonify({"error": "Failed to delete request", "detail": str(e)}), 500

    cur.close()
    conn.close()
    return jsonify({"message": "Deleted", "id": deleted[0] if isinstance(deleted, tuple) else deleted}), 200


# -------------------------
# ADMIN SIDE
# -------------------------

# Admin list requests
@app.route("/admin/service-requests", methods=["GET"])
@login_required
@admin_required
def admin_get_requests():
    req_type = request.args.get("type")
    conn = get_db_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    try:
        sql = """
            SELECT
                sr.id, sr.user_id, sr.member_id,
                sr.request_type, sr.description,
                sr.status, sr.created_at, sr.admin_description,
                u.email AS user_name,
                COALESCE(fm.name, 'Self') AS member_name
            FROM service_requests sr
            JOIN users u ON u.user_id = sr.user_id
            LEFT JOIN family_members fm ON fm.id = sr.member_id
        """
        params = []
        if req_type:
            sql += " WHERE sr.request_type = %s"
            params.append(req_type)
        sql += " ORDER BY sr.created_at DESC"
        cur.execute(sql, tuple(params))
        rows = cur.fetchall()
    except Exception as e:
        cur.close()
        conn.close()
        return jsonify({"error": "Failed to fetch admin requests", "detail": str(e)}), 500

    cur.close()
    conn.close()
    return jsonify(rows), 200


# Admin update basic fields
@app.route("/admin/service-requests/<int:req_id>", methods=["PUT"])
@login_required
@admin_required
def admin_update_request(req_id: int):
    data = request.get_json() or {}
    status = data.get("status")
    admin_description = data.get("admin_description")

    if status is not None and status not in VALID_REQUEST_STATUSES:
        return jsonify({"error": "Invalid status"}), 400

    conn = get_db_conn()
    cur = conn.cursor()

    try:
        set_clauses = []
        params = []
        if status is not None:
            set_clauses.append("status = %s")
            params.append(status)
        if admin_description is not None:
            set_clauses.append("admin_description = COALESCE(%s, admin_description)")
            params.append(admin_description)

        if not set_clauses:
            cur.close()
            conn.close()
            return jsonify({"error": "No fields to update"}), 400

        params.append(req_id)
        sql = f"UPDATE service_requests SET {', '.join(set_clauses)} WHERE id = %s RETURNING id"
        cur.execute(sql, tuple(params))
        updated = cur.fetchone()
        if not updated:
            conn.rollback()
            cur.close()
            conn.close()
            return jsonify({"error": "Request not found"}), 404
        conn.commit()
    except Exception as e:
        conn.rollback()
        cur.close()
        conn.close()
        return jsonify({"error": "Failed to update request", "detail": str(e)}), 500

    cur.close()
    conn.close()
    return jsonify({"message": "Updated", "id": updated["id"] if isinstance(updated, dict) and "id" in updated else updated}), 200


# Admin delete
@app.route("/admin/service-requests/<int:req_id>", methods=["DELETE"])
@login_required
@admin_required
def admin_delete_request(req_id: int):
    conn = get_db_conn()
    cur = conn.cursor()

    try:
        cur.execute("DELETE FROM service_requests WHERE id = %s RETURNING id", (req_id,))
        deleted = cur.fetchone()
        if not deleted:
            conn.rollback()
            cur.close()
            conn.close()
            return jsonify({"error": "Request not found"}), 404
        conn.commit()
    except Exception as e:
        conn.rollback()
        cur.close()
        conn.close()
        return jsonify({"error": "Failed to delete request", "detail": str(e)}), 500

    cur.close()
    conn.close()
    return jsonify({"message": "Deleted", "id": deleted[0] if isinstance(deleted, tuple) else deleted}), 200


# Admin helper: get portfolio ids
@app.route("/admin/user/<int:user_id>/portfolio-ids", methods=["GET"])
@login_required
@admin_required
def admin_get_user_portfolio_ids(user_id: int):
    conn = get_db_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    try:
        cur.execute(
            """
            SELECT DISTINCT portfolio_id
            FROM portfolios
            WHERE user_id = %s
            ORDER BY portfolio_id ASC
            """,
            (user_id,),
        )
        rows = cur.fetchall()
        ids = [r["portfolio_id"] for r in rows]
    except Exception as e:
        cur.close()
        conn.close()
        return jsonify({"error": "Failed to fetch portfolio ids", "detail": str(e)}), 500

    cur.close()
    conn.close()
    return jsonify({"portfolio_ids": ids}), 200


# Admin helper: get portfolios by portfolio_id
@app.route("/admin/user/<int:user_id>/portfolios", methods=["GET"])
@login_required
@admin_required
def admin_get_user_portfolios_by_portfolio_id(user_id: int):
    portfolio_id = request.args.get("portfolio_id")
    if not portfolio_id:
        return jsonify({"error": "portfolio_id query param required"}), 400

    conn = get_db_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    try:
        cur.execute(
            """
            SELECT id, portfolio_id, user_id, member_id, valuation, fund_name, booking_date,
                   isin_no, transaction_no, created_at, type, units, invested_amount, nav, category, sub_category
            FROM portfolios
            WHERE user_id = %s AND portfolio_id = %s
            ORDER BY id ASC
            """,
            (user_id, portfolio_id),
        )
        rows = cur.fetchall()
    except Exception as e:
        cur.close()
        conn.close()
        return jsonify({"error": "Failed to fetch portfolios", "detail": str(e)}), 500

    cur.close()
    conn.close()
    return jsonify(rows), 200


# -------------------------
# Admin perform endpoint (single unified)
# -------------------------
@app.route("/admin/service-requests/<int:req_id>/perform", methods=["POST"])
@login_required
@admin_required
def admin_perform_request_handler(req_id: int):
    payload = request.get_json() or {}
    admin_desc = payload.get("admin_description")

    conn = get_db_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    try:
        cur.execute("SELECT * FROM service_requests WHERE id = %s", (req_id,))
        req_row = cur.fetchone()
        if not req_row:
            cur.close()
            conn.close()
            return jsonify({"error": "Request not found"}), 404

        request_type = req_row["request_type"]
        request_user_id = req_row["user_id"]
        target_member_canonical_id = req_row.get("member_id")  # canonical family_members.id or None

        # If target_member is provided, validate it belongs to the request user's family
        if target_member_canonical_id is not None:
            cur.execute("SELECT family_id FROM users WHERE user_id = %s", (request_user_id,))
            urow = cur.fetchone()
            if not urow:
                return jsonify({"error": "Requesting user not found"}), 404
            family_id = urow["family_id"]

            cur.execute("SELECT id FROM family_members WHERE family_id = %s AND id = %s", (family_id, target_member_canonical_id))
            fm = cur.fetchone()
            if not fm:
                return jsonify({"error": "Target family member not found in user's family"}), 404

        # Handle types
        if request_type == "Change Email":
            new_email = payload.get("new_email")
            if not new_email:
                return jsonify({"error": "new_email is required"}), 400

            if target_member_canonical_id is not None:
                cur.execute("UPDATE family_members SET email = %s WHERE id = %s", (new_email, target_member_canonical_id))
            else:
                cur.execute("UPDATE users SET email = %s WHERE user_id = %s", (new_email, request_user_id))

        elif request_type == "Change Phone":
            new_phone = payload.get("new_phone")
            if not new_phone:
                return jsonify({"error": "new_phone is required"}), 400

            if target_member_canonical_id is not None:
                cur.execute("UPDATE family_members SET phone = %s WHERE id = %s", (new_phone, target_member_canonical_id))
            else:
                cur.execute("UPDATE users SET phone = %s WHERE user_id = %s", (new_phone, request_user_id))

        elif request_type == "Portfolio Update":
            portfolio_entry_id = payload.get("portfolio_entry_id")
            fields = payload.get("fields", {})
            if not portfolio_entry_id or not isinstance(fields, dict) or not fields:
                return jsonify({"error": "portfolio_entry_id and fields are required"}), 400

            cur.execute("SELECT * FROM portfolios WHERE id = %s", (portfolio_entry_id,))
            p = cur.fetchone()
            if not p:
                return jsonify({"error": "Portfolio entry not found"}), 404
            if p["user_id"] != request_user_id:
                return jsonify({"error": "Portfolio entry does not belong to user"}), 403

            set_clauses = []
            params = []
            for k, v in fields.items():
                if k not in ALLOWED_PORTFOLIO_COLUMNS:
                    continue
                set_clauses.append(f"{k} = %s")
                params.append(v)

            if not set_clauses:
                return jsonify({"error": "No valid fields to update"}), 400

            params.append(portfolio_entry_id)
            sql = f"UPDATE portfolios SET {', '.join(set_clauses)} WHERE id = %s"
            cur.execute(sql, tuple(params))

        elif request_type == "General Query":
            # nothing to modify besides admin_description and marking complete
            pass

        else:
            return jsonify({"error": f"Unsupported request type {request_type}"}), 400

        # Mark completed + optionally save admin_description
        cur.execute(
            """
            UPDATE service_requests
            SET status = 'completed',
                admin_description = COALESCE(%s, admin_description),
                updated_at = now()
            WHERE id = %s
            RETURNING id, status
            """,
            (admin_desc, req_id),
        )
        updated = cur.fetchone()
        if not updated:
            conn.rollback()
            cur.close()
            conn.close()
            return jsonify({"error": "Failed to mark request completed"}), 500

        conn.commit()
    except Exception as e:
        conn.rollback()
        cur.close()
        conn.close()
        return jsonify({"error": "Error performing request", "detail": str(e)}), 500

    cur.close()
    conn.close()
    return jsonify({"message": "Request performed and marked completed", "request": updated}), 200

# -----------------------------------------------------
# ADMIN: Add a note to a request (no status change)
# -----------------------------------------------------
@app.route("/admin/service-requests/<int:req_id>/add-note", methods=["PATCH"])
@login_required
@admin_required
def admin_add_note(req_id):
    data = request.get_json() or {}
    note = data.get("admin_description")

    if not note:
        return jsonify({"error": "admin_description is required"}), 400

    conn = get_db_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    try:
        cur.execute("""
            UPDATE service_requests
            SET admin_description = %s,
                updated_at = now()
            WHERE id = %s
            RETURNING id, admin_description, updated_at
        """, (note, req_id))

        row = cur.fetchone()
        if not row:
            conn.rollback()
            cur.close()
            conn.close()
            return jsonify({"error": "Request not found"}), 404
        
        conn.commit()

    except Exception as e:
        conn.rollback()
        cur.close()
        conn.close()
        return jsonify({"error": "Failed to add note", "detail": str(e)}), 500

    cur.close()
    conn.close()

    return jsonify({"message": "Note added", "request": row}), 200
from psycopg2.extras import RealDictCursor

@app.route("/admin/stats")
def admin_stats():
    try:
        conn = get_db_conn()
        cur = conn.cursor(cursor_factory=RealDictCursor)

        # -------------------------
        # USERS
        # -------------------------
        cur.execute("SELECT COUNT(*) AS total FROM users")
        total_users = cur.fetchone()["total"]

        cur.execute("""
            SELECT user_id, email, phone, created_at
            FROM users
            ORDER BY created_at DESC
        """)
        users = [
            {
                "user_id": r["user_id"],
                "email": r["email"],
                "phone": r["phone"],
                "created_at": r["created_at"].isoformat() if r["created_at"] else None
            }
            for r in cur.fetchall()
        ]

        # -------------------------
        # FAMILIES / FAMILY MEMBERS
        # -------------------------
        cur.execute("SELECT COUNT(*) AS total FROM families")
        total_families = cur.fetchone()["total"]

        cur.execute("SELECT COUNT(*) AS total FROM family_members")
        total_family_members = cur.fetchone()["total"]

        # -------------------------
        # PORTFOLIOS — BASIC
        # -------------------------
        cur.execute("""
            SELECT COUNT(DISTINCT portfolio_id) AS total 
            FROM portfolios
        """)
        total_portfolios = cur.fetchone()["total"]

        cur.execute("SELECT COUNT(*) AS total FROM portfolios")
        total_holdings = cur.fetchone()["total"]

        cur.execute("""
            SELECT COALESCE(SUM(invested_amount), 0) AS total 
            FROM portfolios
        """)
        total_invested = cur.fetchone()["total"]

        cur.execute("""
            SELECT COALESCE(SUM(valuation), 0) AS total 
            FROM portfolios
        """)
        total_valuation = cur.fetchone()["total"]

        # -------------------------
        # PER-USER PORTFOLIO STATS
        # -------------------------
        cur.execute("""
            SELECT 
                user_id,
                COUNT(DISTINCT portfolio_id) AS total_portfolios,
                COUNT(*) AS total_holdings,
                COALESCE(SUM(invested_amount), 0) AS total_invested,
                COALESCE(SUM(valuation), 0) AS total_valuation
            FROM portfolios
            GROUP BY user_id
            ORDER BY user_id;
        """)
        per_user_stats = [
            {
                "user_id": r["user_id"],
                "total_portfolios": r["total_portfolios"],
                "total_holdings": r["total_holdings"],
                "total_invested": float(r["total_invested"]),
                "total_valuation": float(r["total_valuation"])
            }
            for r in cur.fetchall()
        ]

        # -------------------------
        # PER-FAMILY-MEMBER STATS
        # -------------------------
        cur.execute("""
            SELECT 
                member_id,
                COUNT(*) AS total_holdings,
                COUNT(DISTINCT portfolio_id) AS total_portfolios,
                COALESCE(SUM(invested_amount), 0) AS total_invested,
                COALESCE(SUM(valuation), 0) AS total_valuation
            FROM portfolios
            WHERE member_id IS NOT NULL
            GROUP BY member_id
            ORDER BY member_id;
        """)
        per_member_stats = [
            {
                "member_id": r["member_id"],
                "total_portfolios": r["total_portfolios"],
                "total_holdings": r["total_holdings"],
                "total_invested": float(r["total_invested"]),
                "total_valuation": float(r["total_valuation"])
            }
            for r in cur.fetchall()
        ]

        # -------------------------
        # SERVICE REQUESTS
        # -------------------------
        cur.execute("SELECT COUNT(*) AS total FROM service_requests")
        total_requests = cur.fetchone()["total"]

        cur.execute("""
            SELECT 
                TO_CHAR(created_at, 'YYYY-MM') AS month,
                COUNT(*) AS total
            FROM service_requests
            GROUP BY month
            ORDER BY month
        """)
        monthly_requests = [{"month": r["month"], "count": r["total"]} for r in cur.fetchall()]

        cur.execute("""
            SELECT status, COUNT(*) AS total
            FROM service_requests
            GROUP BY status
        """)
        status_breakdown = {r["status"]: r["total"] for r in cur.fetchall()}

        cur.close()
        conn.close()

        return jsonify({
            "users": {
                "total": total_users,
                "list": users
            },
            "families": total_families,
            "family_members": total_family_members,

            "portfolio_stats": {
                "total_portfolios": total_portfolios,
                "total_holdings": total_holdings,
                "total_invested": float(total_invested),
                "total_valuation": float(total_valuation),
                "per_user": per_user_stats,
                "per_member": per_member_stats
            },

            "requests": {
                "total": total_requests,
                "monthly": monthly_requests,
                "status": status_breakdown
            }
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({
            "error": "Failed to load stats",
            "message": str(e)
        }), 500

# app.py (Flask) - replace the admin_user_detail function with this version
from psycopg2.extras import RealDictCursor

@app.route("/admin/user/<int:user_id>")
def admin_user_detail(user_id):
    try:
        conn = get_db_conn()
        cur = conn.cursor(cursor_factory=RealDictCursor)

        # -----------------------------------------
        # 1. USER INFO (including family_id if present)
        # -----------------------------------------
        cur.execute("""
            SELECT user_id, email, phone, family_id, created_at
            FROM users
            WHERE user_id = %s
        """, (user_id,))
        user = cur.fetchone()

        if not user:
            cur.close()
            conn.close()
            return jsonify({"error": "User not found"}), 404

        family_id = user.get("family_id")

        # -----------------------------------------
        # 2. ALL HOLDINGS (rows belonging to this user)
        # -----------------------------------------
        cur.execute("""
            SELECT *
            FROM portfolios
            WHERE user_id = %s
            ORDER BY created_at DESC
        """, (user_id,))
        holdings = cur.fetchall()

        # -----------------------------------------
        # 3. PORTFOLIO IDs (distinct)
        # -----------------------------------------
        cur.execute("""
            SELECT DISTINCT portfolio_id
            FROM portfolios
            WHERE user_id = %s
            ORDER BY portfolio_id
        """, (user_id,))
        portfolio_ids = [r["portfolio_id"] for r in cur.fetchall()]

        # -----------------------------------------
        # 4. FAMILY MEMBERS (use family_id if present)
        #    if family_id is missing, return empty list
        # -----------------------------------------
        family_members = []
        if family_id is not None:
            cur.execute("""
                SELECT member_id, name
                FROM family_members
                WHERE family_id = %s
                ORDER BY member_id
            """, (family_id,))
            family_members = cur.fetchall()

        # -----------------------------------------
        # 5. MONTHLY UPLOADS (YYYY-MM)
        # -----------------------------------------
        monthly_counts = {}
        for row in holdings:
            created = row.get("created_at")
            if created:
                # created is a datetime
                month_key = created.strftime("%Y-%m")
                monthly_counts[month_key] = monthly_counts.get(month_key, 0) + 1

        monthly_uploads = [
            {"month": m, "count": monthly_counts[m]}
            for m in sorted(monthly_counts.keys())
        ]

        # -----------------------------------------
        # 6. TOTALS
        # -----------------------------------------
        total_holdings = len(holdings)
        total_portfolios = len(set([h["portfolio_id"] for h in holdings]))

        total_invested = sum(float(h.get("invested_amount") or 0) for h in holdings)
        total_valuation = sum(float(h.get("valuation") or h.get("invested_amount") or 0) for h in holdings)

        # -----------------------------------------
        # 7. ASSET / CATEGORY ALLOCATION (same logic as main dashboard)
        #    Use valuation when present, otherwise invested_amount as fallback.
        # -----------------------------------------
        asset_summary = {}
        for h in holdings:
            cat = h.get("category") or "Unclassified"
            # prefer valuation, fallback to invested_amount, fallback to 0
            val = float(h.get("valuation") if h.get("valuation") is not None else (h.get("invested_amount") or 0))
            asset_summary[cat] = asset_summary.get(cat, 0) + val

        asset_allocation = []
        total_val = sum(asset_summary.values())

        for cat, val in asset_summary.items():
            pct = (val / total_val * 100) if total_val > 0 else 0
            asset_allocation.append({
                "category": cat,
                "value": round(val, 2),
                "percentage": round(pct, 2)
            })

        asset_allocation.sort(key=lambda x: x["value"], reverse=True)

        # -----------------------------------------
        # 8. Close and return JSON (keep previous fields intact)
        # -----------------------------------------
        cur.close()
        conn.close()

        return jsonify({
            "user": {
                "user_id": user["user_id"],
                "email": user["email"],
                "phone": user["phone"],
                "created_at": user["created_at"].isoformat() if user["created_at"] else None
            },
            "family_members": family_members,
            "portfolio_ids": portfolio_ids,
            "holdings": holdings,
            "stats": {
                "total_portfolios": total_portfolios,
                "total_holdings": total_holdings,
                "total_invested": total_invested,
                "total_valuation": total_valuation,
                "monthly_uploads": monthly_uploads
            },
            # NEW: asset_allocation identical to main dashboard format
            "asset_allocation": asset_allocation
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# ---------- Serve React ----------
@app.errorhandler(404)
def not_found(e):
    if os.path.exists(os.path.join(app.static_folder, "index.html")):
        return send_from_directory(app.static_folder, "index.html")
    return jsonify({"error": "Not found"}), 404


if __name__ == "__main__":
    app.run(debug=True, port=5000)
