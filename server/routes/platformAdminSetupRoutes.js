const express = require("express");
const bcrypt = require("bcrypt");

const router = express.Router();
const User = require("../models/User");

function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/*
  TEMPORARY PLATFORM ADMIN SETUP

  Security rules:
  1) Requires PLATFORM_SETUP_KEY from Render Environment.
  2) Works ONLY while no PLATFORM_ADMIN exists.
  3) After the first Platform Admin is created, this route locks itself.
  4) Delete this route + server mount after setup is complete.
*/

router.get("/", async (req, res) => {
  try {
    const existing = await User.findOne({
      role: "PLATFORM_ADMIN"
    }).lean();

    if (existing) {
      return res
        .status(403)
        .type("html")
        .send(`
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>GH Mobility Platform Setup</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    body{font-family:Arial,sans-serif;background:#101827;color:#fff;display:grid;place-items:center;min-height:100vh;margin:0}
    .box{width:min(440px,90vw);background:#172033;padding:28px;border-radius:18px;box-shadow:0 18px 50px #0007}
    h1{margin:0 0 12px;font-size:24px}
    p{color:#cbd5e1;line-height:1.5}
  </style>
</head>
<body>
  <div class="box">
    <h1>GH Mobility Platform Setup</h1>
    <p>Platform Admin already exists. This temporary setup page is locked.</p>
  </div>
</body>
</html>`);
    }

    return res.type("html").send(`
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>GH Mobility Platform Setup</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    *{box-sizing:border-box}
    body{
      font-family:Arial,sans-serif;
      background:linear-gradient(135deg,#111827,#312e81);
      color:#fff;display:grid;place-items:center;min-height:100vh;margin:0
    }
    .box{
      width:min(460px,92vw);background:#111827e8;padding:30px;
      border-radius:20px;box-shadow:0 22px 60px #0008;border:1px solid #ffffff18
    }
    h1{margin:0 0 6px;font-size:26px}
    .sub{color:#cbd5e1;margin:0 0 22px}
    label{display:block;margin:14px 0 6px;color:#e5e7eb;font-size:14px}
    input{
      width:100%;padding:12px 13px;border-radius:10px;border:1px solid #475569;
      background:#0f172a;color:#fff;outline:none
    }
    button{
      width:100%;margin-top:20px;padding:13px;border:0;border-radius:10px;
      background:#7c3aed;color:white;font-weight:700;cursor:pointer
    }
    #msg{margin-top:14px;min-height:22px;color:#fca5a5}
    .ok{color:#86efac!important}
    .note{font-size:12px;color:#94a3b8;margin-top:16px;line-height:1.45}
  </style>
</head>
<body>
<div class="box">
  <h1>GH Mobility Platform Setup</h1>
  <p class="sub">Create the first Platform Admin for the new database.</p>

  <form id="setupForm">
    <label>Platform Setup Key</label>
    <input id="setupKey" type="password" autocomplete="off" required>

    <label>Name</label>
    <input id="name" value="Gomaa" required>

    <label>Username</label>
    <input id="username" autocomplete="username" required>

    <label>Password</label>
    <input id="password" type="password" autocomplete="new-password" minlength="8" required>

    <label>Email (optional)</label>
    <input id="email" type="email">

    <button type="submit">Create Platform Admin</button>
    <div id="msg"></div>
  </form>

  <div class="note">
    This page works only once. After the Platform Admin is created,
    the server locks this setup route automatically.
  </div>
</div>

<script>
const form = document.getElementById("setupForm");
const msg = document.getElementById("msg");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  msg.className = "";
  msg.textContent = "Creating Platform Admin...";

  const payload = {
    setupKey: document.getElementById("setupKey").value,
    name: document.getElementById("name").value,
    username: document.getElementById("username").value,
    password: document.getElementById("password").value,
    email: document.getElementById("email").value
  };

  try {
    const r = await fetch("/platform-setup/create", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify(payload)
    });

    const data = await r.json().catch(() => ({}));

    if (!r.ok) {
      throw new Error(data.message || "Setup failed");
    }

    msg.className = "ok";
    msg.textContent = "Platform Admin created. Signing in...";

    const loginRes = await fetch("/api/auth/login", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({
        username: payload.username,
        password: payload.password
      })
    });

    const loginData = await loginRes.json().catch(() => ({}));

    if (!loginRes.ok || !loginData.token) {
      throw new Error(loginData.message || "Created, but automatic sign in failed");
    }

    localStorage.setItem("token", loginData.token);
    localStorage.setItem("role", loginData.user?.role || "PLATFORM_ADMIN");
    localStorage.setItem("name", loginData.user?.name || payload.name);
    localStorage.removeItem("tenantId");
    localStorage.removeItem("tenantSlug");
    sessionStorage.removeItem("loginTenantSlug");

    window.location.href = "/platform-admin/dashboard.html";

  } catch (err) {
    msg.className = "";
    msg.textContent = err.message || "Setup failed";
  }
});
</script>
</body>
</html>`);
  } catch (err) {
    console.error("PLATFORM SETUP PAGE ERROR:", err);
    return res.status(500).send("Setup page error");
  }
});

router.post("/create", async (req, res) => {
  try {
    const expectedKey = String(process.env.PLATFORM_SETUP_KEY || "").trim();
    const providedKey = String(req.body?.setupKey || "").trim();

    if (!expectedKey) {
      return res.status(500).json({
        message: "PLATFORM_SETUP_KEY is not configured"
      });
    }

    if (!providedKey || providedKey !== expectedKey) {
      return res.status(403).json({
        message: "Invalid Platform Setup Key"
      });
    }

    const existing = await User.findOne({
      role: "PLATFORM_ADMIN"
    });

    if (existing) {
      return res.status(409).json({
        message: "Platform Admin already exists"
      });
    }

    const name = String(req.body?.name || "").trim();
    const username = String(req.body?.username || "").trim();
    const password = String(req.body?.password || "");
    const email = String(req.body?.email || "").trim();

    if (!name || !username || !password) {
      return res.status(400).json({
        message: "name, username and password are required"
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        message: "Password must be at least 8 characters"
      });
    }

    const sameUsername = await User.findOne({ username });

    if (sameUsername) {
      return res.status(409).json({
        message: "Username already exists"
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      username,
      password: hashedPassword,
      email,
      role: "PLATFORM_ADMIN",
      tenantId: null,
      active: true,
      enabled: true
    });

    return res.status(201).json({
      success: true,
      message: "Platform Admin created successfully",
      user: {
        id: user._id,
        name: user.name,
        username: user.username,
        role: user.role
      }
    });

  } catch (err) {
    console.error("PLATFORM ADMIN SETUP ERROR:", err);

    if (err?.code === 11000) {
      return res.status(409).json({
        message: "Username already exists"
      });
    }

    return res.status(500).json({
      message: err?.message || "Server error"
    });
  }
});

module.exports = router;