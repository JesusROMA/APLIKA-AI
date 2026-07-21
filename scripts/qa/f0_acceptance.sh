#!/usr/bin/env bash
# ============================================================================
# f0_acceptance.sh — Criterios de aceptación C6 de FASE 0 (Aplika.ai ERP)
# Corre los criterios de forma AUTOMATIZADA contra el Postgres local de
# Supabase (contenedor supabase_db_aplika) simulando sesiones de usuario con:
#   set_config('request.jwt.claims', json_build_object('sub',<uid>,'role',...))
#   set_config('role','authenticated', true)   -- baja de superusuario para RLS
# Cada check corre en su propia transacción (begin/rollback) => sin efectos.
# Reporta PASS/FAIL por criterio y sale con código != 0 si algo FALLA.
#
# Uso:  bash scripts/qa/f0_acceptance.sh
# Requisitos:  contenedor supabase_db_aplika VIVO con la migración 0010 y el
#              seed extendido (usuarios operador@/consulta@refanorte.mx).
# ============================================================================
set -u
CONTAINER="${APLIKA_DB_CONTAINER:-supabase_db_aplika}"
PASS=0
FAIL=0

# --- Identidades fijas del seed (uid de auth.users) -------------------------
#   SUPER   d0000000-...aa  admin@aplika.ai        super_admin
#   ADMIN   d0000000-...b1  juan@refanorte.mx      tenant_admin  (refanorte)
#   OPER    d0000000-...b4  operador@refanorte.mx  tenant_user   (refanorte)
#   VIEWER  d0000000-...b5  consulta@refanorte.mx  tenant_viewer (refanorte)
#   VITALIS d0000000-...b3  ana@vitalis.mx         tenant_admin  (vitalis)
#   Org refanorte 1111...111   ·   Org vitalis 1111...119

# check <nombre>  (SQL por stdin; debe emitir NOTICE 'RESULT=PASS ...')
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

echo "== f0_acceptance =="
echo "Contenedor: $CONTAINER"
echo "----------------------------------------------------------------------"

# ===========================================================================
# C6.2a — Operador (tenant_user) NO puede cancelar un pedido (42501)
# ===========================================================================
check "A1  Operador NO puede cancelar pedido (transition_order -> 42501)" <<'SQL'
begin;
do $$
declare v_oid uuid;
begin
  perform set_config('request.jwt.claims', json_build_object('sub','d0000000-0000-0000-0000-0000000000b4','role','authenticated')::text, true);
  perform set_config('role','authenticated', true);
  select id into v_oid from orders where organization_id='11111111-1111-1111-1111-111111111111' and folio='PD-1041';
  begin
    perform transition_order(v_oid, 'cancelada');
    raise notice 'RESULT=FAIL operador logró cancelar (no debería)';
  exception
    when sqlstate '42501' then raise notice 'RESULT=PASS operador bloqueado al cancelar (42501)';
    when others          then raise notice 'RESULT=FAIL error inesperado % %', sqlstate, sqlerrm;
  end;
end $$;
rollback;
SQL

# ===========================================================================
# C6.2b — Operador SÍ puede crear cliente
# ===========================================================================
check "A2  Operador SÍ puede crear cliente (insert customers OK)" <<'SQL'
begin;
do $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub','d0000000-0000-0000-0000-0000000000b4','role','authenticated')::text, true);
  perform set_config('role','authenticated', true);
  begin
    insert into customers (organization_id, name, rfc)
      values ('11111111-1111-1111-1111-111111111111','Cliente QA Operador','XAXX010101000');
    raise notice 'RESULT=PASS operador creó cliente';
  exception when others then
    raise notice 'RESULT=FAIL operador no pudo crear cliente % %', sqlstate, sqlerrm;
  end;
end $$;
rollback;
SQL

