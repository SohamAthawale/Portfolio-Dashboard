import fitz  # PyMuPDF
import re
from pathlib import Path


PDF_PATH = "/Users/sohamathawale/Desktop/APXXXXXX6R_23102025-21012026_CP202964029_21012026112806338 (1).pdf"


def debug_cams_text_extraction(pdf_path: str):
    if not Path(pdf_path).exists():
        print(f"❌ File not found: {pdf_path}")
        return

    doc = fitz.open(pdf_path)

    print("\n" + "=" * 120)
    print("🔍 CAMS PDF TEXT EXTRACTION DEBUG")
    print("=" * 120)

    for page_no, page in enumerate(doc, start=1):
        print(f"\n📄 PAGE {page_no}")
        print("=" * 120)

        # -------------------------------------------------
        # MODE 1: get_text("text")
        # -------------------------------------------------
        print("\n🟡 MODE 1: page.get_text('text')")
        print("-" * 80)
        text = page.get_text("text")
        print(text[:3000])
        print("\n[END MODE 1]\n")

        # -------------------------------------------------
        # MODE 2: get_text("blocks")
        # -------------------------------------------------
        print("\n🟢 MODE 2: page.get_text('blocks') (sorted)")
        print("-" * 80)
        blocks = page.get_text("blocks")
        blocks.sort(key=lambda b: (b[1], b[0]))  # top → bottom, left → right

        for idx, b in enumerate(blocks):
            blk_text = re.sub(r"[^\x00-\x7F]+", " ", b[4]).strip()
            if not blk_text:
                continue

            print(f"\n🔹 BLOCK {idx}")
            print(f"  X={b[0]:.1f}, Y={b[1]:.1f}, W={b[2]-b[0]:.1f}, H={b[3]-b[1]:.1f}")
            print("  TEXT:")
            print(blk_text)

        print("\n[END MODE 2]\n")

        # -------------------------------------------------
        # MODE 3: get_text("words")
        # -------------------------------------------------
        print("\n🔵 MODE 3: page.get_text('words') (first 200 words)")
        print("-" * 80)
        words = page.get_text("words")
        words.sort(key=lambda w: (w[3], w[0]))  # y1, x0

        for i, w in enumerate(words[:200], start=1):
            print(f"{i:03d}: {w[4]}")

        print("\n[END MODE 3]\n")

    doc.close()

    print("=" * 120)
    print("✅ DEBUG COMPLETE")
    print("=" * 120)


if __name__ == "__main__":
    debug_cams_text_extraction(PDF_PATH)
