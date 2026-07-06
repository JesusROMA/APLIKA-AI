-- ============================================================================
-- Aplika.ai — 0008 · Respuestas automáticas de WhatsApp (adaptado del bot
-- "whatsapp-bot-citas": respuestas programadas por palabra clave).
-- organization_id NULL = respuesta global de la plataforma (aplica a todos
-- los tenants); con organization_id = respuesta propia del tenant (override).
-- El webhook /api/webhooks/whatsapp las consulta antes del fallback.
-- ============================================================================

create table whatsapp_auto_responses (
  id              uuid primary key default uuid_generate_v4(),
  organization_id uuid references organizations(id) on delete cascade,
  keyword         text not null,                     -- palabra clave (match por inclusión, case-insensitive)
  response        text not null,                     -- texto que contesta el bot
  category        text not null default 'general',   -- saludo | citas | informacion | cortesia | ayuda | general
  active          boolean not null default true,
  sort            integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index idx_waresp_org on whatsapp_auto_responses(organization_id, active);
create unique index idx_waresp_kw_global on whatsapp_auto_responses(keyword) where organization_id is null;
create unique index idx_waresp_kw_org on whatsapp_auto_responses(organization_id, keyword) where organization_id is not null;

create trigger trg_waresp_touch before update on whatsapp_auto_responses
  for each row execute function app.touch_updated_at();

-- RLS: lectura para tenants (globales + las suyas); escritura solo super_admin.
alter table whatsapp_auto_responses enable row level security;
create policy waresp_read on whatsapp_auto_responses
  for select to authenticated
  using ( organization_id is null or organization_id = app.current_org_id() or app.is_super_admin() );
create policy waresp_super_write on whatsapp_auto_responses
  for all to authenticated
  using ( app.is_super_admin() ) with check ( app.is_super_admin() );

-- ----------------------------------------------------------------------------
-- Seed: respuestas default (adaptadas del proyecto original a Aplika)
-- ----------------------------------------------------------------------------
insert into whatsapp_auto_responses (keyword, response, category, sort) values
  ('hola', '👋 ¡Hola! Soy el asistente virtual. Puedo agendarte una cita: dime el día y la hora, por ejemplo «mañana a las 4 pm».', 'saludo', 1),
  ('buenos dias', '👋 ¡Buenos días! ¿Te agendo una cita? Dime el día y la hora, por ejemplo «el viernes a las 11 am».', 'saludo', 2),
  ('buenas tardes', '👋 ¡Buenas tardes! ¿Te agendo una cita? Dime el día y la hora, por ejemplo «mañana a las 4 pm».', 'saludo', 3),
  ('horario', '🕐 Nuestro horario de atención es:
Lunes a Viernes: 9:00 - 18:00
Sábados: 10:00 - 14:00
Domingos: Cerrado', 'informacion', 4),
  ('ubicacion', '📍 Estamos en:
Calle Principal #123, Colonia Centro
Ciudad de México

¿Necesitas indicaciones?', 'informacion', 5),
  ('precio', '💳 Los precios varían según el servicio. Escríbenos el servicio que te interesa y te cotizamos, o agenda una primera consulta.', 'informacion', 6),
  ('cancelar', '❌ Para cancelar o reagendar tu cita, respóndenos con la fecha de tu cita y te ayudamos con el cambio.', 'citas', 7),
  ('confirmo', '✅ ¡Perfecto! Tu cita queda confirmada. Te esperamos.', 'citas', 8),
  ('gracias', '😊 ¡De nada! ¿Hay algo más en lo que pueda ayudarte?', 'cortesia', 9),
  ('ayuda', '📋 *Puedo ayudarte con:*

1. Agendar una cita — dime día y hora («mañana a las 4 pm»)
2. "Horario" — horarios de atención
3. "Ubicación" — dónde estamos
4. "Cancelar" — cancelar o reagendar
5. "Ayuda" — este menú', 'ayuda', 10)
on conflict do nothing;
