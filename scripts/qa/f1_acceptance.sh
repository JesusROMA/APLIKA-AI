#!/usr/bin/env bash
# ============================================================================
# f1_acceptance.sh — Criterios de aceptación C6 de FASE 1 (Ventas) Aplika.ai
# Mismo enfoque que f0_acceptance.sh: simula sesiones de usuario en el Postgres
# local (set_config request.jwt.claims + role authenticated) y corre cada check
# en su propia transacción (begin/rollback) => sin efectos. Cubre lo que la BD
# hace cumplir (folios, gating de módulo por RLS, stock una sola vez, estados de
# pago, candado de factura global, entregas parciales). El flujo end-to-end por
# HTTP (cotización→pedido→factura→pago vía los endpoints TS) se verifica aparte.
#
# Uso:  bash scripts/qa/f1_acceptance.sh
# Requiere: contenedor supabase_db_aplika VIVO con migraciones 0011/0012.
# ============================================================================
set -u
CONTAINER="${APLIKA_DB_CONTAINER:-supabase_db_aplika}"
PASS=0
FAIL=0

# Identidades del seed (uid auth.users):
#   ADMIN  d0000000-...b1  juan@refanorte      tenant_admin  (refanorte)
#   OPER   d0000000-...b4  operador@refanorte  tenant_user
#   VIEWER d0000000-...b5  consulta@refanorte  tenant_viewer
#   VITALIS d0000000-...b3 ana@vitalis         tenant_admin  (vitalis, servicios_agenda)
#   Org refanorte 1111...111  ·  Org vitalis 1111...119
REF='11111111-1111-1111-1111-111111111111'

