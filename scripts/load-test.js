const { performance } = require("perf_hooks");
const { spawn } = require("child_process");

const TARGET_URL = (process.env.LOAD_TEST_URL || process.env.TARGET_URL || "http://127.0.0.1:3017").replace(/\/+$/, "");
const VUS = Math.max(1, Number(process.env.LOAD_TEST_USERS || process.env.VUS || 20));
const ITERATIONS = Math.max(1, Number(process.env.LOAD_TEST_ITERATIONS || process.env.ITERATIONS || 5));
const TIMEOUT_MS = Math.max(1000, Number(process.env.LOAD_TEST_TIMEOUT_MS || 15000));
const REQUEST_RETRIES = Math.max(0, Number(process.env.LOAD_TEST_RETRIES || 2));
const ALLOW_PROD = process.env.LOAD_TEST_ALLOW_PROD === "1";
const RUN_ID = `lt_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 8)}`;
const INITIAL_QTY = VUS * ITERATIONS + 25;
let localServer = null;

if (/vercel\.app|estoqueoleos\.vercel\.app/i.test(TARGET_URL) && !ALLOW_PROD) {
  console.error("Este teste pode criar muitos dados. Para rodar em producao, use LOAD_TEST_ALLOW_PROD=1.");
  console.error(`URL bloqueada: ${TARGET_URL}`);
  process.exit(2);
}

const metrics = [];
let retryCount = 0;

function isLocalTarget() {
  return /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/i.test(TARGET_URL);
}

async function canReachTarget() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1200);
    const res = await fetch(`${TARGET_URL}/api/health`, { signal: controller.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

async function startLocalServerIfNeeded() {
  if (!isLocalTarget() || process.env.LOAD_TEST_NO_AUTO_START === "1") return;
  if (await canReachTarget()) return;

  const port = new URL(TARGET_URL).port || "3017";
  const dbPath = process.env.DB_PATH || `/tmp/estoque-load-test-${RUN_ID}.json`;
  console.log(`Servidor local nao encontrado. Iniciando teste em http://127.0.0.1:${port}...`);

  localServer = spawn(process.execPath, ["server.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: port,
      DB_PATH: dbPath
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  localServer.stdout.on("data", (chunk) => {
    if (process.env.LOAD_TEST_SERVER_LOGS === "1") process.stdout.write(chunk);
  });
  localServer.stderr.on("data", (chunk) => {
    if (process.env.LOAD_TEST_SERVER_LOGS === "1") process.stderr.write(chunk);
  });

  const started = performance.now();
  while (performance.now() - started < 10000) {
    if (await canReachTarget()) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error("Nao consegui iniciar o servidor local de teste.");
}

function stopLocalServer() {
  if (localServer && !localServer.killed) {
    localServer.kill("SIGTERM");
  }
}

process.on("exit", stopLocalServer);
process.on("SIGINT", () => {
  stopLocalServer();
  process.exit(130);
});

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(err, status) {
  if (status && status >= 400 && status < 500 && status !== 408 && status !== 429) return false;
  const message = String(err?.message || "").toLowerCase();
  return !status || status === 408 || status === 429 || status >= 500 ||
    message.includes("failed") || message.includes("abort") || message.includes("timeout");
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

async function request(label, path, options = {}) {
  for (let attempt = 0; attempt <= REQUEST_RETRIES; attempt += 1) {
    const started = performance.now();
    let status = 0;
    let ok = false;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const res = await fetch(`${TARGET_URL}${path}`, {
        ...options,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...(options.headers || {})
        }
      });
      clearTimeout(timer);
      status = res.status;
      const text = await res.text();
      let data = {};
      try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
      ok = res.ok;
      if (!res.ok) {
        const error = new Error(data.error || `HTTP ${res.status}`);
        error.status = res.status;
        error.data = data;
        throw error;
      }
      return data;
    } catch (err) {
      if (attempt >= REQUEST_RETRIES || !isRetryable(err, status)) throw err;
      retryCount += 1;
      await sleep(300 * (attempt + 1) + Math.floor(Math.random() * 250));
    } finally {
      metrics.push({ label, ms: performance.now() - started, status, ok });
    }
  }
}

async function createTestUser() {
  const email = `load-${RUN_ID}@teste.local`;
  const { user } = await request("register", "/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      name: `Load Test ${RUN_ID}`,
      email,
      password: "123456"
    })
  });
  await request("login", "/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password: "123456" })
  });
  return user;
}

async function createStock(uid) {
  return request("stock:create", `/api/users/${uid}/stock`, {
    method: "POST",
    body: JSON.stringify({
      productName: `Produto Teste Carga ${RUN_ID}`,
      productCode: `LOAD-${RUN_ID}`,
      size: "15 ml",
      qty: INITIAL_QTY,
      price: 100,
      entryDate: today(),
      expiry: "2027-12-31",
      notes: "Criado automaticamente pelo teste de carga.",
      category: "Teste de carga"
    })
  });
}

async function getStockItem(uid, stockId) {
  return request("stock:item", `/api/users/${uid}/stock/${stockId}`);
}

