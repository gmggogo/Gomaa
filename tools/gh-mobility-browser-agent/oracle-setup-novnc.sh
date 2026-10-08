#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/home/opc/gh-mobility-browser-agent"
NOVNC_DIR="/home/opc/noVNC"
WEBSOCKIFY_DIR="$NOVNC_DIR/utils/websockify"
DISPLAY_NUM=":99"
VNC_PORT="5900"
NOVNC_PORT="6080"

echo "== GH Mobility Oracle Browser Console Setup =="

if command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y git python3-pip xorg-x11-server-Xvfb tigervnc-server-minimal || {
    sudo dnf install -y git python3-pip xorg-x11-server-Xvfb tigervnc-server || true
  }
elif command -v yum >/dev/null 2>&1; then
  sudo yum install -y git python3-pip xorg-x11-server-Xvfb tigervnc-server-minimal || {
    sudo yum install -y git python3-pip xorg-x11-server-Xvfb tigervnc-server || true
  }
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update
  sudo apt-get install -y git python3-pip xvfb tigervnc-tools
else
  echo "Unsupported package manager."
  exit 1
fi

if [ ! -d "$NOVNC_DIR/.git" ]; then
  rm -rf "$NOVNC_DIR"
  git clone --depth 1 https://github.com/novnc/noVNC.git "$NOVNC_DIR"
fi

if [ ! -d "$WEBSOCKIFY_DIR/.git" ]; then
  rm -rf "$WEBSOCKIFY_DIR"
  git clone --depth 1 https://github.com/novnc/websockify.git "$WEBSOCKIFY_DIR"
fi

cat > "$APP_DIR/start-oracle-browser-stack.sh" <<'EOS'
#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/home/opc/gh-mobility-browser-agent"
NOVNC_DIR="/home/opc/noVNC"
DISPLAY_NUM=":99"
VNC_PORT="5900"
NOVNC_PORT="6080"

cd "$APP_DIR"

# Stop only GH browser display/console processes. Do not touch unrelated services.
pkill -f '[X]vfb :99' || true
pkill -f '[x]0vncserver.*5900' || true
pkill -f '[n]ovnc_proxy.*6080' || true
pkill -f '[n]ode /home/opc/gh-mobility-browser-agent/agent.js' || true

sleep 1

# Fixed virtual display so Chrome and the remote console share the SAME screen.
nohup Xvfb "$DISPLAY_NUM" -screen 0 1440x900x24 -ac \
  > "$APP_DIR/xvfb.log" 2>&1 &
sleep 1

export DISPLAY="$DISPLAY_NUM"

# Start GH browser agent on the fixed display.
nohup node "$APP_DIR/agent.js" \
  > "$APP_DIR/agent.log" 2>&1 &

sleep 2

# Share ONLY localhost VNC. It is not exposed publicly.
if command -v x0vncserver >/dev/null 2>&1; then
  nohup x0vncserver \
    -display "$DISPLAY_NUM" \
    -rfbport "$VNC_PORT" \
    -localhost \
    -SecurityTypes None \
    > "$APP_DIR/vnc.log" 2>&1 &
else
  echo "x0vncserver was not found. Install TigerVNC server tools."
  exit 1
fi

sleep 1

# noVNC also listens on localhost only; Windows reaches it through SSH tunnel.
nohup "$NOVNC_DIR/utils/novnc_proxy" \
  --listen "127.0.0.1:$NOVNC_PORT" \
  --vnc "127.0.0.1:$VNC_PORT" \
  > "$APP_DIR/novnc.log" 2>&1 &

sleep 2

echo
echo "=== Browser Console Status ==="
echo "DISPLAY=$DISPLAY"
echo "VNC localhost:$VNC_PORT"
echo "noVNC localhost:$NOVNC_PORT"
echo
curl -s "http://127.0.0.1:18733/health" || true
echo
echo
echo "Open the Windows SSH tunnel, then use:"
echo "http://127.0.0.1:6080/vnc.html?autoconnect=1&resize=scale&view_only=0"
EOS

chmod +x "$APP_DIR/start-oracle-browser-stack.sh"

echo
echo "Setup complete."
echo "Starting browser stack now..."
"$APP_DIR/start-oracle-browser-stack.sh"
