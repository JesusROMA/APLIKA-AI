# ============================================================================
# Aplika — auto-pull continuo (Windows). Corre en una terminal aparte:
#   npm run sync
# Cada 60 s baja los commits nuevos del equipo con rebase + autostash
# (tus cambios sin commitear se preservan). Ctrl+C para detener.
# ============================================================================
Write-Host "[auto-sync] vigilando origin/main cada 60 s... (Ctrl+C para salir)"
while ($true) {
  git fetch origin 2>$null | Out-Null
  $local = git rev-parse HEAD
  $remote = git rev-parse origin/main
  if ($local -ne $remote) {
    $behind = git rev-list --count "HEAD..origin/main"
    if ([int]$behind -gt 0) {
      Write-Host "[auto-sync] $behind commit(s) nuevos del equipo; integrando..." -ForegroundColor Cyan
      git pull --rebase --autostash origin main
    }
  }
  Start-Sleep -Seconds 60
}
