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
    GH Mobility desktop-only auto zoom.

    The web pages remain untouched.
    Electron scales the WHOLE page to fit a comfortable virtual workspace.

    This behaves like pressing browser Zoom Out, but automatically:
    - smaller laptop window  -> stronger zoom out
    - normal desktop monitor -> moderate zoom out
    - large monitor          -> closer to 100%
  */
  const TARGET_LAYOUT_WIDTH = 2000;
  const TARGET_LAYOUT_HEIGHT = 1050;

  const widthZoom =
    width / TARGET_LAYOUT_WIDTH;

  const heightZoom =
    height / TARGET_LAYOUT_HEIGHT;

  let zoom =
    Math.min(
      widthZoom,
      heightZoom,
      1
    );

  /*
    Keep the UI readable while still fitting the full GH layout.
    0.56 = 56% minimum
    0.94 = 94% maximum
  */
  zoom =
    Math.max(
      0.56,
      Math.min(
        0.94,
        zoom
      )
    );

  return Number(
    zoom.toFixed(2)
  );
}

function applyDesktopFit(win) {
  if (!win || win.isDestroyed()) return;

  const zoom =
    calculateZoomFactor(win);

  try {
    win.webContents.setZoomLevel(0);
    win.webContents.setZoomFactor(zoom);

    console.log(
      "GH DESKTOP AUTO ZOOM:",
      zoom,
      win.getContentBounds()
    );
  } catch (error) {
    console.error(
      "Could not apply GH desktop zoom:",
      error
    );
  }
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

  mainWindow.webContents.on("dom-ready", () => {
    applyDesktopFit(mainWindow);
    forceAppTitle(mainWindow);
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
