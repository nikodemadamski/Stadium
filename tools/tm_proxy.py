"""Optional local relay for live Ticketmaster data, for browsers that block the direct call.
Usage (in the project folder, Windows):  set TM_API_KEY=yourkey   then   python tools\\tm_proxy.py
Then open http://localhost:8001/index.html?tm=1   (free key: https://developer.ticketmaster.com)

Security design (each item is attacked by tests/relay_attack.py):
 - listens on loopback only (127.0.0.1 and ::1) - nothing on your network can reach it;
 - refuses any Host header except localhost/127.0.0.1/[::1] on this port (stops DNS-rebinding);
 - refuses cross-site browser requests (Sec-Fetch-Site / Origin) - a web page you visit can't spend your quota;
 - relays ONLY GET /discovery/v2/events.json and venues.json to app.ticketmaster.com, with an allow-list of
   query parameters; the key is added here and never accepted from the caller;
 - serves ONLY index.html and SeatView.html (no directory listing, no other files, no ../ tricks);
 - caps upstream responses at 2 MB and times out after 15 s; GET only.
The key is read from the TM_API_KEY environment variable (a command-line argument also works, but other
programs on the PC can see process arguments)."""
import http.server, json, os, re, socket, sys, threading, urllib.error, urllib.parse, urllib.request

KEY = (os.environ.get("TM_API_KEY") or (sys.argv[1] if len(sys.argv) > 1 else "")).strip()
if KEY and not re.fullmatch(r"[A-Za-z0-9]{8,64}", KEY): sys.exit("TM_API_KEY doesn't look like a Ticketmaster key (letters and numbers only).")
PORT = int(os.environ.get("PORT", "8001"))
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILES = {"/": "index.html", "/index.html": "index.html", "/SeatView.html": "SeatView.html"}
ALLOWED = re.compile(r"^/tm/discovery/v2/(events|venues)\.json$")
PARAMS = {"keyword", "countryCode", "size", "venueId", "sort", "page", "startDateTime"}
HOSTS = {"localhost:%d" % PORT, "127.0.0.1:%d" % PORT, "[::1]:%d" % PORT}
ORIGINS = {"http://" + h for h in HOSTS}
SEC = {"X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "X-Frame-Options": "DENY",
       "Content-Security-Policy": "frame-ancestors 'none'", "Cross-Origin-Resource-Policy": "same-origin", "Cache-Control": "no-store"}

class H(http.server.BaseHTTPRequestHandler):
    server_version = "SeatView"; sys_version = ""
    def log_message(self, fmt, *a): sys.stderr.write("%s %s\n" % (self.command, self.path[:120]))
    def send(self, code, body, ctype="application/json"):
        if isinstance(body, (dict, list)): body = json.dumps(body).encode()
        self.send_response(code); self.send_header("Content-Type", ctype); self.send_header("Content-Length", str(len(body)))
        for k, v in SEC.items(): self.send_header(k, v)
        self.end_headers(); self.wfile.write(body)
    def do_GET(self):
        if self.headers.get("Host", "") not in HOSTS: return self.send(403, {"error": "bad host"})
        u = urllib.parse.urlsplit(self.path)
        if u.path.startswith("/tm"):
            site, origin = self.headers.get("Sec-Fetch-Site"), self.headers.get("Origin")
            if site not in (None, "same-origin", "none") or (origin and origin not in ORIGINS): return self.send(403, {"error": "cross-site request refused"})
            if u.path == "/tm-status": return self.send(200, {"ok": True, "key": bool(KEY)})
            if not ALLOWED.match(u.path): return self.send(403, {"error": "endpoint not allowed"})
            if not KEY: return self.send(400, {"error": "start the relay with TM_API_KEY set"})
            q = [(k, v[:100]) for k, v in urllib.parse.parse_qsl(u.query) if k in PARAMS] + [("apikey", KEY)]
            url = "https://app.ticketmaster.com" + u.path[3:] + "?" + urllib.parse.urlencode(q)
            try:
                with urllib.request.urlopen(urllib.request.Request(url, headers={"Accept": "application/json"}), timeout=15) as r: body, code = r.read(2_000_000), r.status
            except urllib.error.HTTPError as e: body, code = e.read(200_000), e.code
            except Exception as e: return self.send(502, {"error": type(e).__name__})
            return self.send(code, body)
        name = FILES.get(u.path)
        if not name: return self.send(404, {"error": "not found"})
        try: data = open(os.path.join(ROOT, name), "rb").read()
        except OSError: return self.send(404, {"error": "build the app first: python tools/build_single.py"})
        return self.send(200, data, "text/html; charset=utf-8")
    def do_POST(self): self.send(405, {"error": "GET only"})
    do_PUT = do_DELETE = do_PATCH = do_OPTIONS = do_HEAD = do_POST

class V6(http.server.ThreadingHTTPServer): address_family = socket.AF_INET6
if __name__ == "__main__":
    servers = [http.server.ThreadingHTTPServer(("127.0.0.1", PORT), H)]
    try: servers.append(V6(("::1", PORT), H))  # browsers often try ::1 for "localhost" first
    except OSError: pass
    print("Seat View relay: http://localhost:%d/index.html?tm=1  (key %s; loopback only)" % (PORT, "set" if KEY else "NOT set"))
    for s in servers[1:]: threading.Thread(target=s.serve_forever, daemon=True).start()
    servers[0].serve_forever()