async function createSaleAndAdjustStock(uid, stockItem, worker, iteration) {
  await request("sale:create", `/api/users/${uid}/sales`, {
    method: "POST",
    body: JSON.stringify({
      customer: {
        requestKey: `sale_${RUN_ID}_${worker}_${iteration}`,
        customerName: `Cliente ${worker}-${iteration} ${RUN_ID}`,
        phone: "11999999999",
        products: `1x ${stockItem.productName} (${stockItem.size}) - R$ 100,00 un. = R$ 100,00`,
        amount: 100,
        purchaseDate: today(),
        dueDate: today(),
        status: "pending",
        notes: "Venda criada automaticamente pelo teste de carga."
      },
      adjustments: [{ stockId: stockItem.id, delta: 1 }]
    })
  });
}

async function worker(uid, stockItem, index) {
  const errors = [];
  for (let i = 0; i < ITERATIONS; i += 1) {
    try {
      await createSaleAndAdjustStock(uid, stockItem, index, i + 1);
    } catch (err) {
      errors.push({ worker: index, iteration: i + 1, message: err.message, status: err.status || 0 });
    }
  }
  return errors;
}

function summarize(errors, finalStock, finalCustomers, started) {
  const durations = metrics.map((m) => m.ms);
  const total = metrics.length;
  const failedRequests = metrics.filter((m) => !m.ok).length;
  const expectedSales = VUS * ITERATIONS;
  const expectedQty = INITIAL_QTY - expectedSales;
  const elapsed = (performance.now() - started) / 1000;
  const byLabel = metrics.reduce((acc, item) => {
    acc[item.label] ||= { total: 0, failed: 0, times: [] };
    acc[item.label].total += 1;
    if (!item.ok) acc[item.label].failed += 1;
    acc[item.label].times.push(item.ms);
    return acc;
  }, {});

  console.log("\n=== Resultado do teste de carga ===");
  console.log(`URL: ${TARGET_URL}`);
  console.log(`Usuarios simultaneos: ${VUS}`);
  console.log(`Vendas por usuario: ${ITERATIONS}`);
  console.log(`Requisicoes: ${total}`);
  console.log(`Tentativas HTTP/timeout falhas: ${failedRequests}`);
  console.log(`Erros definitivos de fluxo: ${errors.length}`);
  console.log(`Retentativas: ${retryCount}`);
  console.log(`Duracao: ${elapsed.toFixed(2)}s`);
  console.log(`Media: ${(durations.reduce((sum, n) => sum + n, 0) / Math.max(1, durations.length)).toFixed(0)}ms`);
  console.log(`p95: ${percentile(durations, 95).toFixed(0)}ms`);
  console.log(`p99: ${percentile(durations, 99).toFixed(0)}ms`);

  console.log("\nPor endpoint:");
  Object.entries(byLabel).forEach(([label, data]) => {
    console.log(`- ${label}: ${data.total} req, ${data.failed} falha(s), p95 ${percentile(data.times, 95).toFixed(0)}ms`);
  });

  console.log("\nConsistencia:");
  console.log(`Clientes criados: ${finalCustomers.length} / esperado ${expectedSales}`);
  console.log(`Estoque final: ${Number(finalStock.qty)} / esperado ${expectedQty}`);

  if (errors.length) {
    console.log("\nPrimeiros erros:");
    errors.slice(0, 10).forEach((err) => {
      console.log(`- worker ${err.worker}, venda ${err.iteration}: ${err.message}`);
    });
  }

  const stockMismatch = Number(finalStock.qty) !== expectedQty;
  const customerMismatch = finalCustomers.length !== expectedSales;
  if (stockMismatch || customerMismatch) {
    console.log("\nStatus: FALHOU");
    if (stockMismatch) {
      console.log("Aviso: o estoque final nao bateu. Isso indica risco em vendas simultaneas no mesmo estoque.");
    }
    stopLocalServer();
    process.exit(1);
  }

  if (errors.length) {
    console.log("\nStatus: OK COM RESPOSTAS PERDIDAS");
    console.log("Aviso: os dados finais ficaram corretos, mas alguns usuarios poderiam ver erro/timeout na tela.");
    stopLocalServer();
    return;
  }

  console.log("\nStatus: OK");
  stopLocalServer();
}

async function main() {
  const started = performance.now();
  console.log("Iniciando teste de carga...");
  console.log(`URL: ${TARGET_URL}`);
  console.log(`Run ID: ${RUN_ID}`);

  await startLocalServerIfNeeded();
  await request("health", "/api/health");
  const user = await createTestUser();
  const stockItem = await createStock(user.uid);

  const results = await Promise.all(
    Array.from({ length: VUS }, (_, index) => worker(user.uid, stockItem, index + 1))
  );
  const errors = results.flat();
  const finalStock = await getStockItem(user.uid, stockItem.id);
  const finalCustomers = await request("customers:list", `/api/users/${user.uid}/customers`);

  summarize(errors, finalStock, finalCustomers, started);
}

main().catch((err) => {
  console.error("\nFalha ao executar teste de carga:");
  console.error(err.stack || err.message || err);
  process.exit(1);
});
