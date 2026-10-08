#!/usr/bin/env bash
set -euo pipefail
# Run as the existing Oracle account. Keeps browser-profiles unchanged.
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_USER="$(id -un)"
if [[ "$APP_USER" == root ]]; then
  echo 'Run this installer as your normal Oracle user (opc), not root.' >&2
  exit 1
fi
NODE_BIN="$(command -v node)"
command -v npm >/dev/null
command -v python3 >/dev/null
command -v curl >/dev/null
X_BIN="$(command -v Xvfb || true)"
if [[ -z "$X_BIN" ]]; then
  if command -v dnf >/dev/null; then sudo dnf install -y xorg-x11-server-Xvfb
  elif command -v apt-get >/dev/null; then sudo apt-get update; sudo apt-get install -y xvfb
  else echo 'Xvfb is missing. Install it first.' >&2; exit 1
  fi
  X_BIN="$(command -v Xvfb)"
fi
# Prevent unsafe systemd quoting for unexpected install paths.
if [[ "$APP_DIR" == *[[:space:]\"\%]* || "$NODE_BIN" == *[[:space:]\"\%]* ]]; then
  echo 'Install in a path without whitespace, quotes, or percent signs.' >&2
  exit 1
fi
cd "$APP_DIR"
if ! python3 - <<'PYBROWSER'
from pathlib import Path
import os,sys
paths=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser']
sys.exit(0 if any(Path(p).is_file() and os.access(p,os.X_OK) for p in paths) else 1)
PYBROWSER
then echo 'Chrome/Chromium is missing. Install the supported browser before continuing.' >&2; exit 1; fi
node --check agent.js
node --check cloud-agent-runner.js
npm ci --omit=dev
ENV_FILE="$APP_DIR/cloud-agent.env"
if [[ ! -s "$ENV_FILE" ]]; then
  printf 'Paste the existing GH_BROWSER_AGENT_KEY from Render (input hidden): '
  IFS= read -r -s GH_SETUP_AGENT_KEY
  printf '\n'
  if [[ ! "$GH_SETUP_AGENT_KEY" =~ ^[A-Za-z0-9_.:/+=@-]+$ || ${#GH_SETUP_AGENT_KEY} -lt 16 ]]; then
    echo 'Invalid/empty key. Use the same existing key as Render.' >&2
    exit 1
  fi
  umask 077
  printf 'GH_BASE_URL=https://ghmobility.com\nGH_BROWSER_AGENT_KEY=%s\nGH_AGENT_NODE_ID=oracle-primary\nGH_LOCAL_AGENT_URL=http://127.0.0.1:18733\n' "$GH_SETUP_AGENT_KEY" > "$ENV_FILE"
  unset GH_SETUP_AGENT_KEY
fi
chmod 600 "$ENV_FILE"
if ! python3 - "$ENV_FILE" <<'PY'
import sys
from pathlib import Path
values={}
for line in Path(sys.argv[1]).read_text().splitlines():
    if '=' in line and not line.lstrip().startswith('#'):
        k,v=line.split('=',1);values[k.strip()]=v.strip().strip('"').strip("'")
if not values.get('GH_BROWSER_AGENT_KEY'):
    sys.exit(1)
PY
then echo 'cloud-agent.env needs the existing Render GH_BROWSER_AGENT_KEY.' >&2; exit 1; fi
sudo -v
sudo systemctl stop gh-cloud-runner.service gh-browser-agent.service gh-browser-display.service 2>/dev/null || true
# Stop only old copies launched from this app directory, including relative node agent.js.
python3 - "$APP_DIR" <<'PY'
import os,signal,sys,pathlib
app=os.path.realpath(sys.argv[1])
for p in pathlib.Path('/proc').iterdir():
    if not p.name.isdigit(): continue
    try:
        args=(p/'cmdline').read_bytes().split(b'\0')
        if len(args)<2 or 'node' not in os.path.basename(os.fsdecode(args[0])): continue
        if os.path.realpath(p/'cwd')!=app: continue
        if os.path.basename(os.fsdecode(args[1])) in ('agent.js','cloud-agent-runner.js'):
            os.kill(int(p.name),signal.SIGTERM)
    except (OSError,ProcessLookupError): pass
PY
sleep 3
sudo tee /etc/systemd/system/gh-browser-display.service >/dev/null <<EOF
[Unit]
Description=GH Mobility browser display
After=network.target
[Service]
Type=simple
User=$APP_USER
ExecStart=$X_BIN :98 -screen 0 1440x900x24 -nolisten tcp -ac
Restart=always
RestartSec=3
[Install]
WantedBy=multi-user.target
EOF
sudo tee /etc/systemd/system/gh-browser-agent.service >/dev/null <<EOF
[Unit]
Description=GH Mobility persistent broker browser agent
Wants=gh-browser-display.service network-online.target
After=gh-browser-display.service network-online.target
[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$APP_DIR
Environment=DISPLAY=:98
ExecStartPre=/bin/sleep 2
ExecStart=$NODE_BIN $APP_DIR/agent.js
Restart=always
RestartSec=5
TimeoutStopSec=30
KillMode=control-group
[Install]
WantedBy=multi-user.target
EOF
sudo tee /etc/systemd/system/gh-cloud-runner.service >/dev/null <<EOF
[Unit]
Description=GH Mobility Oracle outbound cloud runner
Wants=gh-browser-agent.service network-online.target
After=gh-browser-agent.service network-online.target
[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=$ENV_FILE
ExecStart=$NODE_BIN $APP_DIR/cloud-agent-runner.js
Restart=always
RestartSec=5
TimeoutStopSec=30
[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now gh-browser-display.service gh-browser-agent.service gh-cloud-runner.service
printf '\nChecking Oracle agent...\n'
for attempt in {1..15}; do
  if curl --fail --silent --max-time 2 http://127.0.0.1:18733/health > /tmp/gh-oracle-health-"$APP_USER".json; then break; fi
  sleep 1
done
python3 - /tmp/gh-oracle-health-"$APP_USER".json <<'PY'
import json,sys
try:
    h=json.load(open(sys.argv[1]))
except Exception:
    print('FAIL: local browser agent is not responding.');sys.exit(1)
if h.get('success') is not True:
    print('FAIL: local browser agent health check failed.');sys.exit(1)
print('Local agent reachable; sessions:',len(h.get('sessions',[])))
PY
for unit in gh-browser-display gh-browser-agent gh-cloud-runner; do
  sudo systemctl is-active "$unit.service"
done
# Verify outbound heartbeat evidence, without printing the configured secret.
for attempt in {1..20}; do
  if sudo journalctl -u gh-cloud-runner.service --since '1 minute ago' --no-pager -o cat | grep '\[cloud-runner\] heartbeat ok' >/dev/null; then
    printf '\nOracle services are active and a GH heartbeat succeeded. Open Connect / Login in GH.\n'
    exit 0
  fi
  sleep 1
done
printf '\nServices started, but GH heartbeat is not verified. Check the runner log below.\n' >&2
sudo journalctl -u gh-cloud-runner.service -n 15 --no-pager -o cat
exit 1
