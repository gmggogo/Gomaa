const { app, BrowserWindow, shell, dialog, screen } = require("electron");
const path = require("path");
const fs = require("fs");

const APP_TITLE = "GH Mobility";
const CONFIG_PATH = path.join(__dirname, "config.json");

function loadConfig() {
  let config = {};

  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    config = JSON.parse(raw);
  } catch (error) {
    console.error("Could not read config.json:", error);
  }

  const appUrl =
    process.env.GH_MOBILITY_APP_URL ||
    config.appUrl ||
    "https://sunbeam-933q.onrender.com";

  const startPath =
    process.env.GH_MOBILITY_START_PATH ||
    config.startPath ||
    "/login.html";

  return {
    appUrl: String(appUrl).replace(/\/+$/, ""),
    startPath: String(startPath).startsWith("/")
      ? String(startPath)
      : `/${startPath}`,
    minWidth: Number(config.minWidth) || 900,
    minHeight: Number(config.minHeight) || 600
  };
}

const config = loadConfig();

function getStartUrl() {
  return `${config.appUrl}${config.startPath}`;
}

function isInternalUrl(urlString) {
  try {
    const target = new URL(urlString);
    const appOrigin = new URL(config.appUrl).origin;
    return target.origin === appOrigin;
  } catch {
    return false;
  }
}

function calculateZoomFactor(win) {
  if (!win || win.isDestroyed()) return 1;

  const { width, height } = win.getContentBounds();

  /*
    GH Mobility adaptive desktop zoom.
    The app automatically scales itself for laptop, desktop and larger displays.
    Width is the main factor and height adds a small correction.
  */
  let zoom = 1.0;

  if (width <= 1100) zoom = 0.64;
  else if (width <= 1280) zoom = 0.68;
  else if (width <= 1366) zoom = 0.72;
  else if (width <= 1440) zoom = 0.76;
  else if (width <= 1536) zoom = 0.80;
  else if (width <= 1600) zoom = 0.84;
  else if (width <= 1920) zoom = 0.88;
  else if (width <= 2560) zoom = 0.96;
  else zoom = 1.0;

  if (height <= 720) zoom -= 0.04;
  else if (height <= 800) zoom -= 0.02;

  return Math.max(0.60, Math.min(1.0, zoom));
}

function applyDesktopFit(win) {
  if (!win || win.isDestroyed()) return;

  const zoom = calculateZoomFactor(win);
  win.webContents.setZoomFactor(zoom);
}

function forceAppTitle(win) {
  if (!win || win.isDestroyed()) return;
  win.setTitle(APP_TITLE);
}

function fitToCurrentDisplay(win) {
  if (!win || win.isDestroyed()) return;

  const display = screen.getDisplayMatching(win.getBounds());
  const workArea = display.workArea;

  // Match the usable Windows desktop area, excluding the taskbar.
  win.setBounds({
    x: workArea.x,
    y: workArea.y,
    width: workArea.width,
    height: workArea.height
  });

  win.maximize();
}

function createMainWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const workArea = primaryDisplay.workArea;

  const mainWindow = new BrowserWindow({
    title: APP_TITLE,
    x: workArea.x,
    y: workArea.y,
    width: workArea.width,
    height: workArea.height,
    minWidth: config.minWidth,
    minHeight: config.minHeight,
    show: false,
    autoHideMenuBar: true,
    resizable: true,
    maximizable: true,
    fullscreenable: true,
    icon: path.join(__dirname, "assets", "gh-mobility.ico"),
    backgroundColor: "#0f172a",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });

  mainWindow.setMenuBarVisibility(false);

  // Keep the Windows app title fixed even if a tenant page changes document.title.
  mainWindow.webContents.on("page-title-updated", (event) => {
    event.preventDefault();
    forceAppTitle(mainWindow);
  });

  mainWindow.once("ready-to-show", () => {
    fitToCurrentDisplay(mainWindow);
    applyDesktopFit(mainWindow);
    forceAppTitle(mainWindow);
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.webContents.on("did-finish-load", () => {
    applyDesktopFit(mainWindow);
    forceAppTitle(mainWindow);
  });

  mainWindow.webContents.on("did-navigate", () => {
    applyDesktopFit(mainWindow);
    forceAppTitle(mainWindow);
  });

  mainWindow.webContents.on("did-navigate-in-page", () => {
    applyDesktopFit(mainWindow);
    forceAppTitle(mainWindow);
  });

  let resizeTimer = null;

  mainWindow.on("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      applyDesktopFit(mainWindow);
      forceAppTitle(mainWindow);
    }, 120);
  });

  mainWindow.on("maximize", () => {
    setTimeout(() => {
      applyDesktopFit(mainWindow);
      forceAppTitle(mainWindow);
    }, 120);
  });

  mainWindow.on("move", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      applyDesktopFit(mainWindow);
      forceAppTitle(mainWindow);
    }, 120);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isInternalUrl(url)) {
      mainWindow.loadURL(url);
    } else {
      shell.openExternal(url);
    }

    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isInternalUrl(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.webContents.on(
    "did-fail-load",
    async (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame) return;

      console.error(
        `Failed to load ${validatedURL}: ${errorCode} ${errorDescription}`
      );

      const result = await dialog.showMessageBox(mainWindow, {
        type: "error",
        title: APP_TITLE,
        message: "GH Mobility could not connect to the server.",
        detail: "Check your internet connection, then try again.",
        buttons: ["Retry", "Close"],
        defaultId: 0,
        cancelId: 1
      });

      if (result.response === 0) {
        mainWindow.loadURL(getStartUrl());
      } else {
        mainWindow.close();
      }
    }
  );

  mainWindow.loadURL(getStartUrl());
}

app.setName(APP_TITLE);

app.whenReady().then(() => {
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
