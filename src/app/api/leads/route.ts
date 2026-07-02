import { z } from 'zod';
import { handle, ok, ApiError } from '@/lib/api';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import { env } from '@/lib/env';
import { isDemo } from '@/lib/demo';

export const dynamic = 'force-dynamic';

// Acepta el superset de campos de Contacto y Agenda-demo.
const Body = z.object({
  name: z.string().min(1, 'Escribe tu nombre').max(120),
  business: z.string().max(160).optional().default(''),
  contact: z.string().min(1, 'Déjanos un WhatsApp o correo').max(160),
  message: z.string().max(2000).optional().default(''),
  industry: z.string().max(80).optional(),
  size: z.string().max(80).optional(),
  source: z.enum(['contacto', 'agenda_demo']).default('contacto'),
  // Honeypot: debe llegar vacío (los bots lo rellenan).
  website: z.string().optional(),
});

// POST /api/leads — captura de leads de la landing (pública).
export const POST = handle(async (req) => {
  const ip = clientIp(req);
  if (!rateLimit(`leads:${ip}`, 5, 60_000)) {
    throw new ApiError(429, 'Demasiadas solicitudes, intenta en un minuto');
  }

  const body = Body.parse(await req.json());

  // Honeypot: si viene relleno, fingimos éxito y descartamos.
  if (body.website && body.website.trim() !== '') {
    return ok({ ok: true });
  }

  // Modo demo (sin Supabase): acepta el lead sin persistir.
  if (isDemo()) {
    console.info('[aplika] lead demo recibido:', body.name, body.contact);
    return ok({ ok: true, demo: true }, { status: 201 });
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from('leads').insert({
    source: body.source,
    name: body.name,
    business: body.business,
    contact: body.contact,
    message: body.message,
    industry: body.industry,
    size: body.size,
    ip,
    user_agent: req.headers.get('user-agent') ?? null,
  });
  if (error) throw new ApiError(400, error.message);

  // Notificación por correo (stub): integrar SMTP/Resend con APLIKA_SMTP_URL.
  // TODO: enviar a env.leadsNotifyEmail() cuando se configure el proveedor.
  void env.leadsNotifyEmail();

  return ok({ ok: true }, { status: 201 });
});
