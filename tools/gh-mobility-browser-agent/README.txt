GH Mobility Local Browser Discovery Agent
===========================================

Destination folder:
tools/gh-mobility-browser-agent/

Files:
- agent.js
- package.json
- config.json

What this first version does:
- Opens Chrome/Edge as a normal external browser window.
- Uses a temporary browser profile.
- The account owner enters credentials directly on the provider website.
- GH Mobility does NOT receive or store the username/password.
- Observes structured JSON responses in read-only mode.
- Detects trip/task-like objects using field patterns rather than CareCar-specific selectors.
- Writes discoveries to discovery-output/discovered-trips.json.
- Does NOT Claim/Accept anything.
- Deletes the temporary browser profile when the agent exits.

Windows test:
1. Install Node.js if it is not already installed.
2. Open PowerShell in this folder.
3. Run: npm install
4. Edit config.json:
   - For CareCar testing, set startUrl to the CareCar login/provider URL you normally use.
   - Do not put a username/password in config.json.
5. Run: npm start
6. A separate Chrome/Edge window opens.
7. Log in normally and open Available Tasks.
8. Leave it open for several seconds.
9. Check discovery-output/discovered-trips.json.
10. Press Ctrl+C to stop. The temporary browser session/profile is deleted.

Important:
- This is Discovery Phase 1. It deliberately does not click buttons or submit forms.
- It does not bypass MFA/CAPTCHA.
- It does not guess MTM URLs/selectors/endpoints.
- The next phase is to add a secure local-agent-to-GH bridge after read-only discovery is proven on CareCar.
