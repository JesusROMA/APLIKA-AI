#!/usr/bin/env bash
# ============================================================================
# f0_adversarial.sh — Pentest interno de FASE 0 (Aplika.ai ERP)
# Intentos de ROMPER las garantías de F0 que DEBEN fallar (o resistir).
#   1) tenant_user insertando filas con organization_id de OTRO tenant (WITH CHECK)
#   2) Folios concurrentes: next_folio(org,'order') en paralelo -> sin huecos/dups
#   3) Doble aplicación de stock: transition a 'pagado' 2x no decrementa 2x
#   4) Escritura directa a audit_log por tenant_user (sin policy de insert)
#
# Uso:  bash scripts/qa/f0_adversarial.sh
# Requisitos:  contenedor supabase_db_aplika VIVO con 0010 + seed extendido.
# ============================================================================
set -u
CONTAINER="${APLIKA_DB_CONTAINER:-supabase_db_aplika}"
SCRATCH="$(mktemp -d "${TMPDIR:-/tmp}/f0_adv.XXXXXX")"
trap 'rm -rf "$SCRATCH"' EXIT
PASS=0
FAIL=0
REF='11111111-1111-1111-1111-111111111111'   # refanorte
VIT='11111111-1111-1111-1111-111111111119'   # vitalis
OPER='d0000000-0000-0000-0000-0000000000b4'  # operador@refanorte (tenant_user)

psqlq() { docker exec -i "$CONTAINER" psql -U postgres -d postgres -q -X -t -A "$@"; }

check() {  # check <nombre>   (SQL por stdin; NOTICE 'RESULT=PASS ...')
  local name="$1" out
  out=$(docker exec -i "$CONTAINER" psql -U postgres -d postgres -q -X -v ON_ERROR_STOP=0 2>&1)
  if printf '%s' "$out" | grep -q 'RESULT=PASS'; then
    printf 'PASS  %s\n' "$name"; PASS=$((PASS+1))
  else
    printf 'FAIL  %s\n' "$name"
    printf '%s\n' "$out" | grep -Ei 'RESULT=|ERROR|NOTICE' | sed 's/^/        | /'
    FAIL=$((FAIL+1))
  fi
}

echo "== f0_adversarial (pentest interno) =="
echo "Contenedor: $CONTAINER"
echo "----------------------------------------------------------------------"

# ===========================================================================
# 1) tenant_user intentando escribir con organization_id de OTRO tenant.
#    El WITH CHECK del INSERT (org == current_org_id()) debe bloquear (42501).
# ===========================================================================
check "1  tenant_user NO puede insertar con org de otro tenant (WITH CHECK -> 42501)" <<'SQL'
begin;
do $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub','d0000000-0000-0000-0000-0000000000b4','role','authenticated')::text, true);
  perform set_config('role','authenticated', true);
  begin
    -- operador de refanorte intenta crear un cliente EN vitalis
    insert into customers (organization_id, name)
      values ('11111111-1111-1111-1111-111111111119','Cliente Cross-Tenant');
    raise notice 'RESULT=FAIL escritura cross-tenant permitida (HUECO DE SEGURIDAD)';
  exception
    when sqlstate '42501' then raise notice 'RESULT=PASS WITH CHECK bloqueó escritura cross-tenant (42501)';
    when others          then raise notice 'RESULT=FAIL error inesperado % %', sqlstate, sqlerrm;
  end;
end $$;
rollback;
SQL

# ===========================================================================
# 2) Folios concurrentes: N llamadas paralelas a next_folio(org,'order').
#    Cada docker exec = conexión/backend independiente => concurrencia real.
#    Se exige: N valores, N distintos (sin duplicados), rango contiguo (sin
#    huecos) empezando en value_antes+1. Al final se restaura el contador.
# ===========================================================================
N=25
before=$(psqlq -c "select value from org_counters where organization_id='$REF' and entity='order';" | tr -d '[:space:]')
if [ -z "$before" ]; then before=0; fi
for i in $(seq 1 "$N"); do
  ( psqlq -c "select next_folio('$REF','order');" | tr -d '[:space:]' > "$SCRATCH/f_$i.txt" ) &
done
wait
for f in "$SCRATCH"/f_*.txt; do printf '%s\n' "$(cat "$f")"; done | grep -E '^[0-9]+$' | sort -n > "$SCRATCH/all.txt"
total=$(wc -l < "$SCRATCH/all.txt" | tr -d '[:space:]')
uniq=$(sort -n "$SCRATCH/all.txt" | uniq | wc -l | tr -d '[:space:]')
fmin=$(head -1 "$SCRATCH/all.txt"); fmax=$(tail -1 "$SCRATCH/all.txt")
expected_span=$(( fmax - fmin + 1 ))
# restaura el contador para que el script sea re-ejecutable / no ensucie el seed
psqlq -c "update org_counters set value=$before where organization_id='$REF' and entity='order';" >/dev/null 2>&1
if [ "$total" -eq "$N" ] && [ "$uniq" -eq "$N" ] && [ "$expected_span" -eq "$N" ] && [ "$fmin" -eq "$((before+1))" ]; then
  printf 'PASS  2  Folios concurrentes: %s llamadas, %s únicos, rango %s..%s sin huecos ni duplicados\n' "$total" "$uniq" "$fmin" "$fmax"
  PASS=$((PASS+1))
