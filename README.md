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
## How It Works
User Login/Register:
- Credentials are verified and a session is created in Flask.
- Upload ECAS PDF:
- User uploads a PDF via the React form (optional password supported).
- PDF Parsing (Backend):
- Flask reads and parses the ECAS PDF using fitz and regex to extract structured data.
- Database Storage:
- Parsed holdings are inserted into PostgreSQL under the user’s portfolio ID.
- Dashboard Visualization:
- React fetches /dashboard-data and renders portfolio insights via charts and tables.
- History Tracking:
- The /history-data route aggregates portfolios by portfolio_id (each upload).
