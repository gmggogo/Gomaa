const { app, BrowserWindow, shell, dialog, screen } = require("electron");
const path = require("path");
const fs = require("fs");



// GH Mobility: Electron text-input recovery.
// On affected Windows/Electron systems, keydown/keyup can continue while
// Chromium stops producing beforeinput/input. This watchdog only acts when
// that exact failure is detected, so normal typing is untouched.
function installTextInputRecovery(win) {
  if (!win || win.isDestroyed()) return;

  const script = `
    (() => {
      if (window.__ghTextInputRecoveryInstalled) return;
      window.__ghTextInputRecoveryInstalled = true;

      let textEventSerial = 0;

      const NON_TEXT_INPUT_TYPES = new Set([
        'hidden', 'checkbox', 'radio', 'button', 'submit', 'reset',
        'file', 'image', 'range', 'color', 'date', 'datetime-local',
        'month', 'week', 'time'
      ]);

      // Covers all normal text-entry controls, including email/tel/search/url,
      // without requiring a hard-coded allow-list for future text fields.
      const isEditable = (el) => {
        if (!el || el.disabled || el.readOnly) return false;
        if (el.isContentEditable) return true;
        if (el instanceof HTMLTextAreaElement) return true;
        if (!(el instanceof HTMLInputElement)) return false;

        const type = String(el.type || 'text').toLowerCase();
        return !NON_TEXT_INPUT_TYPES.has(type);
      };

      document.addEventListener('beforeinput', () => { textEventSerial++; }, true);
      document.addEventListener('input', () => { textEventSerial++; }, true);

      document.addEventListener('keydown', (event) => {
        if (event.defaultPrevented || event.isComposing) return;
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        if (typeof event.key !== 'string' || event.key.length !== 1) return;

        const el = document.activeElement;
        if (!isEditable(el)) return;

        const serialAtKeydown = textEventSerial;
        const valueAtKeydown = 'value' in el ? String(el.value ?? '') : String(el.textContent ?? '');
        const key = event.key;

        setTimeout(() => {
          // Native Chromium text input worked; leave it completely alone.
          if (textEventSerial !== serialAtKeydown) return;
          if (document.activeElement !== el || !isEditable(el)) return;

          const currentValue = 'value' in el ? String(el.value ?? '') : String(el.textContent ?? '');
          if (currentValue !== valueAtKeydown) return;

          try {
            const before = new InputEvent('beforeinput', {
              bubbles: true,
              cancelable: true,
              inputType: 'insertText',
              data: key
            });
            if (!el.dispatchEvent(before)) return;

            // execCommand uses Chromium's own editing path and works for focused
            // text controls that do not expose selectionStart, notably type=email.
            let inserted = false;
            try {
              inserted = document.execCommand('insertText', false, key) === true;
            } catch (_) {}

            if (inserted) return;

            if (el.isContentEditable) return;

            // Fallback for controls that expose a normal caret API.
            let start = null;
            let end = null;
            try {
              if (typeof el.selectionStart === 'number') start = el.selectionStart;
              if (typeof el.selectionEnd === 'number') end = el.selectionEnd;
            } catch (_) {}

            if (start != null && end != null && typeof el.setRangeText === 'function') {
              el.setRangeText(key, start, end, 'end');
            } else {
              // email/number and future text-entry input types may not expose
              // selectionStart. In recovery mode only, append to the current value.
              el.value = currentValue + key;
            }

            el.dispatchEvent(new InputEvent('input', {
              bubbles: true,
              inputType: 'insertText',
              data: key
            }));
          } catch (error) {
            console.error('GH text input recovery failed:', error);
          }
        }, 35);
      }, true);
    })();
  `;

  win.webContents.executeJavaScript(script, true).catch((error) => {
    console.error('Could not install GH text input recovery:', error);
  });
}

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
    "https://ghmobility.com";

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

  const currentUrl =
    String(
      win.webContents.getURL() || ""
    ).toLowerCase();

  /*
    GH Mobility desktop-only page-aware zoom.

    Login stays larger and easier to use.
    Internal admin/platform pages keep the smaller scale that
    fits the full navigation and dashboards on laptop screens.
  */

  const isLogin =
    currentUrl.includes("/login.html") ||
    currentUrl.includes("/company-login.html");

  const isAdmin =
    currentUrl.includes("/admin/");

  const isPlatformAdmin =
    currentUrl.includes("/platform-admin/");

  const isCompany =
    currentUrl.includes("/companies/");

  let targetWidth = 2900;
  let targetHeight = 1250;
  let minZoom = 0.47;
  let maxZoom = 0.88;

  if (isLogin) {
    targetWidth = 1700;
    targetHeight = 980;
    minZoom = 0.72;
    maxZoom = 0.86;
  } else if (isPlatformAdmin || isAdmin) {
    targetWidth = 2900;
    targetHeight = 1250;
    minZoom = 0.47;
    maxZoom = 0.88;
  } else if (isCompany) {
    targetWidth = 2450;
    targetHeight = 1180;
    minZoom = 0.52;
    maxZoom = 0.90;
  }

  const widthZoom =
    width / targetWidth;

  const heightZoom =
    height / targetHeight;

  let zoom =
    Math.min(
      widthZoom,
      heightZoom,
      1
    );

  zoom =
    Math.max(
      minZoom,
      Math.min(
        maxZoom,
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
    installTextInputRecovery(mainWindow);
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

  // Zoom is applied only when a page loads/navigates.
  // Do not re-apply it on resize/move/maximize while the user is typing.

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