# ===========================================================================
# C6.2c — Solo-lectura (tenant_viewer) NO puede crear cliente (RLS 42501)
# ===========================================================================
check "B1  Solo-lectura NO puede crear cliente (insert -> 42501)" <<'SQL'
begin;
do $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub','d0000000-0000-0000-0000-0000000000b5','role','authenticated')::text, true);
  perform set_config('role','authenticated', true);
  begin
    insert into customers (organization_id, name)
      values ('11111111-1111-1111-1111-111111111111','Cliente Pirata Viewer');
    raise notice 'RESULT=FAIL viewer logró insertar (no debería)';
  exception
    when sqlstate '42501' then raise notice 'RESULT=PASS viewer bloqueado al insertar (42501)';
    when others          then raise notice 'RESULT=FAIL error inesperado % %', sqlstate, sqlerrm;
  end;
end $$;
rollback;
SQL

# ===========================================================================
# C6.2d — Solo-lectura NO puede transicionar pedidos (guarda editar -> 42501)
# ===========================================================================
check "B2  Solo-lectura NO puede transicionar pedido (-> 42501)" <<'SQL'
begin;
do $$
declare v_oid uuid;
begin
  perform set_config('request.jwt.claims', json_build_object('sub','d0000000-0000-0000-0000-0000000000b5','role','authenticated')::text, true);
  perform set_config('role','authenticated', true);
  -- viewer sí ve el pedido (perm ver), pero no puede transicionarlo
  select id into v_oid from orders where organization_id='11111111-1111-1111-1111-111111111111' and folio='PD-1041';
  begin
    perform transition_order(v_oid, 'surtido');
    raise notice 'RESULT=FAIL viewer logró transicionar (no debería)';
  exception
    when sqlstate '42501' then raise notice 'RESULT=PASS viewer bloqueado al transicionar (42501)';
    when others          then raise notice 'RESULT=FAIL error inesperado % %', sqlstate, sqlerrm;
  end;
end $$;
rollback;
SQL

# ===========================================================================
# C6.3 — RFC inválido rechazado por el constraint (check_violation 23514)
#   Se corre como Operador (que SÍ puede insertar) para golpear el constraint,
#   no la RLS.
# ===========================================================================
check "C   RFC inválido rechazado por constraint (insert rfc='XXX' -> 23514)" <<'SQL'
begin;
do $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub','d0000000-0000-0000-0000-0000000000b4','role','authenticated')::text, true);
  perform set_config('role','authenticated', true);
  begin
    insert into customers (organization_id, name, rfc)
      values ('11111111-1111-1111-1111-111111111111','Cliente RFC Malo','XXX');
    raise notice 'RESULT=FAIL se aceptó RFC inválido (no debería)';
  exception
    when sqlstate '23514' then raise notice 'RESULT=PASS RFC inválido rechazado por constraint (23514)';
    when others          then raise notice 'RESULT=FAIL error inesperado % %', sqlstate, sqlerrm;
  end;
end $$;
rollback;
SQL

# ===========================================================================
# C6.4 — Aislamiento entre tenants (2 sesiones): refanorte<->vitalis 0 filas
# ===========================================================================
check "D   Aislamiento entre tenants (refanorte no ve vitalis y viceversa)" <<'SQL'
begin;
do $$
declare r_cust int; r_appt int; v_cust int; v_appt int;
begin
  -- Sesión refanorte (admin)
  perform set_config('request.jwt.claims', json_build_object('sub','d0000000-0000-0000-0000-0000000000b1','role','authenticated')::text, true);
  perform set_config('role','authenticated', true);
  select count(*) into r_cust from customers;      -- clientes propios de refanorte (>0)
  select count(*) into r_appt from appointments;   -- citas de vitalis => debe ser 0
  -- Sesión vitalis (admin)
  perform set_config('request.jwt.claims', json_build_object('sub','d0000000-0000-0000-0000-0000000000b3','role','authenticated')::text, true);
  select count(*) into v_cust from customers;      -- clientes de refanorte => debe ser 0
  select count(*) into v_appt from appointments;   -- citas propias de vitalis (>0)
  if r_cust > 0 and r_appt = 0 and v_cust = 0 and v_appt > 0 then
    raise notice 'RESULT=PASS aislamiento OK (refanorte: % clientes / % citas=0 ; vitalis: % clientes=0 / % citas)', r_cust, r_appt, v_cust, v_appt;
  else
    raise notice 'RESULT=FAIL aislamiento roto (refanorte %/% ; vitalis %/%)', r_cust, r_appt, v_cust, v_appt;
  end if;
end $$;
rollback;
SQL

