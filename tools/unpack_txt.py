"""Restore a project packed by pack_txt.py, then rebuild index.html. Usage: python unpack_txt.py BUNDLE.txt OUTPUT_FOLDER"""
import hashlib, os, subprocess, sys
src, dst = sys.argv[1], sys.argv[2]
lines = open(src, encoding="utf-8").read().split("\n"); i = 0; n = 0; bad = []
while i < len(lines):
    if lines[i].startswith("@@@@FILE@@@@ "):
        _, path, size, sha = lines[i].split(" "); j = i + 1; body = []
        while lines[j] != "@@@@END@@@@": body.append(lines[j]); j += 1
        data = ("\n".join(body) + "\n").encode()
        if hashlib.sha256(data).hexdigest() != sha: data = "\n".join(body).encode()
        if hashlib.sha256(data).hexdigest() != sha: bad.append(path)
        p = os.path.join(dst, path); os.makedirs(os.path.dirname(p), exist_ok=True); open(p, "wb").write(data); n += 1; i = j
    i += 1
print(n, "files restored to", dst, "| checksum failures:", bad or "none")
b = os.path.join(dst, "tools", "build_single.py")
if os.path.exists(b): subprocess.call([sys.executable, b])