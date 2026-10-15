const crypto = require("node:crypto");
const { Pool } = require("pg");

async function hash(password, salt = crypto.randomBytes(16).toString("hex")) {
  return new Promise((resolve, reject) => crypto.scrypt(password, salt, 64, (err, key) => err ? reject(err) : resolve(`scrypt:${salt}:${key.toString("hex")}`)));
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  const deviceUid = process.env.SEED_DEVICE_UID || "pc-power-c3-001";
  if (!email || !password) throw new Error("SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD are required");
  const userId = crypto.randomUUID();
  const deviceId = crypto.randomUUID();
  const passwordHash = await hash(password);
  await pool.query("INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3) ON CONFLICT (email) DO NOTHING", [userId, email, passwordHash]);
  const user = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
  await pool.query("INSERT INTO devices (id, device_uid, name) VALUES ($1, $2, $3) ON CONFLICT (device_uid) DO NOTHING", [deviceId, deviceUid, "PC Power C3"]);
  const device = await pool.query("SELECT id FROM devices WHERE device_uid = $1", [deviceUid]);
  await pool.query("INSERT INTO device_grants (user_id, device_id, role) VALUES ($1, $2, 'operator') ON CONFLICT DO NOTHING", [user.rows[0].id, device.rows[0].id]);
  console.log(JSON.stringify({ email, deviceUid, userId: user.rows[0].id, deviceId: device.rows[0].id }));
  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
