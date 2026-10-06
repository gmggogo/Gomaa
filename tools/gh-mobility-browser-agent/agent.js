"use strict";

/*
  GH Mobility Local Browser Discovery Agent
  DESTINATION: tools/gh-mobility-browser-agent/agent.js

  PURPOSE:
  - Opens a REAL external Chrome/Edge window.
  - Uses an EPHEMERAL browser profile (login is not retained after shutdown).
  - The account owner logs in directly on the provider portal.
  - Read-only discovery: observes JSON responses and identifies trip-like objects.
  - DOES NOT click Claim/Accept, submit forms, bypass MFA/CAPTCHA, or store passwords.
*/

const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const WebSocket = require("ws");

const CONFIG_PATH = process.argv[2] || path.join(__dirname, "config.json");
const config = fs.existsSync(CONFIG_PATH)
  ? JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"))
  : {};

const PORT = Number(config.debugPort || 9333);
const START_URL = String(config.startUrl || "about:blank");
const OUTPUT_DIR = path.resolve(config.outputDir || path.join(__dirname, "discovery-output"));
const BROWSER = config.browserPath || findBrowser();
const MAX_BODY = Math.max(100000, Number(config.maxResponseBytes || 5_000_000));
const BRIDGE_URL = String(config.bridgeUrl || "").trim().replace(/\/$/, "");
const AGENT_TOKEN = String(config.agentToken || "").trim();
const BRIDGE_ENABLED = Boolean(BRIDGE_URL && AGENT_TOKEN);
const bridgeSent = new Map();


if (!BROWSER) {
  console.error("Chrome or Edge was not found. Set browserPath in config.json.");
  process.exit(1);
}
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "gh-mobility-discovery-"));
let browserProcess = null;
let ws = null;
let nextId = 1;
const pending = new Map();
const discovered = new Map();
const responseMeta = new Map();

function findBrowser() {
  const candidates = process.platform === "win32" ? [
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe"),
    process.env["PROGRAMFILES(X86)"] && path.join(process.env["PROGRAMFILES(X86)"], "Google", "Chrome", "Application", "chrome.exe"),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"),
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, "Microsoft", "Edge", "Application", "msedge.exe"),
    process.env["PROGRAMFILES(X86)"] && path.join(process.env["PROGRAMFILES(X86)"], "Microsoft", "Edge", "Application", "msedge.exe")
  ] : [
    "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium",
    "/usr/bin/chromium-browser", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  ];
  return candidates.filter(Boolean).find(p => fs.existsSync(p)) || null;
}

function launchBrowser() {
  const args = [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profileDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--new-window",
    START_URL
  ];
  browserProcess = spawn(BROWSER, args, { stdio: "ignore", detached: false });
  browserProcess.on("exit", shutdown);
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on("error", reject);
  });
}

async function waitForTarget() {
  for (let i = 0; i < 80; i++) {
    try {
      const targets = await getJson(`http://127.0.0.1:${PORT}/json`);
      const page = targets.find(t => t.type === "page" && t.webSocketDebuggerUrl);
      if (page) return page;
    } catch (_) {}
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error("Could not attach to the browser.");
}

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

function lowerKeys(obj) {
  const out = {};
  for (const [k,v] of Object.entries(obj || {})) out[String(k).toLowerCase()] = v;
  return out;
}

const TRIP_HINTS = [
  "availabletaskid","tripid","tripnumber","assignmentnumber","reservationid",
  "pickuplocation","pickupaddress","pickupdatetime","pickupdatetimelocal","pickuptime",
  "dropofflocation","dropoffaddress","dropoffdatetime","dropofftime",
  "appointmenttime","appointmentdatetime","distance","distancemeters","tripmiles",
  "levelofservice","mode","member","membername","passengertype"
];

function scoreTripObject(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return 0;
  const keys = Object.keys(lowerKeys(obj));
  let score = 0;
  for (const hint of TRIP_HINTS) if (keys.includes(hint)) score++;
  const hasPickup = keys.some(k => k.includes("pickup"));
  const hasDropoff = keys.some(k => k.includes("dropoff"));
  const hasId = keys.some(k => /(^|_)(trip|task|reservation|assignment).*id$/.test(k)) ||
                keys.includes("availabletaskid") || keys.includes("tripnumber");
  if (hasPickup && hasDropoff) score += 4;
  if (hasId) score += 2;
  return score;
}

function stableId(obj, fallback) {
  const k = lowerKeys(obj);
  return String(
    k.availabletaskid ?? k.tripid ?? k.tripnumber ?? k.assignmentnumber ??
    k.reservationid ?? k.id ?? fallback
  );
}

function walk(value, source, trail = "$", depth = 0) {
  if (depth > 12 || value == null) return;
  if (Array.isArray(value)) {
    value.forEach((v,i) => walk(v, source, `${trail}[${i}]`, depth + 1));
    return;
  }
  if (typeof value !== "object") return;

  const score = scoreTripObject(value);
  if (score >= 5) {
    const id = stableId(value, `${source.requestId}:${trail}`);
    const key = `${source.host}|${id}`;
    const previous = discovered.get(key);
    if (!previous || score > previous.score) {
      discovered.set(key, {
        id, score, discoveredAt: new Date().toISOString(),
        source: {
          url: source.url,
          host: source.host,
          status: source.status,
          mimeType: source.mimeType,
          trail
        },
        raw: value
      });
      writeSnapshot();
      console.log(`[DISCOVERED] ${id} score=${score} source=${source.host}`);
      void sendDiscoveryToBridge(discovered.get(key));
    }
  }

  for (const [k,v] of Object.entries(value)) {
    if (k.toLowerCase().includes("password") || k.toLowerCase().includes("token") ||
        k.toLowerCase().includes("cookie") || k.toLowerCase().includes("authorization")) continue;
    walk(v, source, `${trail}.${k}`, depth + 1);
  }
}


function postJson(url, body, token) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const data = Buffer.from(JSON.stringify(body));
    const transport = target.protocol === "https:" ? require("https") : require("http");
    const req = transport.request({
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || undefined,
      path: target.pathname + target.search,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": data.length,
        "Authorization": `Bearer ${token}`
      },
      timeout: 15000
    }, res => {
      let text = "";
      res.on("data", c => text += c);
      res.on("end", () => {
        let parsed = null;
        try { parsed = text ? JSON.parse(text) : {}; } catch (_) {}
        if (res.statusCode >= 200 && res.statusCode < 300) return resolve(parsed || {});
        reject(new Error(`Bridge HTTP ${res.statusCode}: ${parsed?.message || text || "request failed"}`));
      });
    });
    req.on("timeout", () => req.destroy(new Error("Bridge request timed out")));
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

