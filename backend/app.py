from flask import Flask, request, jsonify, send_from_directory, session
from flask_cors import CORS
from flask_session import Session
from werkzeug.utils import secure_filename
from werkzeug.security import generate_password_hash, check_password_hash
import os
from ecasparser import process_ecas_file
from db import get_db_conn

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
    SESSION_COOKIE_SAMESITE="None",      # allow cross-origin (React <-> Flask)
    SESSION_COOKIE_SECURE=False,         # only True if you serve via HTTPS
)

Session(app)  # ✅ initialize Flask-Session

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
        "INSERT INTO users (email, phone, password_hash) VALUES (%s,%s,%s) RETURNING *",
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

    # ✅ Get 'user' role_id
    cur.execute("SELECT role_id FROM roles WHERE role_name = 'user'")
    row = cur.fetchone()
    if not row:
        cur.close()
        conn.close()
        raise Exception("Default 'user' role not found in roles table")

    role_id = row["role_id"] if isinstance(row, dict) else row[0]

    # ✅ Insert into user_roles (with scope optional)
    cur.execute("""
        INSERT INTO user_roles (user_id, role_id, scope)
        VALUES (%s, %s, %s)
    """, (user_id, role_id, 'default'))

    conn.commit()
    cur.close()
    conn.close()

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

    # --- Validate required fields ---
    if not email or not phone or not password:
        return jsonify({"error": "All fields are required"}), 400

    # --- Validate phone number ---
    if not phone.isdigit() or len(phone) != 10:
        return jsonify({"error": "Invalid phone number format"}), 400

    # --- Check for existing email ---
    existing_user = find_user(email)
    if existing_user:
        return jsonify({"error": "Email already registered"}), 409

    # --- Check for existing phone ---
    try:
        conn = get_db_conn()
        cur = conn.cursor()
        cur.execute("SELECT * FROM users WHERE phone=%s", (phone,))
        existing_phone = cur.fetchone()
        cur.close()
        conn.close()
    except Exception as e:
        print("⚠️ DB check error:", e)
        return jsonify({"error": "Server error checking phone"}), 500

    if existing_phone:
        return jsonify({"error": "Phone number already registered"}), 409

    # --- Create user and assign default role ---
    try:
        user = create_user(email, phone, password)
        user_id = user["user_id"] if isinstance(user, dict) else user[0]

        # ✅ Assign the "user" role
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

    # --- Validate inputs ---
    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400

    # --- Find user ---
    user = find_user(email)
    if not user:
        return jsonify({"error": "No account found for this email"}), 404

    # --- Validate password ---
    try:
        if not check_password_hash(user["password_hash"], password):
            return jsonify({"error": "Incorrect password"}), 401
    except Exception as e:
        print("⚠️ Password check failed:", e)
        return jsonify({"error": "Authentication error"}), 500

    user_id = user["user_id"]

    # --- Fetch role from user_roles + roles ---
    try:
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
    except Exception as e:
        print("⚠️ Role fetch error:", e)
        role = "user"  # fallback default

    # --- Create session ---
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

        # ✅ Next portfolio ID per user
        cur.execute("""
            SELECT COALESCE(MAX(portfolio_id), 0) + 1 AS next_id
            FROM portfolios
            WHERE user_id = %s
        """, (user_id,))
        row = cur.fetchone()
        next_portfolio_id = row["next_id"] if row else 1
        conn.close()

        # Save file
        user_folder = os.path.join(UPLOAD_FOLDER, f"user_{user_id}")
        os.makedirs(user_folder, exist_ok=True)
        file_path = os.path.join(user_folder, f"portfolio_{next_portfolio_id}_{secure_filename(file.filename)}")
        file.save(file_path)

        # Parse ECAS
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
@app.route("/dashboard-data")
def dashboard_data():
    user_id = session.get("user_id")
    if not user_id:
        print("⚠️ Unauthorized: no session")
        return jsonify({"error": "Unauthorized"}), 401

    conn = get_db_conn()
    cur = conn.cursor()
    cur.execute("""
        SELECT fund_name AS company, isin_no AS isin, closing_balance AS value,
               CASE WHEN fund_name ILIKE '%%fund%%' THEN 'Mutual Fund' ELSE 'Equity' END AS category
        FROM portfolios
        WHERE user_id = %s
          AND portfolio_id = (SELECT MAX(portfolio_id) FROM portfolios WHERE user_id = %s)
    """, (user_id, user_id))
    holdings = cur.fetchall()
    cur.close()
    conn.close()

    total = sum(float(h["value"] or 0) for h in holdings)
    equity = sum(float(h["value"] or 0) for h in holdings if h["category"] == "Equity")
    mf = sum(float(h["value"] or 0) for h in holdings if h["category"] == "Mutual Fund")

    return jsonify({
        "total_value": total,
        "equity_value": equity,
        "mf_value": mf,
        "bonds_value": 0,
        "holdings": holdings,
    }), 200


