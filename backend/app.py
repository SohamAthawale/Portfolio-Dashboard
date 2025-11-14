import traceback
from flask import Flask, request, jsonify, send_from_directory, session
from flask_cors import CORS
from flask_session import Session
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
def find_user(email):
    conn = get_db_conn()
    cur = conn.cursor()
    cur.execute("SELECT * FROM users WHERE email=%s", (email,))
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


def assign_default_role(user_id):
    """Assign the 'user' role to a new user automatically."""
    conn = get_db_conn()
    cur = conn.cursor()
    cur.execute("SELECT role_id FROM roles WHERE role_name = 'user'")
    row = cur.fetchone()
    if not row:
        cur.close()
        conn.close()
        raise Exception("Default 'user' role not found in roles table")
    role_id = row["role_id"] if isinstance(row, dict) else row[0]
    cur.execute("""
        INSERT INTO user_roles (user_id, role_id, scope)
        VALUES (%s, %s, %s)
    """, (user_id, role_id, 'default'))
    conn.commit()
    cur.close()
    conn.close()


# -----------------------------------------------------
# SESSION AUTH HELPERS
# -----------------------------------------------------
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


# -----------------------------------------------------
# ROUTES
# -----------------------------------------------------
@app.route("/")
def home():
    return jsonify({"message": "Flask backend running ✅"})


# ---------- Register ----------
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
    cur = conn.cursor()
    cur.execute("SELECT * FROM users WHERE phone=%s", (phone,))
    existing_phone = cur.fetchone()
    cur.close()
    conn.close()
    if existing_phone:
        return jsonify({"error": "Phone number already registered"}), 409

    try:
        user = create_user(email, phone, password)
        user_id = user["user_id"] if isinstance(user, dict) else user[0]
        assign_default_role(user_id)
        return jsonify({
            "message": "Registered successfully",
            "user": {
                "user_id": user_id,
                "email": email,
                "phone": phone,
                "role": "user"
            }
        }), 201
    except Exception as e:
        print("❌ Registration error:", e)
        return jsonify({"error": "Error creating user"}), 500


