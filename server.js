// Agent-Tickets — minimal V1 demo server. Zero dependencies. Run: node server.js
const http = require("http");
const { randomUUID } = require("crypto");

const PORT = process.env.PORT || 3000;
const listings = [
  { id: randomUUID(), event: "Solana Breakpoint 2026", date: "2026-12-10", venue: "Singapore Expo", price_usdc: "450", status: "active", created: new Date().toISOString() },
  { id: randomUUID(), event: "ETHDenver Side Stage", date: "2027-02-20", venue: "Denver, CO", price_usdc: "120", status: "active", created: new Date().toISOString() },
];

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function page() {
  const rows = listings.map((l) => `<tr><td>${esc(l.event)}</td><td>${esc(l.date)}</td><td>${esc(l.venue)}</td><td>$${esc(l.price_usdc)} USDC</td><td>${esc(l.status)}</td></tr>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Agent-Tickets</title>
<style>
body{font-family:-apple-system,system-ui,sans-serif;margin:0;background:#0f1117;color:#e6e6e6}
.wrap{max-width:860px;margin:0 auto;padding:32px 20px}
h1{margin:0 0 4px}.sub{color:#9aa;margin:0 0 28px}
.card{background:#181b23;border:1px solid #2a2e3a;border-radius:10px;padding:20px;margin-bottom:24px}
label{display:block;font-size:13px;color:#9aa;margin:10px 0 4px}
input{width:100%;box-sizing:border-box;padding:9px;border-radius:6px;border:1px solid #2a2e3a;background:#0f1117;color:#e6e6e6}
button{margin-top:14px;padding:10px 18px;border:0;border-radius:6px;background:#7c5cff;color:#fff;font-weight:600;cursor:pointer}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:8px 10px;border-bottom:1px solid #2a2e3a;font-size:14px}
th{color:#9aa;font-weight:500}.api{font-size:13px;color:#9aa}code{background:#0f1117;padding:2px 6px;border-radius:4px}
</style></head><body><div class="wrap">
<h1>Agent-Tickets</h1><p class="sub">P2P ticket marketplace &middot; Solana USDC escrow &middot; agents welcome</p>
<div class="card"><h3 style="margin-top:0">Sell a ticket</h3>
<form method="POST" action="/add">
<label>Event name</label><input name="event" required placeholder="Solana Breakpoint 2026">
<label>Event date</label><input name="date" type="date" required>
<label>Venue</label><input name="venue" required placeholder="Singapore Expo">
<label>Price (USDC)</label><input name="price_usdc" type="number" min="1" step="0.01" required placeholder="450">
<button>List ticket</button></form></div>
<div class="card"><h3 style="margin-top:0">Live listings (${listings.length})</h3>
<table><tr><th>Event</th><th>Date</th><th>Venue</th><th>Price</th><th>Status</th></tr>${rows}</table></div>
<p class="api">Agent API: <code>GET /api/listings</code> &middot; <code>POST /api/listings</code> (JSON: event, date, venue, price_usdc)</p>
</div></body></html>`;
}

function readBody(req, cb) {
  let b = "";
  req.on("data", (c) => (b += c));
  req.on("end", () => cb(b));
}

http
  .createServer((req, res) => {
    if (req.method === "GET" && req.url === "/") {
      res.writeHead(200, { "Content-Type": "text/html" });
      return res.end(page());
    }
    if (req.method === "GET" && req.url === "/api/listings") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ listings }, null, 2));
    }
    if (req.method === "POST" && (req.url === "/add" || req.url === "/api/listings")) {
      return readBody(req, (body) => {
        let d = {};
        try {
          d = req.headers["content-type"]?.includes("application/json")
            ? JSON.parse(body)
            : Object.fromEntries(new URLSearchParams(body));
        } catch {}
        if (!d.event || !d.date || !d.price_usdc) {
          res.writeHead(400, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: "MISSING_FIELDS", required: ["event", "date", "price_usdc"] }));
        }
        const l = { id: randomUUID(), event: d.event, date: d.date, venue: d.venue || "", price_usdc: d.price_usdc, status: "active", created: new Date().toISOString() };
        listings.unshift(l);
        if (req.url === "/add") {
          res.writeHead(302, { Location: "/" });
          return res.end();
        }
        res.writeHead(201, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ listing: l }, null, 2));
      });
    }
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "NOT_FOUND" }));
  })
  .listen(PORT, () => console.log(`Agent-Tickets running → http://localhost:${PORT}`));
