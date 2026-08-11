const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || "127.0.0.1";
const ROOT = __dirname;
const DB_PATH = process.env.DB_PATH || path.join(ROOT, "database.json");
const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || "";
let pgPool = null;
let pgReady = false;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon"
};

function defaultDb() {
  return { users: [], stock: [], customers: [] };
}

function readDb() {
  try {
    if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, JSON.stringify(defaultDb(), null, 2));
    const db = JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
    db.users ||= [];
    db.stock ||= [];
    db.customers ||= [];
    return db;
  } catch (err) {
    console.error("Erro ao ler banco:", err);
    return defaultDb();
  }
}

function writeDb(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function usingPostgres() {
  return Boolean(DATABASE_URL);
}

function getPool() {
  if (!pgPool) {
    const { Pool } = require("pg");
    const isLocalDb = /localhost|127\.0\.0\.1/.test(DATABASE_URL);
    pgPool = new Pool({
      connectionString: DATABASE_URL,
      ssl: isLocalDb ? undefined : { rejectUnauthorized: false }
    });
  }
  return pgPool;
}

function userFromRow(row) {
  if (!row) return null;
  return {
    uid: row.uid,
    name: row.name,
    email: row.email,
    passwordHash: row.password_hash,
    phone: row.phone,
    city: row.city,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function stockFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    productName: row.product_name,
    productCode: row.product_code,
    size: row.size,
    qty: Number(row.qty || 0),
    price: Number(row.price || 0),
    entryDate: row.entry_date,
    expiry: row.expiry,
    notes: row.notes,
    category: row.category,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function customerFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    customerName: row.customer_name,
    phone: row.phone,
    products: row.products,
    amount: Number(row.amount || 0),
    purchaseDate: row.purchase_date,
    dueDate: row.due_date,
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function ensurePostgres() {
  if (!usingPostgres() || pgReady) return;
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      uid TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      phone TEXT DEFAULT '',
      city TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS stock (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
      product_name TEXT NOT NULL,
      product_code TEXT DEFAULT '',
      size TEXT DEFAULT '',
      qty NUMERIC DEFAULT 0,
      price NUMERIC DEFAULT 0,
      entry_date TEXT DEFAULT '',
      expiry TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      category TEXT DEFAULT 'Sem categoria',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
      customer_name TEXT NOT NULL,
      phone TEXT DEFAULT '',
      products TEXT DEFAULT '',
      amount NUMERIC DEFAULT 0,
      purchase_date TEXT DEFAULT '',
      due_date TEXT DEFAULT '',
      status TEXT DEFAULT 'pending',
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  pgReady = true;
}

async function findUserByEmail(email) {
  if (usingPostgres()) {
    await ensurePostgres();
    const { rows } = await getPool().query("SELECT * FROM users WHERE email = $1", [email]);
    return userFromRow(rows[0]);
  }
  return readDb().users.find(u => u.email === email) || null;
}

async function findUserByUid(uid) {
  if (usingPostgres()) {
    await ensurePostgres();
    const { rows } = await getPool().query("SELECT * FROM users WHERE uid = $1", [uid]);
    return userFromRow(rows[0]);
  }
  return readDb().users.find(u => u.uid === uid) || null;
}

async function createUser(user) {
  if (usingPostgres()) {
    await ensurePostgres();
    await getPool().query(
      `INSERT INTO users (uid, name, email, password_hash, phone, city, notes, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [user.uid, user.name, user.email, user.passwordHash, user.phone, user.city, user.notes, user.createdAt, user.updatedAt]
    );
    return user;
  }
  const db = readDb();
  db.users.push(user);
  writeDb(db);
  return user;
}

async function updateUserProfile(uid, fields) {
  const updatedAt = new Date().toISOString();
  if (usingPostgres()) {
    await ensurePostgres();
    const { rows } = await getPool().query(
      `UPDATE users
       SET name = $2, phone = $3, city = $4, notes = $5, updated_at = $6
       WHERE uid = $1
       RETURNING *`,
      [uid, fields.name, fields.phone, fields.city, fields.notes, updatedAt]
    );
    return userFromRow(rows[0]);
  }
  const db = readDb();
  const user = db.users.find(u => u.uid === uid);
  if (!user) return null;
  user.name = fields.name;
  user.phone = fields.phone;
  user.city = fields.city;
  user.notes = fields.notes;
  user.updatedAt = updatedAt;
  writeDb(db);
  return user;
}

async function updateUserPassword(uid, passwordHash) {
  const updatedAt = new Date().toISOString();
  if (usingPostgres()) {
    await ensurePostgres();
    await getPool().query(
      "UPDATE users SET password_hash = $2, updated_at = $3 WHERE uid = $1",
      [uid, passwordHash, updatedAt]
    );
    return;
  }
  const db = readDb();
  const user = db.users.find(u => u.uid === uid);
  if (user) {
    user.passwordHash = passwordHash;
    user.updatedAt = updatedAt;
    writeDb(db);
  }
}

async function listStock(uid) {
  if (usingPostgres()) {
    await ensurePostgres();
    const { rows } = await getPool().query(
      "SELECT * FROM stock WHERE user_id = $1 ORDER BY created_at DESC",
      [uid]
    );
    return rows.map(stockFromRow);
  }
  return readDb().stock
    .filter(i => i.userId === uid)
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

async function createStockItem(item) {
  if (usingPostgres()) {
    await ensurePostgres();
    await getPool().query(
      `INSERT INTO stock
       (id, user_id, product_name, product_code, size, qty, price, entry_date, expiry, notes, category, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        item.id, item.userId, item.productName, item.productCode, item.size, item.qty,
        item.price, item.entryDate, item.expiry, item.notes, item.category, item.createdAt, item.updatedAt
      ]
    );
    return item;
  }
  const db = readDb();
  db.stock.push(item);
  writeDb(db);
  return item;
}

async function updateStockItem(uid, id, fields) {
  const item = {
    id,
    userId: uid,
    productName: String(fields.productName || "").trim(),
    productCode: String(fields.productCode || "").trim(),
    size: String(fields.size || "").trim(),
    qty: Number(fields.qty || 0),
    price: Number(fields.price || 0),
    entryDate: String(fields.entryDate || ""),
    expiry: String(fields.expiry || ""),
    notes: String(fields.notes || ""),
    category: String(fields.category || "Sem categoria"),
    updatedAt: new Date().toISOString()
  };

  if (usingPostgres()) {
    await ensurePostgres();
    const { rows } = await getPool().query(
      `UPDATE stock
       SET product_name = $3, product_code = $4, size = $5, qty = $6, price = $7,
           entry_date = $8, expiry = $9, notes = $10, category = $11, updated_at = $12
       WHERE user_id = $1 AND id = $2
       RETURNING *`,
      [
        uid, id, item.productName, item.productCode, item.size, item.qty, item.price,
        item.entryDate, item.expiry, item.notes, item.category, item.updatedAt
      ]
    );
    return stockFromRow(rows[0]);
  }

  const db = readDb();
  const existing = db.stock.find(i => i.userId === uid && i.id === id);
  if (!existing) return null;
  Object.assign(existing, item);
  writeDb(db);
  return existing;
}

async function adjustStockQty(uid, id, delta) {
  const amount = Number(delta || 0);
  const updatedAt = new Date().toISOString();

  if (usingPostgres()) {
    await ensurePostgres();
    const { rows } = await getPool().query(
      `UPDATE stock
       SET qty = GREATEST(0, qty - $3), updated_at = $4
       WHERE user_id = $1 AND id = $2
       RETURNING *`,
      [uid, id, amount, updatedAt]
    );
    return stockFromRow(rows[0]);
  }

  const db = readDb();
  const existing = db.stock.find(i => i.userId === uid && i.id === id);
  if (!existing) return null;
  existing.qty = Math.max(0, Number(existing.qty || 0) - amount);
  existing.updatedAt = updatedAt;
  writeDb(db);
  return existing;
}

async function deleteStockItem(uid, id) {
  if (usingPostgres()) {
    await ensurePostgres();
    const result = await getPool().query("DELETE FROM stock WHERE user_id = $1 AND id = $2", [uid, id]);
    return result.rowCount;
  }
  const db = readDb();
  const before = db.stock.length;
  db.stock = db.stock.filter(i => !(i.userId === uid && i.id === id));
  writeDb(db);
  return before - db.stock.length;
}

async function listCustomers(uid) {
  if (usingPostgres()) {
    await ensurePostgres();
    const { rows } = await getPool().query(
      "SELECT * FROM customers WHERE user_id = $1 ORDER BY created_at DESC",
      [uid]
    );
    return rows.map(customerFromRow);
  }
  return readDb().customers
    .filter(i => i.userId === uid)
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

async function createCustomer(item) {
  if (usingPostgres()) {
    await ensurePostgres();
    await getPool().query(
      `INSERT INTO customers
       (id, user_id, customer_name, phone, products, amount, purchase_date, due_date, status, notes, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        item.id, item.userId, item.customerName, item.phone, item.products, item.amount,
        item.purchaseDate, item.dueDate, item.status, item.notes, item.createdAt, item.updatedAt
      ]
    );
    return item;
  }
  const db = readDb();
  db.customers.push(item);
  writeDb(db);
  return item;
}

async function updateCustomer(uid, id, fields) {
  const item = {
    id,
    userId: uid,
    customerName: String(fields.customerName || "").trim(),
    phone: String(fields.phone || "").trim(),
    products: String(fields.products || "").trim(),
    amount: Number(fields.amount || 0),
    purchaseDate: String(fields.purchaseDate || ""),
    dueDate: String(fields.dueDate || ""),
    status: String(fields.status || "pending"),
    notes: String(fields.notes || ""),
    updatedAt: new Date().toISOString()
  };

  if (usingPostgres()) {
    await ensurePostgres();
    const { rows } = await getPool().query(
      `UPDATE customers
       SET customer_name = $3, phone = $4, products = $5, amount = $6,
           purchase_date = $7, due_date = $8, status = $9, notes = $10, updated_at = $11
       WHERE user_id = $1 AND id = $2
       RETURNING *`,
      [
        uid, id, item.customerName, item.phone, item.products, item.amount,
        item.purchaseDate, item.dueDate, item.status, item.notes, item.updatedAt
      ]
    );
    return customerFromRow(rows[0]);
  }

  const db = readDb();
  const existing = db.customers.find(i => i.userId === uid && i.id === id);
  if (!existing) return null;
  Object.assign(existing, item);
  writeDb(db);
  return existing;
}

async function deleteCustomer(uid, id) {
  if (usingPostgres()) {
    await ensurePostgres();
    const result = await getPool().query("DELETE FROM customers WHERE user_id = $1 AND id = $2", [uid, id]);
    return result.rowCount;
  }
  const db = readDb();
  const before = db.customers.length;
  db.customers = db.customers.filter(i => !(i.userId === uid && i.id === id));
  writeDb(db);
  return before - db.customers.length;
}

function makeId(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(5).toString("hex")}`;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(String(password), salt, 100000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(":")) return false;
  const [salt, originalHash] = stored.split(":");
  const candidate = hashPassword(password, salt).split(":")[1];
  try {
    return crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(originalHash));
  } catch {
    return false;
  }
}

function publicUser(user) {
  if (!user) return null;
  return {
    uid: user.uid,
    name: user.name || "",
    email: user.email || "",
    phone: user.phone || "",
    city: user.city || "",
    notes: user.notes || "",
    createdAt: user.createdAt || "",
    updatedAt: user.updatedAt || ""
  };
}

function send(res, status, data) {
  const body = status === 204 ? "" : JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 5 * 1024 * 1024) {
        reject(new Error("Dados muito grandes."));
        req.destroy();
      }
    });
    req.on("end", () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch { reject(new Error("JSON inválido.")); }
    });
  });
}

function getIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === "IPv4" && !net.internal) return net.address;
    }
  }
  return "localhost";
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let filePath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  filePath = path.normalize(filePath).replace(/^([.][.][\/\\])+/, "");
  const fullPath = path.join(ROOT, filePath);
  if (!fullPath.startsWith(ROOT)) {
    res.writeHead(403); res.end("Acesso negado"); return;
  }
  fs.readFile(fullPath, (err, content) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Arquivo não encontrado");
      return;
    }
    const ext = path.extname(fullPath).toLowerCase();
    res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
    res.end(content);
  });
}

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const parts = url.pathname.split("/").filter(Boolean);
  const method = req.method;

  if (method === "OPTIONS") return send(res, 204, {});
  if (url.pathname === "/api/health") return send(res, 200, { ok: true });

  try {
    if (method === "POST" && url.pathname === "/api/auth/register") {
      const body = await readBody(req);
      const name = String(body.name || "").trim();
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      if (!name || !email || password.length < 6) return send(res, 400, { error: "Preencha nome, e-mail e senha com no mínimo 6 caracteres." });
      if (await findUserByEmail(email)) return send(res, 409, { error: "Este e-mail já está cadastrado." });
      const now = new Date().toISOString();
      const user = { uid: makeId("u"), name, email, passwordHash: hashPassword(password), phone: "", city: "", notes: "", createdAt: now, updatedAt: now };
      await createUser(user);
      return send(res, 200, { user: publicUser(user) });
    }

    if (method === "POST" && url.pathname === "/api/auth/login") {
      const body = await readBody(req);
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const user = await findUserByEmail(email);
      if (!user || !verifyPassword(password, user.passwordHash)) return send(res, 401, { error: "E-mail ou senha incorretos." });
      return send(res, 200, { user: publicUser(user) });
    }

    if (parts[0] === "api" && parts[1] === "users") {
      const uid = parts[2];
      const user = await findUserByUid(uid);
      if (!user) return send(res, 404, { error: "Usuário não encontrado." });

      if (method === "GET" && parts[3] === "profile") return send(res, 200, publicUser(user));

      if (method === "PUT" && parts[3] === "profile") {
        const body = await readBody(req);
        const name = String(body.name || "").trim();
        if (!name) return send(res, 400, { error: "Informe o nome." });
        const profile = await updateUserProfile(uid, {
          name,
          phone: String(body.phone || "").trim(),
          city: String(body.city || "").trim(),
          notes: String(body.notes || "").trim()
        });
        return send(res, 200, publicUser(profile));
      }

      if (method === "PUT" && parts[3] === "password") {
        const body = await readBody(req);
        const password = String(body.password || "");
        if (password.length < 6) return send(res, 400, { error: "A senha precisa ter pelo menos 6 caracteres." });
        await updateUserPassword(uid, hashPassword(password));
        return send(res, 200, { ok: true });
      }

      if (parts[3] === "stock") {
        if (method === "GET" && parts.length === 4) {
          const rows = await listStock(uid);
          return send(res, 200, rows.map(i => ({
            id: i.id,
            productName: i.productName,
            productCode: i.productCode,
            size: i.size,
            qty: Number(i.qty || 0),
            price: Number(i.price || 0),
            entryDate: i.entryDate,
            expiry: i.expiry,
            notes: i.notes,
            category: i.category,
            createdAt: i.createdAt,
            updatedAt: i.updatedAt
          })));
        }

        if (method === "POST" && parts.length === 4) {
          const body = await readBody(req);
          const now = new Date().toISOString();
          const item = {
            id: makeId("i"),
            userId: uid,
            productName: String(body.productName || "").trim(),
            productCode: String(body.productCode || "").trim(),
            size: String(body.size || "").trim(),
            qty: Number(body.qty || 0),
            price: Number(body.price || 0),
            entryDate: String(body.entryDate || ""),
            expiry: String(body.expiry || ""),
            notes: String(body.notes || ""),
            category: String(body.category || "Sem categoria"),
            createdAt: now,
            updatedAt: now
          };
          if (!item.productName) return send(res, 400, { error: "Informe o produto." });
          return send(res, 200, await createStockItem(item));
        }

        if (method === "PUT" && parts.length === 5) {
          const id = parts[4];
          const body = await readBody(req);
          const item = await updateStockItem(uid, id, body);
          if (!item) return send(res, 404, { error: "Produto não encontrado." });
          return send(res, 200, item);
        }

        if (method === "PATCH" && parts.length === 5) {
          const id = parts[4];
          const body = await readBody(req);
          const item = await adjustStockQty(uid, id, Number(body.delta || 0));
          if (!item) return send(res, 404, { error: "Produto não encontrado." });
          return send(res, 200, item);
        }

        if (method === "DELETE" && parts.length === 5) {
          const id = parts[4];
          const removed = await deleteStockItem(uid, id);
          return send(res, 200, { ok: true, removed });
        }
      }

      if (parts[3] === "customers") {
        if (method === "GET" && parts.length === 4) {
          const rows = await listCustomers(uid);
          return send(res, 200, rows.map(i => ({
            id: i.id,
            customerName: i.customerName,
            phone: i.phone,
            products: i.products,
            amount: Number(i.amount || 0),
            purchaseDate: i.purchaseDate,
            dueDate: i.dueDate,
            status: i.status,
            notes: i.notes,
            createdAt: i.createdAt,
            updatedAt: i.updatedAt
          })));
        }

        if (method === "POST" && parts.length === 4) {
          const body = await readBody(req);
          const now = new Date().toISOString();
          const item = {
            id: makeId("c"),
            userId: uid,
            customerName: String(body.customerName || "").trim(),
            phone: String(body.phone || "").trim(),
            products: String(body.products || "").trim(),
            amount: Number(body.amount || 0),
            purchaseDate: String(body.purchaseDate || ""),
            dueDate: String(body.dueDate || ""),
            status: String(body.status || "pending"),
            notes: String(body.notes || ""),
            createdAt: now,
            updatedAt: now
          };
          if (!item.customerName) return send(res, 400, { error: "Informe o nome do cliente." });
          return send(res, 200, await createCustomer(item));
        }

        if (method === "PUT" && parts.length === 5) {
          const id = parts[4];
          const body = await readBody(req);
          const item = await updateCustomer(uid, id, body);
          if (!item) return send(res, 404, { error: "Cliente não encontrado." });
          return send(res, 200, item);
        }

        if (method === "DELETE" && parts.length === 5) {
          const id = parts[4];
          const removed = await deleteCustomer(uid, id);
          return send(res, 200, { ok: true, removed });
        }
      }
    }

    return send(res, 404, { error: "Rota não encontrada." });
  } catch (err) {
    console.error(err);
    return send(res, 500, { error: err.message || "Erro interno." });
  }
}

if (require.main === module) {
  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/api/")) return handleApi(req, res);
    return serveStatic(req, res);
  });

  server.listen(PORT, HOST, () => {
    console.log("\n🚀 SISTEMA RODANDO\n");
    console.log(`Local: http://localhost:${PORT}`);
    console.log(`Rede:  http://${getIP()}:${PORT}`);
    console.log("Online: pronto para Vercel/Render usando banco Postgres\n");
  });
}

module.exports = { handleApi };
