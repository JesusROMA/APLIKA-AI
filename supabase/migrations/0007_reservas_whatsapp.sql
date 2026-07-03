-- ============================================================================
-- Aplika.ai — 0007 · Módulo "Reserva de Citas por WhatsApp"
-- Nuevo módulo del vertical servicios_agenda: el Agente IA capta la solicitud
-- por WhatsApp y la convierte en una cita del calendario. No requiere tablas
-- nuevas (usa appointments + ai_conversations); solo registra el módulo para
-- que el Panel Cliente lo muestre en su navegación dinámica.
-- ============================================================================

-- Módulo en el catálogo (route_prefix = clave de vista en el Panel Cliente).
-- icon = burbuja de WhatsApp (atributo d del nav). sort=2 lo coloca antes del
-- calendario dentro del vertical servicios_agenda (ordenes/2 no coexiste ahí).
insert into modules (id, key, name, icon, route_prefix, requires, core, sort) values
  ('c0000000-0000-0000-0000-000000000010','reservas_whatsapp','Reserva por WhatsApp',
   'M4 5h16v11H8l-4 3.5zM9 10h.01M13 10h.01M16 10h.01',
   'reservas','["calendario"]', false, 2)
on conflict (key) do nothing;

-- Añadir el módulo a los default del vertical servicios_agenda (nuevos tenants
-- de ese vertical lo reciben vía trigger assign_default_modules).
update verticals
   set default_modules =
     (select jsonb_agg(distinct e)
        from jsonb_array_elements_text(default_modules || '["reservas_whatsapp"]'::jsonb) e)
 where key = 'servicios_agenda';

-- Activarlo en los tenants existentes del vertical servicios_agenda (Vitalis).
insert into organization_modules (organization_id, module_id, enabled)
select o.id, m.id, true
  from organizations o
  join verticals v on v.id = o.vertical_id and v.key = 'servicios_agenda'
  cross join modules m
 where m.key = 'reservas_whatsapp'
on conflict (organization_id, module_id) do nothing;
