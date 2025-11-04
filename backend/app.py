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
    SESSION_COOKIE_SAMESITE="None",      # allow cross-origin (React <-> Flask)
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
@app.route("/dashboard-data")
def dashboard_data():
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    conn = get_db_conn()
    cur = conn.cursor()
    cur.execute("""
        SELECT fund_name AS company, isin_no AS isin, closing_balance AS value, type AS category
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


# ---------- Portfolio Detail ----------
@app.route("/portfolio/<int:portfolio_id>", methods=["GET"])
def portfolio_detail(portfolio_id):
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    conn = get_db_conn()
    cur = conn.cursor()
    cur.execute("""
        SELECT fund_name AS company, isin_no AS isin, closing_balance AS value, type AS category
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
        SELECT portfolio_id, MAX(created_at) AS uploaded_at, COALESCE(SUM(closing_balance), 0) AS total_value
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
    if "user_id" not in session:
        return jsonify({"error": "Unauthorized"}), 401

    user_id = session["user_id"]
    family_member_id = request.form.get("member_id")
    pdf_password = request.form.get("password")
    file = request.files.get("file")

    if not file or not family_member_id:
        return jsonify({"error": "File and member ID are required"}), 400

    try:
        conn = get_db_conn()
        cur = conn.cursor()

        # ✅ Verify that member belongs to current user's family
        cur.execute("""
            SELECT fm.family_id 
            FROM family_members fm
            JOIN users u ON u.family_id = fm.family_id
            WHERE fm.member_id = %s AND u.user_id = %s
        """, (family_member_id, user_id))
        valid = cur.fetchone()
        if not valid:
            cur.close()
            conn.close()
            return jsonify({"error": "Unauthorized: member not in your family"}), 403

        # ✅ Generate next portfolio_id for that member
        cur.execute("""
            SELECT COALESCE(MAX(portfolio_id), 0) + 1 AS next_id
            FROM portfolios
            WHERE member_id = %s
        """, (family_member_id,))
        next_row = cur.fetchone()
        next_portfolio_id = next_row["next_id"] if isinstance(next_row, dict) else next_row[0]
        cur.close()
        conn.close()

        # ✅ Save the uploaded file
        member_folder = os.path.join(UPLOAD_FOLDER, f"member_{family_member_id}")
        os.makedirs(member_folder, exist_ok=True)
        from werkzeug.utils import secure_filename
        file_path = os.path.join(member_folder, f"portfolio_{next_portfolio_id}_{secure_filename(file.filename)}")
        file.save(file_path)

        print(f"📄 Processing ECAS for member {family_member_id}, portfolio {next_portfolio_id}")
        result = process_ecas_file(file_path, user_id, next_portfolio_id, pdf_password, member_id=family_member_id)

        return jsonify({
            "message": "Member portfolio uploaded successfully",
            "member_id": family_member_id,
            "portfolio_id": next_portfolio_id,
            "total_value": result["total_value"],
            "holdings_count": len(result["holdings"]),
        }), 200

    except Exception as e:
        print("❌ Error uploading member ECAS:", e)
        import traceback; traceback.print_exc()
        return jsonify({"error": str(e)}), 500

import traceback

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


@app.route("/family/dashboard", methods=["GET"])
@login_required
def family_dashboard():
    user = get_current_user()
    if not user:
        return jsonify({"error": "Unauthorized"}), 401

    try:
        conn = get_db_conn()
        cur = conn.cursor()
        cur.execute("""
            SELECT 
                p.fund_name,
                p.closing_balance,
                p.isin_no,
                COALESCE(fm.name, 'You') AS member_name
            FROM portfolios p
            LEFT JOIN family_members fm ON p.member_id = fm.member_id
            WHERE p.user_id IN (SELECT user_id FROM users WHERE family_id = %s)
               OR fm.family_id = %s
        """, (user["family_id"], user["family_id"]))
        rows = cur.fetchall()
        cur.close()
        conn.close()

        total_value = sum(float(r["closing_balance"] if isinstance(r, dict) else r[1] or 0) for r in rows)
        holdings = [
            {
                "fund_name": r["fund_name"] if isinstance(r, dict) else r[0],
                "isin": r["isin_no"] if isinstance(r, dict) else r[2],
                "value": float(r["closing_balance"] if isinstance(r, dict) else r[1] or 0),
                "member_name": r["member_name"] if isinstance(r, dict) else r[3],
            }
            for r in rows
        ]

        return jsonify({
            "family_id": user["family_id"],
            "total_value": total_value,
            "holdings": holdings
        })

    except Exception as e:
        print("❌ Error fetching family dashboard:", e)
        return jsonify({"error": "Could not fetch family dashboard"}), 500

@app.route("/family/member/<int:member_id>/dashboard", methods=["GET"])
@login_required
def family_member_dashboard(member_id):
    user = get_current_user()
    if not user:
        return jsonify({"error": "Unauthorized"}), 401

    try:
        conn = get_db_conn()
        cur = conn.cursor()

        # Verify the member actually belongs to the logged-in user's family
        cur.execute(
            "SELECT name, email FROM family_members WHERE member_id = %s AND family_id = %s",
            (member_id, user["family_id"]),
        )
        member = cur.fetchone()
        if not member:
            cur.close()
            conn.close()
            return jsonify({"error": "Family member not found"}), 404

        member_name = member["name"] if isinstance(member, dict) else member[0]
        member_email = member["email"] if isinstance(member, dict) else member[1]

        # Fetch all portfolio holdings for this member
        cur.execute("""
            SELECT 
                fund_name,
                isin_no,
                closing_balance,
                type
            FROM portfolios
            WHERE member_id = %s
            ORDER BY fund_name ASC
        """, (member_id,))

        holdings = cur.fetchall()
        cur.close()
        conn.close()

        if not holdings:
            return jsonify({
                "member_id": member_id,
                "member_name": member_name,
                "member_email": member_email,
                "total_value": 0,
                "holdings": [],
                "message": "No portfolios found for this family member."
            }), 200

        # Calculate totals
        total_value = sum(float(h["closing_balance"] if isinstance(h, dict) else h[2] or 0) for h in holdings)
        equity = sum(float(h["closing_balance"] if isinstance(h, dict) and h["type"] == "Equity"
                            else (h[2] if len(h) > 3 and h[3] == "Equity" else 0))
                     for h in holdings)
        mf = sum(float(h["closing_balance"] if isinstance(h, dict) and h["type"] == "Mutual Fund"
                        else (h[2] if len(h) > 3 and h[3] == "Mutual Fund" else 0))
                 for h in holdings)

        holdings_list = [
            {
                "fund_name": h["fund_name"] if isinstance(h, dict) else h[0],
                "isin_no": h["isin_no"] if isinstance(h, dict) else h[1],
                "closing_balance": float(h["closing_balance"] if isinstance(h, dict) else h[2] or 0),
                "category": h["type"] if isinstance(h, dict) else (h[3] if len(h) > 3 else None),
            }
            for h in holdings
        ]

        return jsonify({
            "member_id": member_id,
            "member_name": member_name,
            "member_email": member_email,
            "total_value": total_value,
            "equity_value": equity,
            "mf_value": mf,
            "holdings": holdings_list
        }), 200

    except Exception as e:
        print("❌ Error fetching member dashboard:", e)
        return jsonify({"error": "Could not fetch member dashboard"}), 500

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


# ---------- Serve React ----------
@app.errorhandler(404)
def not_found(e):
    if os.path.exists(os.path.join(app.static_folder, "index.html")):
        return send_from_directory(app.static_folder, "index.html")
    return jsonify({"error": "Not found"}), 404


if __name__ == "__main__":
    app.run(debug=True, port=5000)