else
  printf 'FAIL  2  Folios concurrentes: total=%s uniq=%s rango=%s..%s span=%s esperado_inicio=%s\n' \
    "$total" "$uniq" "$fmin" "$fmax" "$expected_span" "$((before+1))"
  FAIL=$((FAIL+1))
fi

# ===========================================================================
# 3) Doble aplicación de stock: crear pedido con item ligado a variante,
#    transicionar a 'pagado' DOS veces; el guard stock_applied debe evitar el
#    segundo decremento. Todo en begin/rollback (sin efectos permanentes).
# ===========================================================================
check "3  Doble transición a 'pagado' NO decrementa stock dos veces (stock_applied)" <<'SQL'
begin;
do $$
declare
  org   uuid := '11111111-1111-1111-1111-111111111111';
  v_var uuid; v_wh uuid; v_oid uuid;
  s0 int; s1 int; s2 int; qty int := 3;
begin
  -- Contexto: admin de refanorte (tiene ordenes/editar + inventario/ver). El
  -- guard anti-doble-decremento vive en apply_order_stock (stock_applied), no
  -- en la RLS; aquí probamos que resiste dos transiciones a 'pagado'.
  perform set_config('request.jwt.claims', json_build_object('sub','d0000000-0000-0000-0000-0000000000b1','role','authenticated')::text, true);
  perform set_config('role','authenticated', true);
  select id into v_var from product_variants where organization_id=org and sku='FIL-FX90';
  select warehouse_id, stock into v_wh, s0
    from inventory where product_variant_id=v_var order by stock desc limit 1;
  if v_wh is null then raise notice 'RESULT=FAIL sin inventario para FIL-FX90'; return; end if;

  insert into orders (organization_id, folio, warehouse_id, status)
    values (org, 'QA-ADV-'||floor(random()*1e6)::text, v_wh, 'confirmado')
    returning id into v_oid;
  insert into order_items (organization_id, order_id, product_variant_id, sku, name, qty, unit_price, line_total)
    values (org, v_oid, v_var, 'FIL-FX90','Filtro de aceite FX-90', qty, 189, qty*189);

  perform transition_order(v_oid, 'pagado');   -- 1a vez: aplica stock
  select stock into s1 from inventory where product_variant_id=v_var and warehouse_id=v_wh;
  perform transition_order(v_oid, 'pagado');   -- 2a vez: NO debe re-decrementar
  select stock into s2 from inventory where product_variant_id=v_var and warehouse_id=v_wh;

  if s1 = s0 - qty and s2 = s1 then
    raise notice 'RESULT=PASS stock decrementó una sola vez (%->%->%; qty=%)', s0, s1, s2, qty;
  else
    raise notice 'RESULT=FAIL doble decremento (%->%->%; qty=%)', s0, s1, s2, qty;
  end if;
end $$;
rollback;
SQL

# ===========================================================================
# 4) Escritura directa a audit_log por tenant_user: no existe policy de INSERT
#    => RLS lo niega (42501). Solo app.log_audit (SECURITY DEFINER) escribe.
# ===========================================================================
check "4  tenant_user NO puede escribir directo en audit_log (RLS niega -> 42501)" <<'SQL'
begin;
do $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub','d0000000-0000-0000-0000-0000000000b4','role','authenticated')::text, true);
  perform set_config('role','authenticated', true);
  begin
    insert into audit_log (organization_id, entity_type, entity_id, action, detail)
      values ('11111111-1111-1111-1111-111111111111','order','FALSO','crear','{"forjado":true}'::jsonb);
    raise notice 'RESULT=FAIL tenant_user escribió en audit_log (HUECO DE SEGURIDAD)';
  exception
    when sqlstate '42501' then raise notice 'RESULT=PASS audit_log rechazó escritura directa (42501)';
    when others          then raise notice 'RESULT=FAIL error inesperado % %', sqlstate, sqlerrm;
  end;
end $$;
rollback;
SQL

echo "----------------------------------------------------------------------"
echo "RESUMEN f0_adversarial:  PASS=$PASS  FAIL=$FAIL"
[ "$FAIL" -eq 0 ] && { echo "TODOS LOS INTENTOS DE ROMPER FUERON CONTENIDOS"; exit 0; } || { echo "HAY VECTORES SIN CONTENER (revisar)"; exit 1; }
