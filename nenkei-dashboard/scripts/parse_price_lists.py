"""
Regenerates public/data/priceCatalog.json from Toyota's official price-list
PDFs. Re-run this whenever Rajesh Toyota gets an updated price list from
Toyota — drop the new PDFs into scripts/price-list-pdfs/ (create it next to
this script) and run:

    pip install pdfplumber
    python3 scripts/parse_price_lists.py

It reads every "<MODEL> PRIVATE/COMMERCIAL NEW.pdf" style price list in that
folder (skips the suffix/colour-code sheet, CSD sheet, and the extended
warranty sheet, which have a different layout and aren't wired into the app
yet) and writes one normalized JSON row per model/variant, which the Quote
and Booking forms' price-catalog picker (public/priceCatalogWidget.js) reads
directly. Column names/order vary per model PDF, so this matches columns by
fuzzy header text (e.g. "Ex-Showroom Price", "Road Tax & Registeration",
anything containing "insurance", "warranty", "tga", "gloss", "smile") rather
than fixed positions.
"""
import pdfplumber, glob, json, re, os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SRC_DIR = os.path.join(SCRIPT_DIR, "price-list-pdfs")
OUT_PATH = os.path.join(SCRIPT_DIR, "..", "public", "data", "priceCatalog.json")

MODEL_FILES = [f for f in glob.glob(os.path.join(SRC_DIR, "*.pdf"))
               if not any(x in f for x in ["SUFFIX", "CSD", "TSECURE"])]

def norm(s):
    return re.sub(r'\s+', ' ', (s or '').replace('\n', ' ')).strip()

def norm_key(s):
    return re.sub(r'[^a-z0-9]', '', norm(s).lower())

def to_number(v):
    if v is None:
        return None
    s = str(v).replace(',', '').strip()
    if s == '' or s == '-':
        return None
    try:
        return int(float(s))
    except ValueError:
        return None

def find_col(headers, *substrings):
    for i, h in enumerate(headers):
        hk = norm_key(h)
        if all(norm_key(sub) in hk for sub in substrings):
            return i
    return None

def parse_table(t, channel, source_file):
    # Find the header row: first row with enough non-null cells that
    # contains an "ex-showroom"-ish column.
    header_idx = None
    for i, row in enumerate(t):
        cells = [norm(c) for c in row]
        if sum(1 for c in cells if c) >= 4 and any('exshowroom' in norm_key(c) or ('ex' in norm_key(c) and 'showroom' in norm_key(c)) for c in cells):
            header_idx = i
            break
    if header_idx is None:
        return []
    headers = [norm(c) for c in t[header_idx]]

    vehicle_col = find_col(headers, 'vehicle')
    suffix_col = find_col(headers, 'suffix')
    variant_col = find_col(headers, 'varient') or find_col(headers, 'variant')
    exshowroom_col = find_col(headers, 'exshowroom') or find_col(headers, 'ex', 'showroom')
    tcs_col = find_col(headers, 'tcs')
    roadtax_col = find_col(headers, 'road', 'tax')
    fastag_col = find_col(headers, 'fastag') or find_col(headers, 'fast', 'tag')
    warranty_col = find_col(headers, 'warranty')
    tga_col = None
    for i, h in enumerate(headers):
        if 'tga' in norm_key(h) or 'essentialkit' in norm_key(h):
            tga_col = i
            break
    tgloss_col = None
    for i, h in enumerate(headers):
        if 'gloss' in norm_key(h):
            tgloss_col = i
            break
    smile_col = None
    for i, h in enumerate(headers):
        if 'smile' in norm_key(h):
            smile_col = i
            break

    insurance_cols = [i for i, h in enumerate(headers) if 'insurance' in norm_key(h) or '3+3' in norm(h)]
    onroad_cols = [i for i, h in enumerate(headers) if 'onroad' in norm_key(h)]

    if exshowroom_col is None:
        return []

    rows = []
    last_vehicle = None
    for row in t[header_idx + 1:]:
        exshowroom_val = to_number(row[exshowroom_col]) if exshowroom_col < len(row) else None
        # Section headers and footnote rows don't have a numeric ex-showroom
        # price — skip them.
        if exshowroom_val is None:
            continue

        vehicle = norm(row[vehicle_col]) if vehicle_col is not None and vehicle_col < len(row) else None
        if vehicle:
            last_vehicle = vehicle
        else:
            vehicle = last_vehicle

        entry = {
            'vehicle': vehicle,
            'suffixCode': norm(row[suffix_col]) if suffix_col is not None and suffix_col < len(row) else None,
            'variant': norm(row[variant_col]) if variant_col is not None and variant_col < len(row) else None,
            'exShowroomPrice': exshowroom_val,
            'tcs': to_number(row[tcs_col]) if tcs_col is not None and tcs_col < len(row) else None,
            'roadTaxRegistration': to_number(row[roadtax_col]) if roadtax_col is not None and roadtax_col < len(row) else None,
            'fastag': to_number(row[fastag_col]) if fastag_col is not None and fastag_col < len(row) else None,
            'trueWarranty': to_number(row[warranty_col]) if warranty_col is not None and warranty_col < len(row) else None,
            'tga': to_number(row[tga_col]) if tga_col is not None and tga_col < len(row) else None,
            'tgloss': to_number(row[tgloss_col]) if tgloss_col is not None and tgloss_col < len(row) else None,
            'smilePackage': to_number(row[smile_col]) if smile_col is not None and smile_col < len(row) else None,
            'insurance': {headers[i]: to_number(row[i]) for i in insurance_cols if i < len(row) and to_number(row[i]) is not None},
            'onRoadPrice': {headers[i]: to_number(row[i]) for i in onroad_cols if i < len(row) and to_number(row[i]) is not None},
            'channel': channel,
            'sourceFile': source_file,
        }
        if entry['vehicle'] and entry['exShowroomPrice']:
            rows.append(entry)
    return rows

def channel_for(filename):
    return 'commercial' if 'commercial' in filename.lower() else 'private'

def main():
    if not os.path.isdir(SRC_DIR):
        raise SystemExit(f"Put the price-list PDFs in {SRC_DIR} first (one file per model, named like the ones Toyota sends).")

    all_rows = []
    for f in sorted(MODEL_FILES):
        basename = os.path.basename(f)
        channel = channel_for(basename)
        with pdfplumber.open(f) as pdf:
            for page in pdf.pages:
                for t in page.extract_tables():
                    all_rows.extend(parse_table(t, channel, basename))

    print(f"Parsed {len(all_rows)} variant rows from {len(MODEL_FILES)} files")

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, 'w') as f:
        json.dump({'generatedFrom': 'price-list-pdfs/ (regenerate with this script)', 'rows': all_rows}, f, indent=2)
    print("Wrote", OUT_PATH)

if __name__ == '__main__':
    main()