async function sendDiscoveryToBridge(entry) {
  if (!BRIDGE_ENABLED || !entry?.raw) return;
  const signature = `${entry.id}|${entry.score}|${entry.source?.url || ""}`;
  if (bridgeSent.get(entry.id) === signature) return;
  try {
    const result = await postJson(`${BRIDGE_URL}/api/mtm-marketplace/agent/discovery`, {
      payload: entry.raw,
      sourceUrl: entry.source?.url || "",
      operationName: "LOCAL_BROWSER_DISCOVERY"
    }, AGENT_TOKEN);
    bridgeSent.set(entry.id, signature);
    console.log(`[BRIDGE SENT] ${entry.id} discovered=${result?.discovered ?? "?"}`);
  } catch (e) {
    console.error(`[BRIDGE ERROR] ${entry.id}: ${e.message}`);
  }
}

function writeSnapshot() {
  const payload = {
    generatedAt: new Date().toISOString(),
    mode: "READ_ONLY_DISCOVERY",
    count: discovered.size,
    trips: [...discovered.values()]
  };
  fs.writeFileSync(path.join(OUTPUT_DIR, "discovered-trips.json"), JSON.stringify(payload, null, 2));
}

async function inspectResponse(params) {
  const meta = responseMeta.get(params.requestId);
  if (!meta) return;
  const mime = String(meta.mimeType || "").toLowerCase();
  if (!(mime.includes("json") || mime.includes("javascript") || mime.includes("text"))) return;

  try {
    const result = await send("Network.getResponseBody", { requestId: params.requestId });
    if (!result || !result.body || result.body.length > MAX_BODY) return;
    let text = result.body;
    if (result.base64Encoded) text = Buffer.from(text, "base64").toString("utf8");
    const trimmed = text.trim();
    if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) return;
    const parsed = JSON.parse(trimmed);
    walk(parsed, { ...meta, requestId: params.requestId });
  } catch (_) {
    // Ignore non-JSON/evicted response bodies. Discovery continues.
  }
}

async function attach() {
  const target = await waitForTarget();
  ws = new WebSocket(target.webSocketDebuggerUrl);

  ws.on("message", async raw => {
    let msg;
    try { msg = JSON.parse(String(raw)); } catch (_) { return; }

    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message || "CDP error"));
      else p.resolve(msg.result);
      return;
    }

    if (msg.method === "Network.responseReceived") {
      const r = msg.params.response || {};
      let host = "";
      try { host = new URL(r.url).host; } catch (_) {}
      responseMeta.set(msg.params.requestId, {
        url: r.url,
        host,
        status: r.status,
        mimeType: r.mimeType
      });
    }
    if (msg.method === "Network.loadingFinished") {
      await inspectResponse(msg.params);
    }
  });

  await new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });

  await send("Network.enable", { maxTotalBufferSize: 100000000, maxResourceBufferSize: 10000000 });
  await send("Page.enable");

  console.log("");
  console.log("GH Mobility Browser Discovery Agent");
  console.log("-----------------------------------");
  console.log("MODE: READ ONLY");
  console.log("1) A normal external browser window is open.");
  console.log("2) The account owner logs in directly on the provider portal.");
  console.log("3) Browse to the available trips/tasks page normally.");
  console.log("4) The agent observes structured JSON responses only.");
  console.log("5) Claim/Accept is NOT performed by this agent.");
  console.log(`6) GH Bridge: ${BRIDGE_ENABLED ? "ENABLED" : "OFF (local JSON only)"}`);

  console.log("");
  console.log(`Output: ${path.join(OUTPUT_DIR, "discovered-trips.json")}`);
  console.log("Press Ctrl+C when finished.");
}

function removeDirSafe(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
}

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  writeSnapshot();
  try { if (ws) ws.close(); } catch (_) {}
  try { if (browserProcess && !browserProcess.killed) browserProcess.kill(); } catch (_) {}
  setTimeout(() => {
    removeDirSafe(profileDir); // ephemeral profile: do not retain portal login/session
    process.exit(0);
  }, 200);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("exit", () => removeDirSafe(profileDir));

(async () => {
  try {
    launchBrowser();
    await attach();
  } catch (e) {
    console.error(e.message || e);
    shutdown();
  }
})();
