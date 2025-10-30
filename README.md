# 🧾 Portfolio Management System (PMS)

A full-stack **React + Flask + PostgreSQL** web application that allows users to securely upload ECAS (Electronic Consolidated Account Statement) PDFs, automatically parse financial holdings (Equity, Mutual Funds, etc.), and visualize them through an interactive dashboard.

---

## 🚀 Features

- **User Authentication:** Secure login and registration with password hashing.  
- **PDF Parsing:** Automated extraction of portfolio data from CDSL/NSDL/CAMS/KFintech ECAS statements using `PyMuPDF`.  
- **Data Storage:** All holdings and portfolio data stored in PostgreSQL.  
- **Smart Parsing:** Extracts ISIN, company/fund name, and holding values using regex and structured parsing logic.  
- **Dynamic Dashboard:** Displays equity, mutual fund, and overall portfolio values in visual cards and charts.  
- **Portfolio History:** Tracks total value of each uploaded portfolio by portfolio ID.  
- **Cross-Origin Session Support:** Flask sessions persist across React frontend via Flask-Session and CORS.  
- **Secure Uploads:** Files are sanitized and stored in per-user directories.  

---

## 🧩 Tech Stack

### **Frontend**
- React (Vite)
- TypeScript
- TailwindCSS
- Framer Motion
- Recharts
- Lucide React Icons

### **Backend**
- Flask (Python)
- Flask-CORS
- Flask-Session
- Psycopg2 (PostgreSQL)
- PyMuPDF (`fitz`) for PDF parsing
- Werkzeug Security

### **Database**
- PostgreSQL

---

## ⚙️ Setup Instructions

### 1️⃣ Clone Repository
```bash
git clone https://github.com/yourusername/portfolio-management-system.git
cd portfolio-management-system
```

### 2️⃣ Setup Backend (Flask)
```bash
cd backend
python3 -m venv venv
source venv/bin/activate  # or venv\Scripts\activate (Windows)
pip install -r requirements.txt
```

**Run Flask:**
```bash
python app.py
```
Flask runs at: `http://127.0.0.1:5000`

---

### 3️⃣ Setup Frontend (React + Vite)
```bash
cd frontend
npm install
npm run dev
```
React runs at: `http://localhost:5173`

---

## 🔒 Session Configuration

Flask uses **Flask-Session** for persistent session storage.

```python
app.config.update(
    SESSION_TYPE="filesystem",
    SESSION_PERMANENT=True,
    SESSION_USE_SIGNER=True,
    SESSION_COOKIE_NAME="pms_session",
    SESSION_COOKIE_SAMESITE="None",
    SESSION_COOKIE_SECURE=False,  # Set True for HTTPS
)
```

And React requests always include credentials:
```typescript
fetch("http://127.0.0.1:5000/dashboard-data", {
  credentials: "include",
});
```

---

## 🧠 How It Works

1. **User Login/Register:**  
   Credentials are verified and a session is created in Flask.

2. **Upload ECAS PDF:**  
   User uploads a PDF via the React form (optional password supported).

3. **PDF Parsing (Backend):**  
   Flask reads and parses the ECAS PDF using `fitz` and regex to extract structured data.

4. **Database Storage:**  
   Parsed holdings are inserted into PostgreSQL under the user’s portfolio ID.

5. **Dashboard Visualization:**  
   React fetches `/dashboard-data` and renders portfolio insights via charts and tables.

6. **History Tracking:**  
   The `/history-data` route aggregates portfolios by **portfolio_id** (each upload).

---

## 📊 Database Schema (Simplified)

### **users**
| Column         | Type              | Description             |
|----------------|-------------------|-------------------------|
| user_id        | SERIAL PRIMARY KEY | Unique user identifier |
| email          | VARCHAR            | User email             |
| phone          | VARCHAR            | Phone number           |
| password_hash  | VARCHAR            | Hashed password        |

### **portfolios**
| Column           | Type        | Description                  |
|------------------|-------------|------------------------------|
| portfolio_id     | BIGINT      | Unique portfolio per user    |
| user_id          | BIGINT      | Foreign key to `users`       |
| fund_name        | VARCHAR     | Company or fund name         |
| isin_no          | VARCHAR     | ISIN identifier              |
| closing_balance  | NUMERIC     | Holding value                |
| created_at       | TIMESTAMP   | Upload timestamp             |

---

## 📦 Example API Endpoints

| Endpoint | Method | Description |
|-----------|--------|-------------|
| `/register` | POST | Register a new user |
| `/login` | POST | Authenticate user |
| `/upload` | POST | Upload ECAS PDF |
| `/dashboard-data` | GET | Fetch latest portfolio |
| `/history-data` | GET | Fetch historical portfolio data |
| `/logout` | POST | Clear session |

---

## 🧰 Development Notes

- Always include `credentials: 'include'` in frontend requests to keep Flask session cookies.  
- Run **backend first**, then frontend.  
- PDFs are saved inside `/uploads/user_<id>/portfolio_<id>_filename.pdf`.  
- Set `SESSION_COOKIE_SECURE=True` for production over HTTPS.

---

## 🌐 Deployment

- **Frontend:** Deploy via Vercel, Netlify, or Nginx.  
- **Backend:** Use Gunicorn / uWSGI with Nginx for Flask.  
- **Database:** Use managed PostgreSQL (e.g. Railway, Supabase, AWS RDS).  
- Update `CORS` origins and session cookie security for production.

---

## 📈 Example Output

```
✅ Logged in user: test@example.com
📄 Processing ECAS for user 1, portfolio 2
✅ Parsed ECAS for user 1, portfolio 2
💾 Inserted 4 holdings into DB
✅ Dashboard loaded successfully
```

---

## 🧑‍💻 Author

**Soham Athawale**  
📍 Portfolio Management System — 2025  
💡 Built with React, Flask, and PostgreSQL  
