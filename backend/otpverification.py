import smtplib
from email.mime.text import MIMEText

SMTP_EMAIL = "asohamyt@gmail.com"
SMTP_PASSWORD = "ygek sszm fzhg reww"  # generated from App Passwords

def send_email_otp(to_email, otp):
    subject = "Your Login OTP"
    body = f"Your OTP is: {otp}\nThis OTP is valid for 5 minutes."

    msg = MIMEText(body)
    msg["Subject"] = subject
    msg["From"] = SMTP_EMAIL
    msg["To"] = to_email

    try:
        server = smtplib.SMTP("smtp.gmail.com", 587)
        server.starttls()
        server.login(SMTP_EMAIL, SMTP_PASSWORD)
        server.sendmail(SMTP_EMAIL, to_email, msg.as_string())
        server.quit()
        print("Email OTP sent successfully!")
    except Exception as e:
        print("Email sending failed:", e)
# ---------------------------------------------------------
# 📱 SMS OTP SENDER (SETUP DONE, BUT NOT ENABLED IN LOGIN)
# ---------------------------------------------------------

# def send_sms_otp(phone, otp):
#     print("SMS OTP prepared but disabled. OTP:", otp)
#     # In future: integrate Fast2SMS / MSG91 / SMS gateway / Android device API.
