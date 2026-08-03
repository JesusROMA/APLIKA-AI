-- ============================================================================
-- Aplika.ai — 0015 · FASE 3 Clínicas/Agenda · Enums (contrato C1.0)
-- Migración AISLADA a propósito: `alter type ... add value` no puede usarse en
-- la MISMA transacción en la que se referencia el valor nuevo. Aquí sólo se
-- declaran los valores/tipos (no se usan), de modo que 0016 ya los tiene
-- committeados y disponibles. Idempotente.
--   · appointment_status += 'no_asistio' (inasistencia del paciente).
--   · appointment_freq: cadencia de las series de recurrencia.
-- ============================================================================

alter type appointment_status add value if not exists 'no_asistio';  -- inasistencia

do $$ begin
  create type appointment_freq as enum ('semanal','quincenal','mensual');
exception when duplicate_object then null;
end $$;

-- ============================================================================
-- ROLLBACK: (documentación, no ejecutable)
-- -- Postgres NO permite eliminar un valor individual de un enum; para revertir
-- -- 'no_asistio' habría que recrear el tipo appointment_status (migración
-- -- destructiva fuera de alcance).
-- drop type if exists appointment_freq;
-- ============================================================================