# ---------- Portfolio Detail (NEW) ----------
@app.route("/portfolio/<int:portfolio_id>", methods=["GET"])
def portfolio_detail(portfolio_id):
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    conn = get_db_conn()
    cur = conn.cursor()
    cur.execute("""
        SELECT fund_name AS company, isin_no AS isin, closing_balance AS value,
               CASE WHEN fund_name ILIKE '%%fund%%' THEN 'Mutual Fund' ELSE 'Equity' END AS category
        FROM portfolios
        WHERE user_id = %s AND portfolio_id = %s
        ORDER BY fund_name
    """, (user_id, portfolio_id))
    holdings = cur.fetchall()
    cur.close()
    conn.close()

    if not holdings:
        return jsonify({"error": "Portfolio not found"}), 404

    total = sum(float(h["value"] or 0) for h in holdings)
    equity = sum(float(h["value"] or 0) for h in holdings if h["category"] == "Equity")
    mf = sum(float(h["value"] or 0) for h in holdings if h["category"] == "Mutual Fund")

    return jsonify({
        "portfolio_id": portfolio_id,
        "total_value": total,
        "equity_value": equity,
        "mf_value": mf,
        "bonds_value": 0,
        "holdings": holdings,
    }), 200


# ---------- History ----------
@app.route("/history-data")
def history_data():
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    conn = get_db_conn()
    cur = conn.cursor()
    cur.execute("""
        SELECT
            portfolio_id,
            MAX(created_at) AS uploaded_at,
            COALESCE(SUM(closing_balance), 0) AS total_value
        FROM portfolios
        WHERE user_id = %s
        GROUP BY portfolio_id
        ORDER BY uploaded_at DESC, portfolio_id DESC
    """, (user_id,))
    rows = cur.fetchall()
    cur.close()
    conn.close()

    history = []
    for r in rows:
        pid = r["portfolio_id"] if isinstance(r, dict) else r[0]
        uploaded_at = r["uploaded_at"] if isinstance(r, dict) else r[1]
        total = r["total_value"] if isinstance(r, dict) else r[2]
        upload_date = uploaded_at.isoformat() if uploaded_at else None

        history.append({
            "portfolio_id": int(pid) if pid else None,
            "upload_date": upload_date,
            "total_value": float(total or 0),
        })

    return jsonify(history), 200
# -----------------------GET PORTFOLIO---------------------------------

@app.route("/portfolio/<int:portfolio_id>")
def get_portfolio(portfolio_id):
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    conn = get_db_conn()
    cur = conn.cursor()
    cur.execute("""
        SELECT fund_name AS company, isin_no AS isin, closing_balance AS value,
               CASE WHEN fund_name ILIKE '%%fund%%' THEN 'Mutual Fund' ELSE 'Equity' END AS category
        FROM portfolios
        WHERE user_id = %s AND portfolio_id = %s
    """, (user_id, portfolio_id))
    holdings = cur.fetchall()
    cur.close()
    conn.close()

    total = sum(float(h["value"] or 0) for h in holdings)
    equity = sum(float(h["value"] or 0) for h in holdings if h["category"] == "Equity")
    mf = sum(float(h["value"] or 0) for h in holdings if h["category"] == "Mutual Fund")

    return jsonify({
        "total_value": total,
        "equity_value": equity,
        "mf_value": mf,
        "bonds_value": 0,
        "holdings": holdings,
    })

# ---------- Delete Portfolio ----------
@app.route("/delete-portfolio/<int:portfolio_id>", methods=["DELETE"])
def delete_portfolio(portfolio_id):
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    try:
        conn = get_db_conn()
        cur = conn.cursor()

        # ✅ Check if portfolio exists and belongs to current user
        cur.execute(
            "SELECT COUNT(*) AS count FROM portfolios WHERE user_id=%s AND portfolio_id=%s",
            (user_id, portfolio_id),
        )
        row = cur.fetchone()
        count = row["count"] if isinstance(row, dict) else row[0]

        if count == 0:
            cur.close()
            conn.close()
            return jsonify({"error": "Portfolio not found"}), 404

        # ✅ Delete all entries for that portfolio
        cur.execute(
            "DELETE FROM portfolios WHERE user_id=%s AND portfolio_id=%s",
            (user_id, portfolio_id),
        )
        conn.commit()
        cur.close()
        conn.close()

        print(f"✅ Deleted portfolio {portfolio_id} for user {user_id}")
        return jsonify({"message": f"Portfolio {portfolio_id} deleted successfully"}), 200

    except Exception as e:
        print("❌ Delete error:", e)
        return jsonify({"error": str(e)}), 500


# ---------- Session Check ----------
@app.route("/check-session")
def check_session():
    return jsonify({
        "logged_in": "user_id" in session,
        "user_id": session.get("user_id"),
        "email": session.get("user_email")
    }), 200
# ---------- Session User ----------
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

# ---------- Serve React ----------
@app.errorhandler(404)
def not_found(e):
    if os.path.exists(os.path.join(app.static_folder, "index.html")):
        return send_from_directory(app.static_folder, "index.html")
    return jsonify({"error": "Not found"}), 404


if __name__ == "__main__":
    app.run(debug=True, port=5000)