# ---------- Login ----------
@app.route("/login", methods=["POST"])
def login():
    data = request.get_json() or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password", "")

    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400

    user = find_user(email)
    if not user:
        return jsonify({"error": "No account found for this email"}), 404

    if not check_password_hash(user["password_hash"], password):
        return jsonify({"error": "Incorrect password"}), 401

    user_id = user["user_id"]

    conn = get_db_conn()
    cur = conn.cursor()
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
    role = role_row["role_name"] if isinstance(role_row, dict) else (role_row[0] if role_row else "user")

    session["user_id"] = user_id
    session["user_email"] = user["email"]
    session["role"] = role

    print(f"✅ Logged in {email} as {role}")
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
    Returns enriched dashboard data for the user + selected members:
      - Total invested, current value, profit/loss
      - Model asset allocation (Equity, Debt, Hybrid, Gold)
      - Top AMCs and Top Categories
      - Detailed Holdings
    """

    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    include_user = request.args.get("include_user", "true").lower() == "true"
    members_param = request.args.get("members", "")
    member_ids = [int(x) for x in members_param.split(",") if x.strip().isdigit()] if members_param else []

    # If no user or member selected
    if not include_user and not member_ids:
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

    # ✅ Get only the latest portfolios for each user/member
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

    cur.execute(query, (include_user, user_id, member_ids))
    holdings = cur.fetchall()

    # -------------------------------------------------
    # If no holdings, return empty structure
    # -------------------------------------------------
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
            "filters": {"user": include_user, "members": member_ids},
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

    total_value = mf_value + equity_value

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
        "FLEXI CAP", "FLEXI-CAP"
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
        if str(h.get("type", "")).lower() in {"equity", "share", "shares", "stock", "stocks"}:
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
        if str(h.get("type", "")).lower() in {"equity", "share", "shares", "stock", "stocks"}:
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
        "filters": {"user": include_user, "members": member_ids},
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
@app.route("/portfolio/<int:portfolio_id>/members", methods=["GET"])
def portfolio_with_members(portfolio_id):
    """
    Returns all holdings (user + family members) for a specific historical portfolio_id.
    Includes:
      - Member-wise holdings summary
      - NAV, Quantity, Invested Amount
      - Top 10 AMCs (excluding shares)
      - Top 10 Categories (excluding shares)
      - Model Asset Allocation
    """
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    conn = get_db_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    # ✅ Step 1: Get user's family_id
    cur.execute("SELECT family_id FROM users WHERE user_id = %s", (user_id,))
    family = cur.fetchone()
    family_id = family["family_id"] if family else None
    if not family_id:
        cur.close()
        conn.close()
        return jsonify({"error": "Family not found"}), 404

    # ✅ Step 2: Fetch all holdings (user + family members)
    cur.execute("""
        SELECT 
            p.member_id,
            fm.name AS member_name,
            p.fund_name,
            p.isin_no,
            p.units AS quantity,
            p.nav,
            p.invested_amount,
            p.valuation,
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
        return jsonify({"error": "No holdings found for this portfolio"}), 404

    # ✅ Step 3: Group holdings by member
    grouped = {}
    for r in rows:
        member_id = r["member_id"]
        member_name = r["member_name"] or "You"

        if member_id not in grouped:
            grouped[member_id] = {
                "label": member_name,
                "member_id": member_id,
                "holdings": [],
            }

        grouped[member_id]["holdings"].append({
            "company": r["fund_name"],
            "isin": r["isin_no"],
            "quantity": float(r["quantity"] or 0),
            "nav": float(r["nav"] or 0),
            "invested_amount": float(r["invested_amount"] or 0),
            "value": float(r["valuation"] or 0),
            "category": r["category"] or "N/A",
            "sub_category": r["sub_category"] or "Unclassified"
        })

    # ✅ Step 4: Summaries per member
    results = []
    all_holdings = []

    for m_id, data in grouped.items():
        holdings = data["holdings"]
        total = sum(h["value"] for h in holdings)

        # Create a breakdown of all categories dynamically
        category_summary = {}
        for h in holdings:
            cat = h.get("category") or "Unclassified"
            category_summary[cat] = category_summary.get(cat, 0) + h["value"]

        results.append({
            "label": data["label"],
            "member_id": m_id,
            "summary": {"total": total, **category_summary},
            "holdings": holdings
        })
        all_holdings.extend(holdings)
    # ✅ Step 5: Compute Top 10 AMCs (EXCLUDING SHARES)
    amc_summary = {}
    
    # Use the same comprehensive AMC list and logic from dashboard
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
        "FLEXI CAP", "FLEXI-CAP"
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

    def extract_amc_name(fund_name: str):
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
    for h in all_holdings:
        # Skip if it's shares/equity
        if h.get("category") == "Shares":
            continue
            
        fund_name = h.get("company") or ""
        val = float(h.get("value") or 0)
        amc = extract_amc_name(fund_name)
        if val <= 0:
            continue
        amc_summary[amc] = amc_summary.get(amc, 0) + val

    top_amc = sorted(
        [{"amc": k, "value": round(v, 2)} for k, v in amc_summary.items()],
        key=lambda x: x["value"],
        reverse=True
    )[:10]

    # ✅ Step 6: Compute Top 10 Categories (EXCLUDING SHARES)
    subcat_summary = {}
    for h in all_holdings:
        # Skip if it's shares/equity
        if h.get("category") == "Shares":
            continue
            
        sub = h["sub_category"]
        val = float(h["value"] or 0)
        if val > 0:
            subcat_summary[sub] = subcat_summary.get(sub, 0) + val

    top_category = sorted(
        [{"category": k, "value": round(v, 2)} for k, v in subcat_summary.items()],
        key=lambda x: x["value"],
        reverse=True
        )[:10]
    # ✅ Step 7: Model Asset Allocation (match dashboard)
    asset_summary = {}
    for h in all_holdings:
        cat = h.get("category") or "Others"
        val = float(h.get("value") or 0)
        asset_summary[cat] = asset_summary.get(cat, 0) + val

    # Calculate total portfolio value for percentage calculation
    total_portfolio_value = sum(asset_summary.values())

    asset_allocation = []
    for cat, val in asset_summary.items():
        pct = (val / total_portfolio_value * 100) if total_portfolio_value > 0 else 0
        asset_allocation.append({
            "category": cat,
            "value": round(val, 2),
            "percentage": round(pct, 2)
        })

    asset_allocation.sort(key=lambda x: x["value"], reverse=True)

    total_portfolio_value = sum(asset_summary.values())

    asset_allocation = []
    for cat, val in asset_summary.items():
        pct = (val / total_portfolio_value * 100) if total_portfolio_value > 0 else 0
        asset_allocation.append({
            "category": cat,
            "value": round(val, 2),
            "percentage": round(pct, 2)
        })

    asset_allocation.sort(key=lambda x: x["value"], reverse=True)

    cur.close()
    conn.close()

    # ✅ Step 8: Final response
    return jsonify({
        "portfolio_id": portfolio_id,
        "members": results,
        "top_amc": top_amc,
        "top_category": top_category,
        "asset_allocation": asset_allocation
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
    family_member_id = request.form.get("member_id", type=int)  # Must be family_members.id
    pdf_password = request.form.get("password")
    file = request.files.get("file")

    if not file or not family_member_id:
        return jsonify({"error": "File and member ID are required"}), 400

    conn = None
    cur = None

    try:
        conn = get_db_conn()
        cur = conn.cursor(cursor_factory=RealDictCursor)  # ✅ FIXED: RealDictCursor not dict

        # ✅ Step 1: Verify that the member belongs to the user's family
        cur.execute("""
            SELECT fm.family_id
            FROM family_members fm
            JOIN users u ON u.family_id = fm.family_id
            WHERE fm.id = %s AND u.user_id = %s
        """, (family_member_id, user_id))
        valid = cur.fetchone()
        if not valid:
            cur.close()
            conn.close()
            return jsonify({"error": "Unauthorized: member not in your family"}), 403

        # ✅ Step 2: Reuse SAME portfolio_id (latest) for this user
        cur.execute("""
            SELECT MAX(portfolio_id) AS latest_portfolio
            FROM portfolios
            WHERE user_id = %s
        """, (user_id,))
        result = cur.fetchone()
        latest_portfolio_id = result["latest_portfolio"] if result and result["latest_portfolio"] else 1

        cur.close()
        conn.close()

        # ✅ Step 3: Save uploaded file
        member_folder = os.path.join(UPLOAD_FOLDER, f"member_{family_member_id}")
        os.makedirs(member_folder, exist_ok=True)
        file_path = os.path.join(
            member_folder,
            f"portfolio_{latest_portfolio_id}_{secure_filename(file.filename)}"
        )
        file.save(file_path)

        print(f"📄 Processing ECAS for user={user_id}, member_id={family_member_id}, portfolio={latest_portfolio_id}")

        # ✅ Step 4: Parse and insert data (member_id now inserted properly)
        result = process_ecas_file(
            file_path=file_path,
            user_id=user_id,
            portfolio_id=latest_portfolio_id,
            password=pdf_password,
            member_id=family_member_id
        )

        return jsonify({
            "message": "Member portfolio uploaded successfully",
            "member_id": family_member_id,
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
    cur.execute("SELECT family_id FROM users WHERE user_id = %s", (user_id,))
    row = cur.fetchone()
    if not row:
        cur.close()
        conn.close()
        return jsonify({"error": "User not found"}), 404

    # ✅ Extract family_id safely from tuple or dict
    family_id = row["family_id"] if isinstance(row, dict) else row[0]

    data = request.get_json() or {}
    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    phone = (data.get("phone") or "").strip()

    if not name:
        return jsonify({"error": "Name is required"}), 400

    try:
        cur.execute(
            """
            INSERT INTO family_members (family_id, name, email, phone, created_at)
            VALUES (%s, %s, %s, %s, NOW())
            RETURNING member_id
            """,
            (family_id, name, email or None, phone or None),
        )
        result = cur.fetchone()
        conn.commit()

        # ✅ Extract member_id from dict or tuple
        member_id = result["member_id"] if isinstance(result, dict) else result[0]

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
    return jsonify({
        "logged_in": "user_id" in session,
        "user_id": session.get("user_id"),
        "email": session.get("user_email")
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
# SERVICE REQUESTS (USER + ADMIN)
# -----------------------------------------------------

# ---------- USER: Create New Request ----------
@app.route("/service-requests", methods=["POST"])
@login_required
def create_service_request():
    user_id = session["user_id"]
    data = request.get_json() or {}

    req_type = data.get("request_type")
    desc = data.get("description")

    if not req_type:
        return jsonify({"error": "request_type is required"}), 400

    conn = get_db_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    cur.execute("""
        INSERT INTO service_requests (user_id, request_type, description, status, created_at)
        VALUES (%s, %s, %s, 'pending', NOW())
        RETURNING id, request_id, request_type, description, status, created_at
    """, (user_id, req_type, desc))

    row = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()

    return jsonify(row), 201


# ---------- USER: Get My Requests ----------
@app.route("/service-requests", methods=["GET"])
@login_required
def get_my_service_requests():
    user_id = session["user_id"]

    conn = get_db_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    cur.execute("""
        SELECT id, request_id, request_type, description, status, created_at
        FROM service_requests
        WHERE user_id = %s
        ORDER BY created_at DESC
    """, (user_id,))

    rows = cur.fetchall()
    cur.close()
    conn.close()

    return jsonify(rows), 200


# ---------- USER: Delete Request ----------
@app.route("/service-requests/<int:req_id>", methods=["DELETE"])
@login_required
def delete_my_service_request(req_id):
    user_id = session["user_id"]

    conn = get_db_conn()
    cur = conn.cursor()

    cur.execute("""
        DELETE FROM service_requests 
        WHERE id = %s AND user_id = %s
        RETURNING id
    """, (req_id, user_id))

    deleted = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()

    if not deleted:
        return jsonify({"error": "Request not found or unauthorized"}), 404

    return jsonify({"message": "Request deleted"}), 200


# -----------------------------------------------------
# ADMIN SIDE
# -----------------------------------------------------

def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if session.get("role") != "admin":
            return jsonify({"error": "Admin access required"}), 403
        return f(*args, **kwargs)
    return decorated


# ---------- ADMIN: View All Requests ----------
@app.route("/admin/service-requests", methods=["GET"])
@login_required
def admin_get_requests():
    if session.get("role") != "admin":
        return jsonify({"error": "Admin only"}), 403

    conn = get_db_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    cur.execute("""
        SELECT sr.id, sr.request_id, sr.request_type, sr.description, sr.status, sr.created_at,
               u.email AS user_name
        FROM service_requests sr
        JOIN users u ON u.user_id = sr.user_id
        ORDER BY sr.created_at DESC
    """)

    rows = cur.fetchall()
    cur.close()
    conn.close()

    return jsonify(rows), 200


# ---------- ADMIN: Update Status ----------
@app.route("/admin/service-requests/<int:req_id>", methods=["PUT"])
@login_required
def admin_update_request(req_id):
    if session.get("role") != "admin":
        return jsonify({"error": "Admin only"}), 403

    data = request.get_json() or {}
    status = data.get("status")

    if status not in ["pending", "processing", "completed", "rejected"]:
        return jsonify({"error": "Invalid status"}), 400

    conn = get_db_conn()
    cur = conn.cursor()

    cur.execute("""
        UPDATE service_requests
        SET status = %s
        WHERE id = %s
        RETURNING id
    """, (status, req_id))

    updated = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()

    if not updated:
        return jsonify({"error": "Request not found"}), 404

    return jsonify({"message": "Updated successfully"}), 200



# ---------- ADMIN: Delete Any Request ----------
@app.route("/admin/service-requests/<int:id>", methods=["DELETE"])
@admin_required
def admin_delete_request(id):
    conn = get_db_conn()
    cur = conn.cursor()

    cur.execute("DELETE FROM service_requests WHERE id = %s", (id,))
    conn.commit()

    cur.close()
    conn.close()

    return jsonify({"message": "Request deleted"}), 200

# ---------- Serve React ----------
@app.errorhandler(404)
def not_found(e):
    if os.path.exists(os.path.join(app.static_folder, "index.html")):
        return send_from_directory(app.static_folder, "index.html")
    return jsonify({"error": "Not found"}), 404


if __name__ == "__main__":
    app.run(debug=True, port=5000)
