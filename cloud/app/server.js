const http = require("node:http");
const crypto = require("node:crypto");
const fs = require("node:fs");
const { Pool } = require("pg");
const mqtt = require("mqtt");

const port = Number(process.env.PORT || 8310);
const sessionTtlMs = 24 * 60 * 60 * 1000;
const sessions = new Map();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const mqttClient = process.env.MQTT_URL ? mqtt.connect(process.env.MQTT_URL, {
  username: process.env.MQTT_USERNAME,
  password: process.env.MQTT_PASSWORD,
  rejectUnauthorized: true,
}) : null;

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => { data += chunk; if (data.length > 100_000) reject(new Error("body too large")); });
    req.on("end", () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error("invalid json")); }
    });
    req.on("error", reject);
  });
}

function token() { return crypto.randomBytes(32).toString("base64url"); }
function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  return new Promise((resolve, reject) => crypto.scrypt(password, salt, 64, (err, derived) => err ? reject(err) : resolve(`scrypt:${salt}:${derived.toString("hex")}`)));
}
function verifyPassword(password, encoded) {
  const [, salt, expected] = String(encoded).split(":");
  return new Promise((resolve, reject) => crypto.scrypt(password, salt, 64, (err, derived) => {
    if (err) return reject(err);
    resolve(crypto.timingSafeEqual(Buffer.from(expected, "hex"), derived));
  }));
}

async function authenticate(req) {
  const value = req.headers.authorization || "";
  if (!value.startsWith("Bearer ")) return null;
  const session = sessions.get(value.slice(7));
  if (!session || session.expiresAt < Date.now()) return null;
  return session;
}

async function handle(req, res) {
  if (req.method === "GET" && req.url === "/health") return json(res, 200, { ok: true, service: "pc-power-cloud", status: "ready" });
  if (req.method === "POST" && req.url === "/api/auth/login") {
    const body = await readBody(req);
    const result = await pool.query("SELECT id, password_hash FROM users WHERE email = $1", [body.email]);
    if (!result.rowCount || !(await verifyPassword(body.password || "", result.rows[0].password_hash))) return json(res, 401, { error: "invalid_credentials" });
    const accessToken = token();
    sessions.set(accessToken, { userId: result.rows[0].id, expiresAt: Date.now() + sessionTtlMs });
    return json(res, 200, { accessToken, expiresIn: sessionTtlMs / 1000 });
  }

  const session = await authenticate(req);
  if (!session) return json(res, 401, { error: "authentication_required" });

  if (req.method === "GET" && req.url === "/api/devices") {
    const result = await pool.query("SELECT d.id, d.device_uid, d.name, d.status, d.last_seen_at, g.role FROM devices d JOIN device_grants g ON g.device_id = d.id WHERE g.user_id = $1 ORDER BY d.name", [session.userId]);
    return json(res, 200, { devices: result.rows });
  }

  const commandMatch = req.url.match(/^\/api\/devices\/([^/]+)\/commands\/power-press$/);
  if (req.method === "POST" && commandMatch) {
    const body = await readBody(req);
    const key = req.headers["idempotency-key"];
    if (!key || key.length > 128) return json(res, 400, { error: "idempotency_key_required" });
    const device = await pool.query("SELECT d.id, d.device_uid, d.status, g.role FROM devices d JOIN device_grants g ON g.device_id = d.id WHERE d.id = $1 AND g.user_id = $2", [commandMatch[1], session.userId]);
    if (!device.rowCount || device.rows[0].role !== "operator") return json(res, 403, { error: "device_control_forbidden" });
    if (device.rows[0].status !== "online") return json(res, 409, { error: "device_offline" });
    const commandId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 15_000).toISOString();
    const inserted = await pool.query("INSERT INTO commands (id, device_id, requested_by, kind, status, idempotency_key) VALUES ($1, $2, $3, 'power_press', 'queued', $4) ON CONFLICT (requested_by, device_id, kind, idempotency_key) DO NOTHING RETURNING id", [commandId, device.rows[0].id, session.userId, key]);
    if (!inserted.rowCount) return json(res, 200, { commandId: null, status: "already_requested" });
    if (!mqttClient) return json(res, 503, { error: "mqtt_unavailable" });
    mqttClient.publish(`${device.rows[0].device_uid}/commands/power-press`, JSON.stringify({ commandId, kind: "power_press", issuedAt: new Date().toISOString(), expiresAt }), { qos: 1 }, async (err) => {
      await pool.query("UPDATE commands SET status = $1, published_at = now() WHERE id = $2", [err ? "failed" : "published", commandId]);
    });
    return json(res, 202, { commandId, status: "queued" });
  }

  return json(res, 404, { error: "not_found" });
}

const server = http.createServer((req, res) => handle(req, res).catch((err) => { console.error(err); json(res, 500, { error: "internal_error" }); }));

async function start() {
  await pool.query(fs.readFileSync("/app/schema.sql", "utf8"));
  server.listen(port, "0.0.0.0", () => console.log(`pc-power-cloud listening on ${port}`));
}
if (require.main === module) start().catch((err) => { console.error(err); process.exit(1); });
module.exports = { hashPassword, verifyPassword, handle };
