GH Mobility Desktop - Final Version

Destination:
server/desktop-app/

Replace these files:
server/desktop-app/package.json
server/desktop-app/main.js
server/desktop-app/preload.js
server/desktop-app/config.json

Keep:
server/desktop-app/assets/gh-mobility.ico

Behavior:
- Windows title is always "GH Mobility".
- Opens the general /login.html page.
- Starts maximized.
- Automatically adjusts zoom to laptop/desktop screen size.
- Recalculates layout zoom when the window is resized or moved to another screen.
- Uses the same web/backend system for all tenants.
- When a new domain is purchased, change only "appUrl" in config.json.

Current temporary URL:
https://sunbeam-933q.onrender.com

Future example:
https://app.ghmobility.com

Install dependencies:
npm install

Test:
npm start

Build Windows installer:
npm run build:win

Installer output:
dist/GH-Mobility-Setup-1.0.1.exe

IMPORTANT:
Do not commit these folders:
desktop-app/node_modules/
desktop-app/dist/
