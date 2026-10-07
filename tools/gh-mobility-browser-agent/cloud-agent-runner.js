"use strict";

/*
  GH Mobility Oracle Cloud Agent Runner
  Destination: /home/opc/gh-mobility-browser-agent/cloud-agent-runner.js

  Polls GH Mobility outbound control plane, keeps local browser-agent sessions
  synchronized, and posts heartbeats. It does not handle portal passwords/MFA.
*/

const http = require("http");
const https = require("https");

const GH_BASE_URL = String(process.env.GH_BASE_URL || "https://ghmobility.com")
  .trim()
  .replace(/\/+$/, "");
const AGENT_KEY = String(process.env.GH_BROWSER_AGENT_KEY || "").trim();
const NODE_ID = String(process.env.GH_AGENT_NODE_ID || require("os").hostname() || "oracle-default")
  .trim()
  .slice(0, 120);
const LOCAL_BASE = String(process.env.GH_LOCAL_AGENT_URL || "http://127.0.0.1:18733")
  .trim()
  .replace(/\/+$/, "");

let stopped = false;
let pollTimer = null;
let heartbeatTimer = null;
let lastConnections = new Map();

function requestJson(method, urlString, payload = null, headers = {}, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(urlString); } catch (e) { return reject(e); }

    const transport = u.protocol === "https:" ? https : http;
    const body = payload == null ? null : Buffer.from(JSON.stringify(payload), "utf8");
    const req = transport.request({
      protocol: u.protocol,
      hostname: u.hostname,
      port: u.port || undefined,
      path: `${u.pathname}${u.search}`,
      method,
      headers: {
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json", "Content-Length": body.length } : {}),
        ...headers
      },
      timeout: timeoutMs
    }, res => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let data = null;
        try { data = text ? JSON.parse(text) : {}; } catch (_) { data = { raw: text }; }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else {
          const err = new Error(`HTTP ${res.statusCode}: ${data?.message || text || "request failed"}`);
          err.statusCode = res.statusCode;
          err.data = data;
          reject(err);
        }
      });
    });
    req.on("timeout", () => req.destroy(new Error("Request timeout")));
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function authHeaders() {
  return { Authorization: `Bearer ${AGENT_KEY}` };
}

async function localHealth() {
  return requestJson("GET", `${LOCAL_BASE}/health`, null, {}, 4000);
}

async function localConnect(connection, ghBaseUrl) {
  return requestJson("POST", `${LOCAL_BASE}/connect`, {
    connectionId: connection.connectionId,
    tenantId: connection.tenantId,
    portalUrl: connection.portalUrl,
    brokerName: connection.brokerName,
    brokerCode: connection.brokerCode,
    accountLabel: connection.accountLabel,
    agentToken: connection.agentToken,
    ghBaseUrl
  }, {}, 15000);
}

async function localDisconnect(connectionId) {
  return requestJson("POST", `${LOCAL_BASE}/disconnect`, { connectionId }, {}, 8000);
}

async function syncControl() {
  try {
    const control = await requestJson(
      "GET",
      `${GH_BASE_URL}/api/provider-portal-bridge/agent/control?nodeId=${encodeURIComponent(NODE_ID)}`,
      null,
      authHeaders(),
      12000
    );

    const desired = Array.isArray(control.connections) ? control.connections : [];
    const desiredMap = new Map(desired.map(c => [String(c.connectionId || "").trim(), c]).filter(([id]) => id));

    for (const oldId of lastConnections.keys()) {
      if (!desiredMap.has(oldId)) {
        try { await localDisconnect(oldId); } catch (_) {}
      }
    }

    for (const connection of desiredMap.values()) {
      try {
        await localConnect(connection, control.ghBaseUrl || GH_BASE_URL);
      } catch (err) {
        console.error(`[cloud-runner] connect ${connection.connectionId} failed: ${err.message}`);
      }
    }

    lastConnections = desiredMap;
    const next = Math.max(2000, Number(control.pollAfterMs || 5000));
    schedulePoll(next);
  } catch (err) {
    console.error(`[cloud-runner] control failed: ${err.message}`);
    schedulePoll(5000);
  }
}

async function sendHeartbeat() {
  try {
    const health = await localHealth();
    const sessions = Array.isArray(health.sessions) ? health.sessions : [];
    await requestJson(
      "POST",
      `${GH_BASE_URL}/api/provider-portal-bridge/agent/heartbeat`,
      { nodeId: NODE_ID, sessions },
      authHeaders(),
      10000
    );
    console.log(`[cloud-runner] heartbeat ok; sessions=${sessions.length}`);
  } catch (err) {
    console.error(`[cloud-runner] heartbeat failed: ${err.message}`);
  }
}

function schedulePoll(ms) {
  if (stopped) return;
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = setTimeout(syncControl, ms);
}

function shutdown() {
  stopped = true;
  if (pollTimer) clearTimeout(pollTimer);
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  process.exit(0);
}

if (!AGENT_KEY) {
  console.error("GH_BROWSER_AGENT_KEY is missing");
  process.exit(2);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

(async () => {
  console.log(`[cloud-runner] node=${NODE_ID}`);
  console.log(`[cloud-runner] GH=${GH_BASE_URL}`);
  console.log(`[cloud-runner] local=${LOCAL_BASE}`);
  try {
    const h = await localHealth();
    console.log(`[cloud-runner] local browser agent reachable; sessions=${Array.isArray(h.sessions) ? h.sessions.length : 0}`);
  } catch (err) {
    console.error(`[cloud-runner] local browser agent is not reachable: ${err.message}`);
  }
  await syncControl();
  await sendHeartbeat();
  heartbeatTimer = setInterval(sendHeartbeat, 5000);
})();
