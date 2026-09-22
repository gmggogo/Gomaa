
const { app, BrowserWindow, shell, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const { execFile } = require("child_process");

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


// GH Mobility Facilities: use Windows native location instead of Electron's
// Google network-location provider. This avoids Electron geolocation 403 errors.
const GH_NATIVE_LOCATION_URL = "gh-native-location://current";

function getWindowsNativeLocation() {
  return new Promise((resolve, reject) => {
    if (process.platform !== "win32") {
      reject(new Error("Native location is currently implemented for Windows only."));
      return;
    }

    const ps = `
$ErrorActionPreference = 'Stop'
$winRtError = $null

try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime

  $null = [Windows.Devices.Geolocation.Geolocator,Windows.Devices.Geolocation,ContentType=WindowsRuntime]
  $null = [Windows.Devices.Geolocation.Geoposition,Windows.Devices.Geolocation,ContentType=WindowsRuntime]

  $locator = New-Object Windows.Devices.Geolocation.Geolocator
  $locator.DesiredAccuracy = [Windows.Devices.Geolocation.PositionAccuracy]::High

  $op = $locator.GetGeopositionAsync()

  $method = [System.WindowsRuntimeSystemExtensions].GetMethods() |
    Where-Object {
      $_.Name -eq 'AsTask' -and
      $_.IsGenericMethod -and
      $_.GetParameters().Count -eq 1
    } |
    Select-Object -First 1

  if (-not $method) {
    throw 'Could not find Windows Runtime AsTask bridge.'
  }

  $generic = $method.MakeGenericMethod([Windows.Devices.Geolocation.Geoposition])
  $task = $generic.Invoke($null, @($op))

  if (-not $task.Wait(15000)) {
    throw 'Windows Runtime location request timed out.'
  }

  $position = $task.Result
  $basic = $position.Coordinate.Point.Position

  $result = [PSCustomObject]@{
    latitude  = [double]$basic.Latitude
    longitude = [double]$basic.Longitude
    altitude  = [double]$basic.Altitude
    accuracy  = [double]$position.Coordinate.Accuracy
  }

  $result | ConvertTo-Json -Compress
  exit 0
}
catch {
  $winRtError = $_.Exception.Message
}

try {
  Add-Type -AssemblyName System.Device

  $watcher = New-Object System.Device.Location.GeoCoordinateWatcher(
    [System.Device.Location.GeoPositionAccuracy]::High
  )

  $started = $watcher.TryStart(
    $false,
    [TimeSpan]::FromSeconds(12)
  )

  if (-not $started) {
    throw 'GeoCoordinateWatcher did not start.'
  }

  $coord = $watcher.Position.Location

  if ($coord.IsUnknown) {
    throw 'GeoCoordinateWatcher returned an unknown position.'
  }

  $altitude = $null
  if (-not [double]::IsNaN([double]$coord.Altitude)) {
    $altitude = [double]$coord.Altitude
  }

  $accuracy = 0
  if (-not [double]::IsNaN([double]$coord.HorizontalAccuracy)) {
    $accuracy = [double]$coord.HorizontalAccuracy
  }

  $result = [PSCustomObject]@{
    latitude  = [double]$coord.Latitude
    longitude = [double]$coord.Longitude
    altitude  = $altitude
    accuracy  = $accuracy
  }

  $watcher.Stop()
  $result | ConvertTo-Json -Compress
}
catch {
  $legacyError = $_.Exception.Message
  throw ("Windows native location failed. WinRT: " + $winRtError + " | Legacy: " + $legacyError)
}
`;

    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", ps],
      { windowsHide: true, timeout: 25000, maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          const details = String(stderr || stdout || error.message || "Windows location failed.").trim();
          reject(new Error(details));
          return;
        }

        try {
          const data = JSON.parse(String(stdout || "").trim());

          if (
            !Number.isFinite(Number(data.latitude)) ||
            !Number.isFinite(Number(data.longitude))
          ) {
            throw new Error("Windows returned invalid location coordinates.");
          }

          resolve({
            latitude: Number(data.latitude),
            longitude: Number(data.longitude),
            altitude: data.altitude == null ? null : Number(data.altitude),
            accuracy: Number(data.accuracy || 0)
          });
        } catch (parseError) {
          reject(
            new Error(
              "Could not parse Windows location response: " +
              String(stdout || "").trim() +
              " | " +
              parseError.message
            )
          );
        }
      }
    );
  });
}

