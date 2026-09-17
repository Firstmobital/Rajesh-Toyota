"""
Regenerates public/data/suffixColorCodes.json from Toyota's "Model Suffix
and Colour Code" reference sheet — a single PDF page laid out as two model
blocks side by side, each block listing that model's suffix codes (old and
new), fuel type, interior colour, and exterior colour code/name.

Re-run whenever Rajesh Toyota gets an updated version of this sheet: drop
it into scripts/price-list-pdfs/ next to the model price-list PDFs (see
parse_price_lists.py), named so it contains "SUFFIX" (case-insensitive),
and run:

    pip install pdfplumber
    python3 scripts/parse_suffix_colors.py

The two side-by-side blocks on the page don't line up row-for-row (a
section header on the right can land next to mid-table data on the left),
so this parses the left half (columns 0-6) and right half (columns 8-14)
as two independent top-to-bottom streams, each tracking: which model
section it's currently in (a row with exactly one non-empty cell shaped
like "MODEL NAME (CODE)"), the last-seen "wef : <date>" effective date,
and whether it's past a column-header row ("Old Suffix"/"Suffix" in the
first cell) before treating rows as data. A data row with no variant name
but a colour code/name is recorded as an additional available colour for
the current model rather than a new variant (some sections list a few
suffix/variant rows followed by a longer colour-only list).

Some sections on this sheet use a different, non-suffix layout entirely
(e.g. a two-grade "Ex. Col" combo table for Camry) — those are silently
skipped rather than mis-parsed, since they never match the expected
header row.
"""
import pdfplumber, json, re, os, glob

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SRC_DIR = os.path.join(SCRIPT_DIR, "price-list-pdfs")
OUT_PATH = os.path.join(SCRIPT_DIR, "..", "public", "data", "suffixColorCodes.json")

def norm(s):
    return re.sub(r'\s+', ' ', (s or '').replace('\n', ' ')).strip()

def is_header_row(cells):
    return norm(cells[0]).lower() in ('old suffix', 'suffix')

def is_wef_row(cells):
    return norm(cells[0]).lower().startswith('wef')

def is_section_row(cells):
    nonnull = [c for c in cells if norm(c)]
    if len(nonnull) != 1:
        return False
    c0 = norm(cells[0])
    return bool(c0) and not c0.lower().startswith('wef') and c0.lower() not in ('old suffix', 'suffix')

MODEL_HEADER_RE = re.compile(r'^(.*?)\s*\(([^)]+)\)\s*$')

def parse_half(rows):
    sections = []
    current = None
    in_table = False

    for raw in rows:
        cells = [norm(c) for c in raw]
        if not any(cells):
            continue

        if is_section_row(raw):
            m = MODEL_HEADER_RE.match(cells[0])
            name, code = (m.group(1).strip(), m.group(2).strip()) if m else (cells[0], None)
            current = {'modelName': name, 'modelCode': code, 'effectiveDate': None, 'variants': [], 'additionalColours': []}
            sections.append(current)
            in_table = False
            continue

        if is_wef_row(raw):
            dates = re.findall(r'wef\s*:\s*([0-9./]+)', cells[0], flags=re.I)
            if current is not None and dates:
                current['effectiveDate'] = dates[0]
            continue

        if is_header_row(raw):
            in_table = True
            continue

        if not in_table or current is None:
            continue

        old_suffix, new_suffix, model, fuel, int_colour, c_code, colour = (cells + [''] * 7)[:7]

        if model:
            current['variants'].append({
                'oldSuffix': old_suffix or None,
                'newSuffix': new_suffix or None,
                'model': model,
                'fuel': fuel or None,
                'intColour': int_colour or None,
                'colourCode': c_code or None,
                'colour': colour or None,
            })
        elif c_code or colour:
            current['additionalColours'].append({'colourCode': c_code or None, 'colour': colour or None})

    # Drop degenerate/unparsed sections (title rows, or sections whose data
    # used a non-suffix layout we intentionally don't parse).
    return [s for s in sections if s['variants'] or s['additionalColours']]

def find_source():
    matches = [f for f in glob.glob(os.path.join(SRC_DIR, "*.pdf")) if 'suffix' in os.path.basename(f).lower()]
    if not matches:
        raise SystemExit(f"No suffix/colour-code PDF found in {SRC_DIR} (expected a filename containing 'SUFFIX').")
    return matches[0]

def main():
    src = find_source()
    all_sections = []
    with pdfplumber.open(src) as pdf:
        for page in pdf.pages:
            for t in page.extract_tables():
                if not t or len(t[0]) < 15:
                    continue
                all_sections.extend(parse_half([row[0:7] for row in t]))
                all_sections.extend(parse_half([row[8:15] for row in t]))

    print(f"Parsed {len(all_sections)} model sections")
    for s in all_sections:
        print(f"  {s['modelName']} ({s['modelCode']}) eff={s['effectiveDate']}: {len(s['variants'])} variants, {len(s['additionalColours'])} extra colours")

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, 'w') as f:
        json.dump({'generatedFrom': os.path.basename(src), 'sections': all_sections}, f, indent=2)
    print("Wrote", OUT_PATH)

if __name__ == '__main__':
    main()
