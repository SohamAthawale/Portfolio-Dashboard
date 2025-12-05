from werkzeug.security import generate_password_hash
print(generate_password_hash("1111", method="scrypt"))
