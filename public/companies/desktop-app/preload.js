const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("ghDesktop", {
  platform: process.platform,
  isDesktopApp: true,
  appType: "FACILITIES"
});
