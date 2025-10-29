from flask import Flask, request, jsonify, send_from_directory, session
from flask_cors import CORS
from flask_session import Session  # ✅ add this
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
    SESSION_TYPE="filesystem",           # store session on disk (not signed cookie)
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

# -----------------------------------------------------
# ROUTES
# -----------------------------------------------------
@app.route("/")
def home():
    return jsonify({"message": "Flask backend running ✅"})

# ---------- Register ----------
@app.route("/register", methods=["POST"])
def register():
    data = request.get_json()
    email, phone, password = data.get("email"), data.get("phone"), data.get("password")
    if not all([email, phone, password]):
        return jsonify({"error": "All fields required"}), 400
    if find_user(email):
        return jsonify({"error": "User already exists"}), 409
    user = create_user(email, phone, password)
    return jsonify({"message": "Registered successfully", "user": user}), 201

# ---------- Login ----------
@app.route("/login", methods=["POST"])
def login():
    data = request.get_json()
    email, password = data.get("email"), data.get("password")

    user = find_user(email)
    if not user:
        return jsonify({"error": "User not found"}), 404
    if not check_password_hash(user["password_hash"], password):
        return jsonify({"error": "Invalid password"}), 401

    # ✅ Create session
    session["user_id"] = user["user_id"]
    session["user_email"] = email
    print(f"✅ Logged in {email}")

    return jsonify({"message": "Login successful"}), 200

# ---------- Logout ----------
@app.route("/logout", methods=["POST"])
def logout():
    session.clear()
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

# ---------- History ----------
@app.route("/history-data")
def history_data():
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    conn = get_db_conn()
    cur = conn.cursor()

    # Group by portfolio_id (one history entry per upload/batch)
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

    # rows will be sequence of dict-like rows if connection used RealDictCursor.
    # If rows are tuples, adapt accordingly (index 0 -> portfolio_id, 1 -> uploaded_at, 2 -> total_value).
    history = []
    for r in rows:
        # Support both RealDictCursor and regular cursor tuples
        if isinstance(r, dict) or hasattr(r, "keys"):
            pid = r.get("portfolio_id")
            uploaded_at = r.get("uploaded_at")
            total = r.get("total_value") or 0
        else:
            pid = r[0]
            uploaded_at = r[1]
            total = r[2] or 0

        # ensure a JSON-friendly date string (ISO)
        upload_date = uploaded_at.isoformat() if uploaded_at is not None else None

        history.append({
            "portfolio_id": int(pid) if pid is not None else None,
            "upload_date": upload_date,
            "total_value": float(total)
        })

    return jsonify(history), 200


# ---------- Session Check ----------
@app.route("/check-session")
def check_session():
    return jsonify(dict(session))

# ---------- Serve React ----------
@app.errorhandler(404)
def not_found(e):
    if os.path.exists(os.path.join(app.static_folder, "index.html")):
        return send_from_directory(app.static_folder, "index.html")
    return jsonify({"error": "Not found"}), 404


if __name__ == "__main__":
    app.run(debug=True, port=5000)
