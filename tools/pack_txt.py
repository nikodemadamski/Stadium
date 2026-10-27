"""Pack the project into one .txt (for re-uploading to a chat). Restore with tools/unpack_txt.py."""
import hashlib, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP_DIRS = {".git", "__pycache__"}; SKIP_EXT = {".png", ".jpg", ".zip", ".log", ".glb"}
out = ["SEATVIEW BUNDLE v1 - restore with: python unpack_txt.py THIS_FILE OUTPUT_FOLDER (unpack_txt.py is inside, under tools/)"]; n = 0
for d, dirs, files in os.walk(ROOT):
    dirs[:] = sorted(x for x in dirs if x not in SKIP_DIRS)
    for f in sorted(files):
        if os.path.splitext(f)[1] in SKIP_EXT or f in ("SeatView.html", "index.html"): continue
        p = os.path.join(d, f); rel = os.path.relpath(p, ROOT).replace(os.sep, "/"); data = open(p, "rb").read()
        out.append("@@@@FILE@@@@ %s %d %s" % (rel, len(data), hashlib.sha256(data).hexdigest())); t = data.decode("utf-8"); out.append(t[:-1] if t.endswith("\n") else t); out.append("@@@@END@@@@"); n += 1
dst = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "SeatView-bundle.txt")
open(dst, "w", encoding="utf-8").write("\n".join(out) + "\n"); print(n, "files ->", dst, os.path.getsize(dst) // 1024, "KB")