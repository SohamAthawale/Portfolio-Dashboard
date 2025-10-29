# tryecas.py
from ecasparser import process_ecas_file
import json
import os

def main():
    # Default path
    default_path = r'/Users/sohamathawale/Desktop/pms_portfolio-main/backend/ECAS soham.pdf'

    # Ask for file path (optional)
    pdf_path = input(f"Enter path to ECAS PDF [default: {default_path}]: ").strip()
    if not pdf_path:
        pdf_path = default_path

    if not os.path.exists(pdf_path):
        print(f"❌ File not found: {pdf_path}")
        return

    # Ask for password if required
    pwd = input("Enter PDF password (press Enter if none): ").strip() or None

    print("\n📄 Parsing ECAS file...\n")
    result = process_ecas_file(pdf_path, password=pwd)

    # Print summary
    print("\n--- PARSE SUMMARY ---")
    print(f"Total Portfolio Value: ₹{result['total_value']:.2f}")
    print(f"Holdings Found: {len(result['holdings'])}\n")

    # Display each holding
    for i, h in enumerate(result["holdings"], start=1):
        print(f"{i}. {h['type']}: {h['fund_name']} ({h['isin_no']}) - ₹{h['closing_balance']:.2f}")

    # Save as JSON for quick review
    output_path = "ecas_output.json"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
    print(f"\n✅ Results saved to {output_path}\n")

if __name__ == "__main__":
    main()