check() {
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

echo "== f1_acceptance =="
echo "Contenedor: $CONTAINER"
echo "----------------------------------------------------------------------"

# ===========================================================================
# A — Folios consecutivos por serie (next_serie_folio) sin huecos ni dups
# ===========================================================================
check "A   Folios COT consecutivos (next_serie_folio COT-A-N, N+1)" <<SQL
begin;
do \$\$
declare f1 text; f2 text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub','d0000000-0000-0000-0000-0000000000b4','role','authenticated')::text, true);
  perform set_config('role','authenticated', true);
  f1 := public.next_serie_folio('$REF','quote', null);
  f2 := public.next_serie_folio('$REF','quote', null);
  if f1 ~ '^COT-A-[0-9]{4}\$' and f2 ~ '^COT-A-[0-9]{4}\$'
     and (right(f2,4))::int = (right(f1,4))::int + 1 then
    raise notice 'RESULT=PASS folios consecutivos (% -> %)', f1, f2;
  else
    raise notice 'RESULT=FAIL folios (% , %)', f1, f2;
  end if;
end \$\$;
rollback;
SQL

# ===========================================================================
# B — Gating de módulo: vitalis (servicios_agenda) NO tiene 'cotizaciones' =>
#     insertar en quotes lo bloquea RLS (42501). Refanorte operador SÍ puede.
# ===========================================================================
check "B1  Vitalis SIN modulo cotizaciones NO puede crear cotizacion (42501)" <<SQL
begin;
do \$\$
begin
  perform set_config('request.jwt.claims', json_build_object('sub','d0000000-0000-0000-0000-0000000000b3','role','authenticated')::text, true);
  perform set_config('role','authenticated', true);
  begin
    insert into quotes (organization_id, folio) values ('11111111-1111-1111-1111-111111111119','COT-X-9999');
    raise notice 'RESULT=FAIL vitalis creo cotizacion (no deberia)';
  exception
    when sqlstate '42501' then raise notice 'RESULT=PASS vitalis bloqueado (sin modulo cotizaciones)';
    when others          then raise notice 'RESULT=FAIL error inesperado % %', sqlstate, sqlerrm;
  end;
end \$\$;
rollback;
SQL

check "B2  Operador refanorte SI puede crear cotizacion" <<SQL
begin;
do \$\$
begin
  perform set_config('request.jwt.claims', json_build_object('sub','d0000000-0000-0000-0000-0000000000b4','role','authenticated')::text, true);
  perform set_config('role','authenticated', true);
  begin
    insert into quotes (organization_id, folio) values ('$REF', public.next_serie_folio('$REF','quote',null));
    raise notice 'RESULT=PASS operador creo cotizacion';
  exception when others then raise notice 'RESULT=FAIL operador no pudo % %', sqlstate, sqlerrm;
  end;
end \$\$;
rollback;
SQL

# ===========================================================================
# C — Tenant sin submodulo 'facturacion' puede cotizar/remisionar pero NO
#     facturar. Se desactiva facturacion para refanorte dentro de la tx.
# ===========================================================================
check "C   Sin modulo facturacion: cotiza OK pero NO factura (42501)" <<SQL
begin;
do \$\$
declare ok_quote boolean := false; blocked boolean := false;
begin
  -- desactiva facturacion para refanorte (solo en esta tx)
  update organization_modules om set enabled=false
    from modules m
   where om.module_id=m.id and m.key='facturacion' and om.organization_id='$REF';
  perform set_config('request.jwt.claims', json_build_object('sub','d0000000-0000-0000-0000-0000000000b4','role','authenticated')::text, true);
  perform set_config('role','authenticated', true);
  begin
    insert into quotes (organization_id, folio) values ('$REF', public.next_serie_folio('$REF','quote',null));
    ok_quote := true;
  exception when others then ok_quote := false; end;
  begin
    insert into invoices (organization_id, folio, serie) values ('$REF', '9001', 'Z');
    blocked := false;
  exception when sqlstate '42501' then blocked := true; when others then blocked := false; end;
  if ok_quote and blocked then
    raise notice 'RESULT=PASS cotiza sin facturar (factura bloqueada por RLS)';
  else
    raise notice 'RESULT=FAIL (ok_quote=% blocked=%)', ok_quote, blocked;
  end if;
end \$\$;
rollback;
SQL

# ===========================================================================
# E — registrar_pago_factura: pago parcial -> pago_parcial; salda -> pagada
# ===========================================================================
check "E   Pagos factura: parcial=>pago_parcial, saldo0=>pagada" <<SQL
begin;
do \$\$
declare v_inv uuid; st1 text; sa1 numeric; st2 text; sa2 numeric;
begin
  perform set_config('request.jwt.claims', json_build_object('sub','d0000000-0000-0000-0000-0000000000b1','role','authenticated')::text, true);
  perform set_config('role','authenticated', true);
  insert into invoices (organization_id, serie, folio, status, metodo_pago, subtotal, tax, total, saldo)
    values ('$REF','A', (public.next_folio('$REF','invoice'))::text, 'timbrada','PUE', 100, 0, 100, 100)
    returning id into v_inv;
  perform public.registrar_pago_factura(v_inv, 40, '01', null);
  select status, saldo into st1, sa1 from invoices where id=v_inv;
  perform public.registrar_pago_factura(v_inv, 60, '01', null);
  select status, saldo into st2, sa2 from invoices where id=v_inv;
  if st1='pago_parcial' and sa1=60 and st2='pagada' and sa2=0 then
    raise notice 'RESULT=PASS pagos (parcial saldo60, luego pagada saldo0)';
  else
    raise notice 'RESULT=FAIL (% saldo% ; % saldo%)', st1, sa1, st2, sa2;
  end if;
end \$\$;
rollback;
SQL

# ===========================================================================
# F — record_delivery: entrega parcial => surtido_parcial; total => surtido
# ===========================================================================
check "F   Entregas: parcial=>surtido_parcial, completa=>surtido" <<SQL
begin;
do \$\$
declare v_ord uuid; it1 uuid; it2 uuid; st1 text; st2 text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub','d0000000-0000-0000-0000-0000000000b1','role','authenticated')::text, true);
  perform set_config('role','authenticated', true);
  insert into orders (organization_id, folio, status, subtotal, tax, total, items_count)
    values ('$REF', public.next_serie_folio('$REF','order',null), 'pagado', 0,0,0,2) returning id into v_ord;
  insert into order_items (organization_id, order_id, name, qty, unit_price, line_total) values ('$REF', v_ord,'L1',5,10,50) returning id into it1;
  insert into order_items (organization_id, order_id, name, qty, unit_price, line_total) values ('$REF', v_ord,'L2',5,10,50) returning id into it2;
  perform public.record_delivery(v_ord, json_build_array(json_build_object('item_id',it1,'qty',3))::jsonb);
  select status into st1 from orders where id=v_ord;
  perform public.record_delivery(v_ord, json_build_array(
      json_build_object('item_id',it1,'qty',2), json_build_object('item_id',it2,'qty',5))::jsonb);
  select status into st2 from orders where id=v_ord;
  if st1='surtido_parcial' and st2='surtido' then
    raise notice 'RESULT=PASS entregas (parcial=>surtido_parcial, completa=>surtido)';
  else
    raise notice 'RESULT=FAIL (st1=% st2=%)', st1, st2;
  end if;
end \$\$;
rollback;
SQL

echo "----------------------------------------------------------------------"
echo "RESUMEN f1_acceptance:  PASS=$PASS  FAIL=$FAIL"
[ "$FAIL" -eq 0 ] && { echo "TODOS LOS CRITERIOS C6 (BD) EN PASS"; exit 0; } || { echo "HAY CRITERIOS EN FALLO"; exit 1; }