# ===========================================================================
# C6.5a — Impersonación: super_admin con header ve la org; sin header, org NULL
# ===========================================================================
check "E1  Impersonación: sin header org=NULL, con header org=refanorte y ve datos" <<'SQL'
begin;
do $$
declare org_no uuid; org_yes uuid; n_cust int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub','d0000000-0000-0000-0000-0000000000aa','role','authenticated')::text, true);
  perform set_config('role','authenticated', true);
  -- sin header
  perform set_config('request.headers', '', true);
  org_no := public.current_org_id();
  -- con header x-aplika-impersonate = refanorte
  perform set_config('request.headers', json_build_object('x-aplika-impersonate','11111111-1111-1111-1111-111111111111')::text, true);
  org_yes := public.current_org_id();
  select count(*) into n_cust from customers;
  if org_no is null and org_yes = '11111111-1111-1111-1111-111111111111'::uuid and n_cust > 0 then
    raise notice 'RESULT=PASS impersonación (sin header org=NULL; con header org=refanorte; ve % clientes)', n_cust;
  else
    raise notice 'RESULT=FAIL impersonación (sin=% con=% clientes=%)', org_no, org_yes, n_cust;
  end if;
end $$;
rollback;
SQL

# ===========================================================================
# C6.5b — Impersonación deja bitácora en audit_log (transición registra)
# ===========================================================================
check "E2  Impersonación deja bitácora en audit_log (transition -> +1 fila)" <<'SQL'
begin;
do $$
declare v_oid uuid; n_before int; n_after int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub','d0000000-0000-0000-0000-0000000000aa','role','authenticated')::text, true);
  perform set_config('role','authenticated', true);
  perform set_config('request.headers', json_build_object('x-aplika-impersonate','11111111-1111-1111-1111-111111111111')::text, true);
  select id into v_oid from orders where organization_id='11111111-1111-1111-1111-111111111111' and folio='PD-1041'; -- confirmado
  select count(*) into n_before from audit_log where organization_id='11111111-1111-1111-1111-111111111111' and entity_type='order' and entity_id=v_oid::text;
  perform transition_order(v_oid, 'pagado');  -- avance válido; items sin variante => sin movimiento de stock
  select count(*) into n_after from audit_log where organization_id='11111111-1111-1111-1111-111111111111' and entity_type='order' and entity_id=v_oid::text;
  if n_after = n_before + 1 then
    raise notice 'RESULT=PASS impersonación deja bitácora (audit_log % -> %)', n_before, n_after;
  else
    raise notice 'RESULT=FAIL audit_log no registró (antes % después %)', n_before, n_after;
  end if;
end $$;
rollback;
SQL

# ===========================================================================
# C6.6 — Precio-desde-lista: cliente con Mayoreo B tiene precio != base
# ===========================================================================
check "F   Precio-desde-lista: cliente Mayoreo B con precio != base" <<'SQL'
begin;
do $$
declare v_base numeric; v_list numeric;
begin
  perform set_config('request.jwt.claims', json_build_object('sub','d0000000-0000-0000-0000-0000000000b1','role','authenticated')::text, true);
  perform set_config('role','authenticated', true);
  select v.base_price_mxn, pli.price_mxn into v_base, v_list
    from customers c
    join price_list_items pli on pli.price_list_id = c.price_list_id
    join product_variants v on v.id = pli.product_variant_id
   where c.organization_id='11111111-1111-1111-1111-111111111111'
     and c.name='Ferretería La Herradura' and v.sku='BAL-1184';
  if v_list is not null and v_list <> v_base then
    raise notice 'RESULT=PASS precio-por-lista (BAL-1184 base % -> Mayoreo B %)', v_base, v_list;
  else
    raise notice 'RESULT=FAIL precio-por-lista (base % list %)', v_base, v_list;
  end if;
end $$;
rollback;
SQL

echo "----------------------------------------------------------------------"
echo "RESUMEN f0_acceptance:  PASS=$PASS  FAIL=$FAIL"
[ "$FAIL" -eq 0 ] && { echo "TODOS LOS CRITERIOS C6 EN PASS"; exit 0; } || { echo "HAY CRITERIOS EN FALLO"; exit 1; }
