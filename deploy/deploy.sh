#!/usr/bin/env bash
# Run on the VPS as root: pulls, installs, tests, builds and restarts.
set -euo pipefail
cd /opt/keradrive/app
sudo -u keradrive git pull --ff-only
sudo -u keradrive npm ci --no-audit --no-fund
sudo -u keradrive npm test
sudo -u keradrive npm run build
systemctl restart keradrive
sleep 2
curl -fsS http://127.0.0.1:4000/api/health && echo " deployed"
