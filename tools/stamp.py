#!/usr/bin/env python3
"""Stamp every app module with a content hash so browsers never mix old cached scripts with a new page.

Run before publishing:  python3 tools/stamp.py
It rewrites the import map in index.html (./js/x.js -> ./js/x.js?v=<hash>) plus the app.js and app.css links.
"""
import hashlib, json, pathlib, re
root = pathlib.Path(__file__).resolve().parent.parent
idx = root / 'index.html'
html = idx.read_text()
h = lambda p: hashlib.sha1(p.read_bytes()).hexdigest()[:10]
imports = {"three": "./js/vendor/three/three.module.js"}
for f in sorted((root / 'js').glob('*.js')):
    imports[f'./js/{f.name}'] = f'./js/{f.name}?v={h(f)}'
imap = '<script type="importmap">' + json.dumps({"imports": imports}, separators=(',', ':')) + '</script>'
html = re.sub(r'<script type="importmap">.*?</script>', lambda m: imap, html, count=1, flags=re.S)
html = re.sub(r'<script type="module" src="js/app\.js(\?v=\w+)?"></script>', f'<script type="module" src="js/app.js?v={h(root / "js/app.js")}"></script>', html)
html = re.sub(r'href="css/app\.css(\?v=\w+)?"', f'href="css/app.css?v={h(root / "css/app.css")}"', html)
idx.write_text(html)
print('stamped', len(imports) - 1, 'modules')
