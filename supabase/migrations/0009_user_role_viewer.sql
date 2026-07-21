-- ============================================================================
-- Aplika.ai — 0009 · user_role: nuevo valor 'tenant_viewer' (Solo-lectura)
-- Semántica final: tenant_admin = Dueño/Admin · tenant_user = Operador ·
-- tenant_viewer = Solo-lectura · (super_admin, customer sin cambios).
--
-- Esta migración contiene SOLO el ALTER TYPE: un valor de enum agregado no
-- puede usarse dentro de la misma transacción que lo agrega, y cada archivo
-- de migración corre en su propia transacción. Todo lo que consume el valor
-- nuevo (seeds de role_permissions, etc.) vive en 0010_f0_fundaciones.sql.
-- ============================================================================

alter type user_role add value if not exists 'tenant_viewer';

-- ROLLBACK:
-- (PostgreSQL no permite eliminar valores de un enum. El rollback documentado
--  exige recrear el tipo sin el valor y recastear las columnas que lo usan;
--  solo es seguro si ninguna fila usa 'tenant_viewer'.)
-- update profiles set role = 'tenant_user' where role = 'tenant_viewer';
-- alter type user_role rename to user_role_old;
-- create type user_role as enum ('super_admin','tenant_admin','tenant_user','customer');
-- alter table profiles alter column role drop default;
-- alter table profiles alter column role type user_role using role::text::user_role;
-- alter table profiles alter column role set default 'tenant_user';
-- -- (repetir el ALTER ... TYPE para cualquier otra columna que use user_role,
-- --  p.ej. role_permissions.role si 0010 sigue aplicada)
-- drop type user_role_old;
