"""Build the self-contained app: src.html + css/ + js/ -> index.html, SeatView.html and public/index.html (deployed)."""
import os, re, sys, base64
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def read(p): return open(os.path.join(ROOT, p), encoding="utf-8").read()
css = re.sub(r'url\("\.\./(assets/fonts/[^"]+\.woff2)"\)', lambda m: 'url("data:font/woff2;base64,' + base64.b64encode(open(os.path.join(ROOT, m.group(1)), "rb").read()).decode() + '")', read("css/app.css"))  # fonts inline (CSP: font-src data:)
html = read("src.html").replace('<link rel="stylesheet" href="css/app.css">', "<style>\n" + css + "</style>")
html = re.sub(r'<script src="(js/[^"]+)"></script>', lambda m: "<script>/* " + m.group(1) + " */\n" + read(m.group(1)) + "</script>", html)
# Lock scripts to exactly these blocks: CSP lists the SHA-256 of every inline <script>, so an injected script or an
# injected on...= handler is refused by the browser even if some text ever got past the escaping.
import base64, hashlib
hashes = ["'sha256-%s'" % base64.b64encode(hashlib.sha256(m.encode("utf-8")).digest()).decode() for m in re.findall(r"<script>(.*?)</script>", html, re.S)]
assert "%SCRIPT_HASHES%" in html, "CSP placeholder missing in src.html"
html = html.replace("%SCRIPT_HASHES%", " ".join(hashes))
outs = sys.argv[1:] or [os.path.join(ROOT, "index.html"), os.path.join(ROOT, "SeatView.html"), os.path.join(ROOT, "public", "index.html")]  # public/ = what Cloudflare serves
for o in outs: os.makedirs(os.path.dirname(o), exist_ok=True); open(o, "w", encoding="utf-8").write(html)
print("wrote", outs, "%d KB; external script tags left: %d; script hashes in CSP: %d" % (len(html) // 1024, len(re.findall(r'<script src=', html)), len(hashes)))