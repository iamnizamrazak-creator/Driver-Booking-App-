#!/usr/bin/env bash
# Run on the VPS from /opt/keradrive after `git pull`.
set -euo pipefail
npm ci
npm test
npm run build
sudo systemctl restart keradrive
sleep 2
curl -fsS http://127.0.0.1:4000/api/health && echo " deployed"
