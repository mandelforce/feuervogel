#!/usr/bin/env python3
"""Rebuild the embedded Japanese font ('StarFall JP') in index.html.

The credits use DotGothic16 (SIL Open Font License, see licenses/), cut down to just the Japanese characters that appear in the
credits block and embedded as a base64 woff2. Run this after adding or changing Japanese text there.

  pip install fonttools brotli
  python3 scripts/build-jp-font.py path/to/DotGothic16-Regular.ttf

The font file is not kept in the repo. Get it from https://github.com/google/fonts/tree/main/ofl/dotgothic16
"""
import base64, io, re, sys
from pathlib import Path
from fontTools import subset
from fontTools.ttLib import TTFont

if len(sys.argv) != 2:
    sys.exit(__doc__)
src = Path(sys.argv[1])
page = Path(__file__).resolve().parent.parent / 'index.html'
html = page.read_text(encoding='utf8')

# every non-ASCII character in the credits block
a, b = html.index('<div id="credits"'), html.index('<div id="howto"')
chars = sorted({c for c in html[a:b] if ord(c) > 127 and c not in '©'})
cmap = TTFont(str(src)).getBestCmap()
missing = [c for c in chars if ord(c) not in cmap]
if missing:
    sys.exit('Not in the font, replace or remove: ' + ''.join(missing))

opts = subset.Options()
opts.flavor, opts.layout_features, opts.hinting, opts.notdef_outline = 'woff2', [], False, True
opts.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14]
font = subset.load_font(str(src), opts)
sub = subset.Subsetter(opts)
sub.populate(text=''.join(chars))
sub.subset(font)
buf = io.BytesIO()
subset.save_font(font, buf, opts)
b64 = base64.b64encode(buf.getvalue()).decode()

pat = re.compile(r"(font-family:'StarFall JP';src:url\(data:font/woff2;base64,)[^)]*(\))")
if not pat.search(html):
    sys.exit("Could not find the 'StarFall JP' @font-face in index.html")
page.write_text(pat.sub(lambda m: m.group(1) + b64 + m.group(2), html, count=1), encoding='utf8')
print(f'{len(chars)} characters, {len(buf.getvalue())} bytes: {"".join(chars)}')
