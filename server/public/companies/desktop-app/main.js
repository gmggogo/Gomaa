const { app, BrowserWindow, shell, dialog } = require("electron");
const path = require("path");
const fs = require("fs");

const CONFIG_PATH = path.join(__dirname, "config.json");

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch (error) {
    console.error("Could not read config.json:", error);
    return {};
  }
}

function isAllowedUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    const allowed = new URL(loadConfig().appUrl || "https://sunbeam-933q.onrender.com/companies/company-login.html");
    return url.origin === allowed.origin;
  } catch {
    return false;
  }
}

function calculateZoomFactor(win) {
  if (!win || win.isDestroyed()) return 1;

  const { width, height } = win.getContentBounds();
  const currentUrl = String(win.webContents.getURL() || "").toLowerCase();

  const isLogin =
    currentUrl.includes("/companies/company-login.html") ||
    currentUrl.includes("/company-login.html");

  let targetWidth = 2450;
  let targetHeight = 1180;
  let minZoom = 0.52;
  let maxZoom = 0.90;

  if (isLogin) {
    targetWidth = 1700;
    targetHeight = 980;
    minZoom = 0.72;
    maxZoom = 0.86;
  }

  const widthZoom = width / targetWidth;
  const heightZoom = height / targetHeight;

  let zoom = Math.min(widthZoom, heightZoom, 1);
  zoom = Math.max(minZoom, Math.min(maxZoom, zoom));

  return Number(zoom.toFixed(2));
}

function applyDesktopFit(win) {
  if (!win || win.isDestroyed()) return;
  try {
    const zoom = calculateZoomFactor(win);
    win.webContents.setZoomLevel(0);
    win.webContents.setZoomFactor(zoom);
    console.log("GH FACILITIES DESKTOP ZOOM:", zoom, win.getContentBounds());
  } catch (error) {
    console.error("Could not apply desktop zoom:", error);
  }
}

function createWindow() {
  const config = loadConfig();
  const appUrl = config.appUrl || "https://sunbeam-933q.onrender.com/companies/company-login.html";

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    show: false,
    backgroundColor: "#eaf7ff",
    icon: path.join(__dirname, "assets", "gh-mobility-facilities.ico"),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });

  win.maximize();

  win.once("ready-to-show", () => {
    applyDesktopFit(win);
    win.show();
  });

  win.webContents.on("dom-ready", () => applyDesktopFit(win));
  win.webContents.on("did-finish-load", () => applyDesktopFit(win));
  win.webContents.on("did-navigate", () => applyDesktopFit(win));
  win.webContents.on("did-navigate-in-page", () => applyDesktopFit(win));

  win.on("resize", () => applyDesktopFit(win));
  win.on("maximize", () => applyDesktopFit(win));

  // Keep normal GH Mobility web navigation inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedUrl(url)) {
      win.loadURL(url);
      return { action: "deny" };
    }
    shell.openExternal(url);
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    if (!isAllowedUrl(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  win.loadURL(appUrl).catch((error) => {
    console.error("Could not load GH Mobility Facilities:", error);
    dialog.showErrorBox(
      "GH Mobility Facilities",
      "Could not connect to GH Mobility. Check the internet connection and try again."
    );
  });
}

app.whenReady().then(() => {
  app.setAppUserModelId("com.ghmobility.facilities");
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