function installNativeGeolocationBridge(win) {
  if (!win || win.isDestroyed()) return;

  const script = `
    (() => {
      if (window.__ghNativeGeolocationInstalled) return;
      window.__ghNativeGeolocationInstalled = true;

      let pendingSuccess = null;
      let pendingError = null;

      window.__ghNativeLocationSuccess = (coords) => {
        const success = pendingSuccess;
        pendingSuccess = null;
        pendingError = null;

        if (typeof success === 'function') {
          success({
            coords: {
              latitude: Number(coords.latitude),
              longitude: Number(coords.longitude),
              altitude: coords.altitude == null ? null : Number(coords.altitude),
              accuracy: Number(coords.accuracy || 0),
              altitudeAccuracy: null,
              heading: null,
              speed: null
            },
            timestamp: Date.now()
          });
        }
      };

      window.__ghNativeLocationError = (message) => {
        const failure = pendingError;
        pendingSuccess = null;
        pendingError = null;

        if (typeof failure === 'function') {
          failure({
            code: 2,
            message: String(message || 'Current location is unavailable.')
          });
        } else {
          console.error('GH native location error:', message);
        }
      };

      const requestCurrentPosition = (success, error) => {
        pendingSuccess = typeof success === 'function' ? success : null;
        pendingError = typeof error === 'function' ? error : null;

        // Main process intercepts this navigation and returns Windows coordinates.
        window.location.href = "gh-native-location://current";
      };

      try {
        const geo = navigator.geolocation;
        if (geo) {
          Object.defineProperty(geo, 'getCurrentPosition', {
            configurable: true,
            value: requestCurrentPosition
          });
        }
      } catch (_) {}

      console.log('GH NATIVE GEOLOCATION BRIDGE READY');
    })();
  `;

  win.webContents.executeJavaScript(script, true).catch((error) => {
    console.error("Could not install GH native geolocation bridge:", error);
  });
}

async function handleNativeLocationRequest(win) {
  try {
    const coords = await getWindowsNativeLocation();
    if (!win || win.isDestroyed()) return;

    await win.webContents.executeJavaScript(
      `window.__ghNativeLocationSuccess && window.__ghNativeLocationSuccess(${JSON.stringify(coords)});`,
      true
    );
  } catch (error) {
    if (!win || win.isDestroyed()) return;

    const message = String(error && error.message ? error.message : error);
    console.error("GH native location failed:", message);

    await win.webContents.executeJavaScript(
      `window.__ghNativeLocationError && window.__ghNativeLocationError(${JSON.stringify(message)});`,
      true
    ).catch(() => {});
  }
}

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

  win.webContents.on("dom-ready", () => {
    installTextInputRecovery(win);
    installNativeGeolocationBridge(win);
    applyDesktopFit(win);
  });
  win.webContents.on("did-finish-load", () => applyDesktopFit(win));
  win.webContents.on("did-navigate", () => applyDesktopFit(win));
  win.webContents.on("did-navigate-in-page", () => applyDesktopFit(win));

  // Do not re-apply zoom on resize/maximize while the user is typing.

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedUrl(url)) {
      win.loadURL(url);
      return { action: "deny" };
    }
    shell.openExternal(url);
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    if (url === GH_NATIVE_LOCATION_URL || url.startsWith(GH_NATIVE_LOCATION_URL + "/")) {
      event.preventDefault();
      handleNativeLocationRequest(win);
      return;
    }

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
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
