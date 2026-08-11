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
const PG_POOL_MAX = Math.max(1, Number(process.env.PG_POOL_MAX || (DATABASE_URL.includes("-pooler") ? 12 : 1)));
const PG_CONNECT_TIMEOUT_MS = Math.max(1000, Number(process.env.PG_CONNECT_TIMEOUT_MS || 30000));
const PG_IDLE_TIMEOUT_MS = Math.max(1000, Number(process.env.PG_IDLE_TIMEOUT_MS || 10000));
const PG_QUERY_RETRIES = Math.max(0, Number(process.env.PG_QUERY_RETRIES || 2));
const AUTO_MIGRATE_DB = process.env.AUTO_MIGRATE_DB === "1" || !process.env.VERCEL;
let pgPool = null;
let pgReady = false;
const USER_CACHE_MS = 60 * 1000;
const userByUidCache = new Map();

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
      ssl: isLocalDb ? undefined : { rejectUnauthorized: false },
      max: PG_POOL_MAX,
      connectionTimeoutMillis: PG_CONNECT_TIMEOUT_MS,
      idleTimeoutMillis: PG_IDLE_TIMEOUT_MS,
      allowExitOnIdle: true
    });
  }
  return pgPool;
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isTransientPgError(err) {
  const code = String(err?.code || "");
  const message = String(err?.message || "").toLowerCase();
  return [
    "40001",
    "40P01",
    "53300",
    "53400",
    "57P01",
    "57P03",
    "08000",
    "08003",
    "08006"
  ].includes(code) ||
    message.includes("timeout") ||
    message.includes("terminated") ||
    message.includes("connection") ||
    message.includes("too many clients");
}

