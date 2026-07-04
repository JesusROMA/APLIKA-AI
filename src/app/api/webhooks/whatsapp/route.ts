import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { parseBookingMessage } from '@/lib/appointments/whatsapp';
import { isDemo } from '@/lib/demo';

// El webhook de Twilio manda el body como x-www-form-urlencoded y firma la
// petición; necesitamos el body crudo para validar la firma.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c] as string));
}

/** Respuesta TwiML: Twilio la usa para contestar al paciente por WhatsApp. */
function twiml(message: string): NextResponse {
  const body = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(message)}</Message></Response>`;
  return new NextResponse(body, { status: 200, headers: { 'Content-Type': 'text/xml; charset=utf-8' } });
}

/**
 * Valida la firma X-Twilio-Signature: HMAC-SHA1(base64) sobre
 * (URL pública + params POST ordenados por clave concatenados), con el Auth Token.
 */
function validTwilioSignature(url: string, params: Record<string, string>, signature: string, token: string): boolean {
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join('');
  const expected = crypto.createHmac('sha1', token).update(Buffer.from(data, 'utf-8')).digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

function fmtDate(d: Date): string {
  return d.toLocaleString('es-MX', {
    weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
    hourCycle: 'h23', timeZone: 'America/Mexico_City',
  } as Intl.DateTimeFormatOptions);
}

// GET — comprobación rápida de que el endpoint está vivo (Twilio no lo usa).
export async function GET() {
  return NextResponse.json({ ok: true, service: 'aplika-whatsapp-webhook' });
}

/**
 * POST /api/webhooks/whatsapp — recibe mensajes de WhatsApp vía Twilio,
 * interpreta la solicitud de cita y (si Supabase está configurado) la agenda
 * en el tenant destino. Responde al paciente con TwiML.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const params = Object.fromEntries(new URLSearchParams(raw)) as Record<string, string>;

  const token = process.env.TWILIO_AUTH_TOKEN || '';
  const mustValidate = process.env.APLIKA_WHATSAPP_VALIDATE !== 'false';

  // Reconstruye la URL pública que Twilio invocó (host del túnel + ruta).
  const host = req.headers.get('host') || '';
  const proto = req.headers.get('x-forwarded-proto') || 'https';
  const path = new URL(req.url).pathname;
  const publicUrl = process.env.APLIKA_PUBLIC_URL
    ? process.env.APLIKA_PUBLIC_URL.replace(/\/$/, '') + path
    : `${proto}://${host}${path}`;

  if (mustValidate && token) {
    const signature = req.headers.get('x-twilio-signature') || '';
    if (!validTwilioSignature(publicUrl, params, signature, token)) {
      console.error('[whatsapp] firma Twilio inválida', { publicUrl });
      return new NextResponse('Firma inválida', { status: 403 });
    }
  }

  const from = (params.From || '').replace('whatsapp:', '').trim();
  const body = (params.Body || '').trim();
  const profileName = (params.ProfileName || '').trim();
  const firstName = profileName ? profileName.split(/\s+/)[0] : '';
  const patientName = profileName || from || 'Paciente WhatsApp';

  if (!body) {
    return twiml('¡Hola! 👋 Para agendar tu cita dime el día y la hora, por ejemplo: «mañana a las 4 pm».');
  }

  const parsed = parseBookingMessage(body);
  const orgId = process.env.APLIKA_WHATSAPP_ORG_ID || '';

  // Con Supabase configurado + org destino + fecha detectada → agenda la cita.
  if (!isDemo() && orgId && parsed.startsAt) {
    try {
      const { createSupabaseAdminClient } = await import('@/lib/supabase/admin');
      // any: los tipos generados de la BD aún no existen (misma deuda que el resto de rutas)
      const admin = createSupabaseAdminClient() as any;
      const starts = new Date(parsed.startsAt);
      const ends = new Date(starts.getTime() + 50 * 60000);

      const { error } = await admin.from('appointments').insert({
        organization_id: orgId,
        patient_name: patientName,
        starts_at: starts.toISOString(),
        ends_at: ends.toISOString(),
        notes: `Reserva por WhatsApp (${from}) — «${body}»`,
      });
      if (error) throw error;

      // Bandeja del Agente IA (best-effort; no rompe la reserva).
      try {
        const { data: conv } = await admin
          .from('ai_conversations')
          .insert({ organization_id: orgId, customer_phone: from, customer_name: patientName, channel: 'whatsapp', tag: 'Cita', appointment: true, resolved: true, last_message_at: new Date().toISOString() })
          .select('id')
          .single();
        if (conv?.id) {
          await admin.from('ai_messages').insert([
            { organization_id: orgId, conversation_id: conv.id, role: 'user', body },
            { organization_id: orgId, conversation_id: conv.id, role: 'agent', body: `Cita agendada para ${fmtDate(starts)}.` },
          ]);
        }
      } catch { /* opcional */ }

      return twiml(`✅ ¡Listo${firstName ? ', ' + firstName : ''}! Tu cita quedó agendada para el ${fmtDate(starts)}. Si necesitas cambiarla, escríbenos por aquí.`);
    } catch (e) {
      console.error('[whatsapp] no se pudo agendar la cita:', e);
      return twiml('Recibimos tu solicitud ✅ En un momento te confirmamos tu cita.');
    }
  }

  // Sin base de datos aún: confirma recepción e interpreta lo detectado.
  if (parsed.startsAt) {
    const when = fmtDate(new Date(parsed.startsAt));
    return twiml(`Recibí tu solicitud de cita para el ${when} ✅ En breve te confirmamos.`);
  }

  // No se detectó fecha/hora: pide los datos.
  return twiml('Con gusto te agendo 🙂 Dime el día y la hora, por ejemplo: «el viernes a las 11 am» o «mañana a las 4 pm».');
}
