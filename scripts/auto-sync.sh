#!/bin/sh
# Aplika — auto-pull continuo (macOS/Linux/Git Bash): ./scripts/auto-sync.sh
echo "[auto-sync] vigilando origin/main cada 60 s... (Ctrl+C para salir)"
while true; do
  git fetch origin >/dev/null 2>&1
  behind=$(git rev-list --count "HEAD..origin/main" 2>/dev/null || echo 0)
  if [ "$behind" -gt 0 ]; then
    echo "[auto-sync] $behind commit(s) nuevos del equipo; integrando..."
    git pull --rebase --autostash origin main
  fi
  sleep 60
done
