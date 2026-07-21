#!/usr/bin/env bash
# ============================================================================
# f1_adversarial.sh — Pentest de guards de app (F1 Ventas) por HTTP.
# Verifica la capa de autorización de los endpoints /api/erp/* (requireAccess:
# 401 sin sesión, 403 por rol/módulo, aislamiento entre tenants). Complementa a
# f1_acceptance.sh (que prueba la RLS a nivel BD).
#
# Uso:  APLIKA_BASE=http://localhost:3001 bash scripts/qa/f1_adversarial.sh
#       (default http://localhost:3000). Requiere server en modo real + seed.
# ============================================================================
set -u
BASE="${APLIKA_BASE:-http://localhost:3000}"
TMP="${TMPDIR:-/tmp}/f1adv"; mkdir -p "$TMP"
PASS=0; FAIL=0
ok(){ printf 'PASS  %s\n' "$1"; PASS=$((PASS+1)); }
no(){ printf 'FAIL  %s  :: %s\n' "$1" "$2"; FAIL=$((FAIL+1)); }

# login <email> <jarfile> -> aborta si no autentica (evita falsos 401 aguas abajo)
login(){
  local st
  st=$(curl -s -o /dev/null -w '%{http_code}' -c "$2" -b "$2" -X POST -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"Aplika2026!\"}" "$BASE/api/auth/login")
  if [ "$st" != 200 ]; then printf 'ABORT  login %s → HTTP %s (¿rate-limit de GoTrue? reintenta en ~1 min)\n' "$1" "$st"; exit 2; fi
}
# code METHOD PATH JAR [JSON] -> echo HTTP status
code(){
  local m="$1" p="$2" jar="$3" body="${4:-}"
  local a=(-s -o "$TMP/b" -w '%{http_code}' -b "$jar" -c "$jar" -X "$m" "$BASE$p")
  [ -n "$body" ] && a+=(-H 'Content-Type: application/json' -d "$body")
  curl "${a[@]}"
}

OPER="$TMP/oper"; VIEW="$TMP/view"; VITA="$TMP/vita"; ANON="$TMP/anon"
rm -f "$OPER" "$VIEW" "$VITA" "$ANON"
login operador@refanorte.mx "$OPER"; sleep 2
login consulta@refanorte.mx "$VIEW"; sleep 2
login ana@vitalis.mx "$VITA"; sleep 2

echo "== f1_adversarial ($BASE) =="

# 1) Sin sesión -> 401 (endpoint F1)
c=$(code GET /api/erp/quotes "$ANON"); [ "$c" = 401 ] && ok "anónimo /quotes → 401" || no "anónimo" "HTTP=$c"

# 2) Viewer NO crea cotización -> 403
c=$(code POST /api/erp/quotes "$VIEW" '{"lines":[]}'); [ "$c" = 403 ] && ok "viewer POST quote → 403" || no "viewer crear" "HTTP=$c"

# 3) Viewer SÍ lista cotizaciones -> 200
c=$(code GET /api/erp/quotes "$VIEW"); [ "$c" = 200 ] && ok "viewer GET quotes → 200 (ver)" || no "viewer ver" "HTTP=$c"

# 4) Operador NO cancela (falta 'cancelar'): crea remisión y trata de cancelar -> 403
rid=$(code POST /api/erp/sales-notes "$OPER" '{"lines":[{"name":"x","qty":1,"unitPrice":10}]}' >/dev/null; python3 -c "import json;print(json.load(open('$TMP/b')).get('id',''))" 2>/dev/null)
c=$(code POST "/api/erp/sales-notes/$rid/cancelar" "$OPER" '{"motivo":"qa"}')
[ "$c" = 403 ] && ok "operador cancelar remisión → 403 (sin permiso)" || no "operador cancelar" "HTTP=$c rid=$rid"

# 5) Vitalis (servicios_agenda, sin módulo cotizaciones) -> 403
c=$(code POST /api/erp/quotes "$VITA" '{"lines":[{"name":"x","qty":1,"unitPrice":10}]}'); [ "$c" = 403 ] && ok "vitalis POST quote → 403 (sin módulo)" || no "vitalis cotizaciones" "HTTP=$c"
c=$(code GET /api/erp/sales-notes "$VITA"); [ "$c" = 403 ] && ok "vitalis GET sales-notes → 403 (sin módulo)" || no "vitalis remisiones" "HTTP=$c"

# 6) Aislamiento entre tenants: vitalis no ve una cotización de refanorte -> 404
qid=$(code POST /api/erp/quotes "$OPER" '{"lines":[{"name":"x","qty":1,"unitPrice":10}]}' >/dev/null; python3 -c "import json;print(json.load(open('$TMP/b')).get('id',''))" 2>/dev/null)
c=$(code GET "/api/erp/quotes/$qid" "$VITA")
{ [ "$c" = 404 ] || [ "$c" = 403 ]; } && ok "vitalis no ve cotización de refanorte → $c" || no "aislamiento" "HTTP=$c qid=$qid"

echo "----------------------------------------------------------------------"
echo "RESUMEN f1_adversarial:  PASS=$PASS  FAIL=$FAIL"
[ "$FAIL" -eq 0 ] && echo "GUARDS EN VERDE" || echo "HAY GUARDS EN FALLO"