async function withPgRetry(action) {
  let lastErr;
  for (let attempt = 0; attempt <= PG_QUERY_RETRIES; attempt += 1) {
    try {
      return await action();
    } catch (err) {
      lastErr = err;
      if (attempt >= PG_QUERY_RETRIES || !isTransientPgError(err)) throw err;
      await wait(80 * (attempt + 1) + Math.floor(Math.random() * 120));
    }
  }
  throw lastErr;
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

function rememberUser(user) {
  if (!user || !user.uid) return user;
  userByUidCache.set(user.uid, { user, expiresAt: Date.now() + USER_CACHE_MS });
  return user;
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
  if (!AUTO_MIGRATE_DB) {
    pgReady = true;
    return;
  }
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
      request_key TEXT DEFAULT '',
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
  await pool.query(`
    CREATE TABLE IF NOT EXISTS stock_movements (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
      stock_id TEXT NOT NULL REFERENCES stock(id) ON DELETE CASCADE,
      customer_id TEXT DEFAULT '',
      request_key TEXT DEFAULT '',
      delta NUMERIC DEFAULT 0,
      created_at TEXT NOT NULL
    )
  `);
  await pool.query("ALTER TABLE customers ADD COLUMN IF NOT EXISTS request_key TEXT DEFAULT ''");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_stock_user_created ON stock (user_id, created_at DESC)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_customers_user_created ON customers (user_id, created_at DESC)");
  await pool.query("CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_user_request_key ON customers (user_id, request_key) WHERE request_key <> ''");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_stock_movements_stock ON stock_movements (user_id, stock_id)");
  await pool.query("CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_movements_request_key ON stock_movements (user_id, request_key) WHERE request_key <> ''");
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
  const cached = userByUidCache.get(uid);
  if (cached && cached.expiresAt > Date.now()) return cached.user;
  userByUidCache.delete(uid);

  if (usingPostgres()) {
    await ensurePostgres();
    const { rows } = await getPool().query("SELECT * FROM users WHERE uid = $1", [uid]);
    return rememberUser(userFromRow(rows[0]));
  }
  return rememberUser(readDb().users.find(u => u.uid === uid) || null);
}

async function createUser(user) {
  if (usingPostgres()) {
    await ensurePostgres();
    await getPool().query(
      `INSERT INTO users (uid, name, email, password_hash, phone, city, notes, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [user.uid, user.name, user.email, user.passwordHash, user.phone, user.city, user.notes, user.createdAt, user.updatedAt]
    );
    return rememberUser(user);
  }
  const db = readDb();
  db.users.push(user);
  writeDb(db);
  return rememberUser(user);
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
      `SELECT s.*, s.qty - COALESCE(SUM(m.delta), 0) AS qty
       FROM stock s
       LEFT JOIN stock_movements m ON m.user_id = s.user_id AND m.stock_id = s.id
       WHERE s.user_id = $1
       GROUP BY s.id
       ORDER BY s.created_at DESC`,
      [uid]
    );
    return rows.map(stockFromRow);
  }
  return readDb().stock
    .filter(i => i.userId === uid)
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

async function findStockItem(uid, id) {
  if (usingPostgres()) {
    await ensurePostgres();
    const { rows } = await getPool().query(
      `SELECT s.*, s.qty - COALESCE(SUM(m.delta), 0) AS qty
       FROM stock s
       LEFT JOIN stock_movements m ON m.user_id = s.user_id AND m.stock_id = s.id
       WHERE s.user_id = $1 AND s.id = $2
       GROUP BY s.id`,
      [uid, id]
    );
    return stockFromRow(rows[0]);
  }
  return readDb().stock.find(i => i.userId === uid && i.id === id) || null;
}

async function stockMovementTotal(uid, id) {
  if (!usingPostgres()) return 0;
  await ensurePostgres();
  const { rows } = await getPool().query(
    "SELECT COALESCE(SUM(delta), 0) AS total FROM stock_movements WHERE user_id = $1 AND stock_id = $2",
    [uid, id]
  );
  return Number(rows[0]?.total || 0);
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
    const movementTotal = await stockMovementTotal(uid, id);
    const { rows } = await getPool().query(
      `UPDATE stock
       SET product_name = $3, product_code = $4, size = $5, qty = $6, price = $7,
           entry_date = $8, expiry = $9, notes = $10, category = $11, updated_at = $12
       WHERE user_id = $1 AND id = $2
       RETURNING *`,
      [
        uid, id, item.productName, item.productCode, item.size, item.qty + movementTotal, item.price,
        item.entryDate, item.expiry, item.notes, item.category, item.updatedAt
      ]
    );
    return findStockItem(uid, rows[0]?.id);
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
    await getPool().query(
      `INSERT INTO stock_movements (id, user_id, stock_id, delta, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [makeId("m"), uid, id, amount, updatedAt]
    );
    return findStockItem(uid, id);
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

function buildCustomerItem(uid, fields, existingId = "") {
  const now = new Date().toISOString();
  return {
    id: existingId || makeId("c"),
    userId: uid,
    requestKey: String(fields.requestKey || fields.request_key || "").trim(),
    customerName: String(fields.customerName || "").trim(),
    phone: String(fields.phone || "").trim(),
    products: String(fields.products || "").trim(),
    amount: Number(fields.amount || 0),
    purchaseDate: String(fields.purchaseDate || ""),
    dueDate: String(fields.dueDate || ""),
    status: String(fields.status || "pending"),
    notes: String(fields.notes || ""),
    createdAt: now,
    updatedAt: now
  };
}

async function saveCustomerWithStockAdjustments(uid, fields, adjustments) {
  const item = buildCustomerItem(uid, fields, String(fields.id || ""));
  if (!item.customerName) {
    const err = new Error("Informe o nome do cliente.");
    err.status = 400;
    throw err;
  }

  const cleanAdjustments = (Array.isArray(adjustments) ? adjustments : [])
    .map(adjustment => ({
      stockId: String(adjustment.stockId || ""),
      delta: Number(adjustment.delta || 0)
    }))
    .filter(adjustment => adjustment.stockId && adjustment.delta);

  if (usingPostgres()) {
    await ensurePostgres();
    if (cleanAdjustments.length <= 1) {
      return withPgRetry(async () => {
        const adjustment = cleanAdjustments[0] || { stockId: "", delta: 0 };
        const customerSql = fields.id
          ? `UPDATE customers
             SET customer_name = $3, phone = $4, products = $5, amount = $6,
                 purchase_date = $7, due_date = $8, status = $9, notes = $10, updated_at = $11
             WHERE user_id = $1 AND id = $2
             RETURNING *, TRUE AS inserted`
          : `INSERT INTO customers
             (id, user_id, customer_name, phone, products, amount, purchase_date, due_date, status, notes, created_at, updated_at, request_key)
             VALUES ($2, $1, $3, $4, $5, $6, $7, $8, $9, $10, $12, $11, $15)
             ON CONFLICT (user_id, request_key) WHERE request_key <> ''
             DO UPDATE SET request_key = customers.request_key
             RETURNING *, (xmax = 0) AS inserted`;
        const { rows } = await getPool().query(
          `WITH saved_customer AS (
             ${customerSql}
           ),
           inserted_movement AS (
             INSERT INTO stock_movements (id, user_id, stock_id, customer_id, request_key, delta, created_at)
             SELECT $16, $1, $14, id, $15, $13::numeric, $11
             FROM saved_customer
             WHERE $13::numeric <> 0 AND COALESCE(inserted, TRUE)
             ON CONFLICT (user_id, request_key) WHERE request_key <> ''
             DO NOTHING
             RETURNING stock_id
           ),
           changed_stock AS (
             SELECT s.*, s.qty - COALESCE(SUM(m.delta), 0) AS qty
             FROM stock s
             LEFT JOIN stock_movements m ON m.user_id = s.user_id AND m.stock_id = s.id
             WHERE s.user_id = $1 AND s.id IN (SELECT stock_id FROM inserted_movement)
             GROUP BY s.id
           )
           SELECT
             (SELECT row_to_json(saved_customer) FROM saved_customer) AS customer,
             COALESCE((SELECT json_agg(changed_stock) FROM changed_stock), '[]'::json) AS stock`,
          [
            uid, item.id, item.customerName, item.phone, item.products, item.amount,
            item.purchaseDate, item.dueDate, item.status, item.notes, item.updatedAt,
            item.createdAt, adjustment.delta, adjustment.stockId, item.requestKey, makeId("m")
          ]
        );
        const customer = customerFromRow(rows[0]?.customer);
        if (!customer) {
          const err = new Error("Cliente não encontrado.");
          err.status = 404;
          throw err;
        }
        return {
          customer,
          stock: (rows[0]?.stock || []).map(stockFromRow)
        };
      });
    }

    return withPgRetry(async () => {
      const pool = getPool();
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        let customer;
        if (!fields.id && item.requestKey) {
          const { rows } = await client.query(
            "SELECT * FROM customers WHERE user_id = $1 AND request_key = $2",
            [uid, item.requestKey]
          );
          customer = customerFromRow(rows[0]);
          if (customer) {
            await client.query("COMMIT");
            return { customer, stock: [] };
          }
        }
        if (fields.id) {
          const { rows } = await client.query(
            `UPDATE customers
             SET customer_name = $3, phone = $4, products = $5, amount = $6,
                 purchase_date = $7, due_date = $8, status = $9, notes = $10, updated_at = $11
             WHERE user_id = $1 AND id = $2
             RETURNING *`,
            [
              uid, item.id, item.customerName, item.phone, item.products, item.amount,
              item.purchaseDate, item.dueDate, item.status, item.notes, item.updatedAt
            ]
          );
          customer = customerFromRow(rows[0]);
        } else {
          const { rows } = await client.query(
            `INSERT INTO customers
             (id, user_id, customer_name, phone, products, amount, purchase_date, due_date, status, notes, created_at, updated_at, request_key)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
             RETURNING *`,
            [
              item.id, item.userId, item.customerName, item.phone, item.products, item.amount,
              item.purchaseDate, item.dueDate, item.status, item.notes, item.createdAt, item.updatedAt,
              item.requestKey
            ]
          );
          customer = customerFromRow(rows[0]);
        }
        if (!customer) {
          const err = new Error("Cliente não encontrado.");
          err.status = 404;
          throw err;
        }

        const updatedStock = [];
        for (const adjustment of cleanAdjustments) {
          await client.query(
            `INSERT INTO stock_movements (id, user_id, stock_id, customer_id, delta, created_at)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [makeId("m"), uid, adjustment.stockId, customer.id, adjustment.delta, item.updatedAt]
          );
          const { rows } = await client.query(
            `SELECT s.*, s.qty - COALESCE(SUM(m.delta), 0) AS qty
             FROM stock s
             LEFT JOIN stock_movements m ON m.user_id = s.user_id AND m.stock_id = s.id
             WHERE s.user_id = $1 AND s.id = $2
             GROUP BY s.id`,
            [uid, adjustment.stockId]
          );
          if (rows[0]) updatedStock.push(stockFromRow(rows[0]));
        }

        await client.query("COMMIT");
        return { customer, stock: updatedStock };
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    });
  }

  const db = readDb();
  let customer;
  if (fields.id) {
    customer = db.customers.find(i => i.userId === uid && i.id === item.id);
    if (!customer) return null;
    Object.assign(customer, item, { createdAt: customer.createdAt || item.createdAt });
  } else {
    customer = item.requestKey
      ? db.customers.find(i => i.userId === uid && i.requestKey === item.requestKey)
      : null;
    if (customer) return { customer, stock: [] };
    customer = item;
    db.customers.push(customer);
  }

  const updatedStock = [];
  cleanAdjustments.forEach(adjustment => {
    const existing = db.stock.find(i => i.userId === uid && i.id === adjustment.stockId);
    if (!existing) return;
    existing.qty = Math.max(0, Number(existing.qty || 0) - adjustment.delta);
    existing.updatedAt = item.updatedAt;
    updatedStock.push(existing);
  });
  writeDb(db);
  return { customer, stock: updatedStock };
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

        if (method === "GET" && parts.length === 5) {
          const id = parts[4];
          const item = await findStockItem(uid, id);
          if (!item) return send(res, 404, { error: "Produto não encontrado." });
          return send(res, 200, {
            id: item.id,
            productName: item.productName,
            productCode: item.productCode,
            size: item.size,
            qty: Number(item.qty || 0),
            price: Number(item.price || 0),
            entryDate: item.entryDate,
            expiry: item.expiry,
            notes: item.notes,
            category: item.category,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt
          });
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

      if (parts[3] === "sales" && method === "POST" && parts.length === 4) {
        const body = await readBody(req);
        const result = await saveCustomerWithStockAdjustments(
          uid,
          body.customer || {},
          body.adjustments || []
        );
        if (!result) return send(res, 404, { error: "Cliente não encontrado." });
        return send(res, 200, {
          customer: result.customer,
          stock: result.stock
        });
      }
    }

    return send(res, 404, { error: "Rota não encontrada." });
  } catch (err) {
    console.error(err);
    return send(res, err.status || 500, { error: err.message || "Erro interno." });
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
