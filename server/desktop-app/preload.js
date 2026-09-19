const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("ghDesktop", {
  isDesktopApp: true,
  appName: "GH Mobility",
  platform: process.platform,
  versions: {
    chrome: process.versions.chrome,
    electron: process.versions.electron
  }
});
