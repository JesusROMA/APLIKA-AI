// ============================================================================
// Aplika.ai — Respuestas automáticas de WhatsApp por palabra clave.
// Adaptado del bot "whatsapp-bot-citas" (respuestas programadas): si el
// mensaje contiene la palabra clave, el bot contesta el texto configurado.
// Las respuestas viven en la tabla whatsapp_auto_responses (0008); estos
// defaults se usan en modo demo y como seed.
// ============================================================================

export interface AutoResponse {
  keyword: string;
  response: string;
  category: string;
  active?: boolean;
}

export const DEFAULT_AUTO_RESPONSES: AutoResponse[] = [
  { keyword: 'hola', category: 'saludo', response: '👋 ¡Hola! Soy el asistente virtual. Puedo agendarte una cita: dime el día y la hora, por ejemplo «mañana a las 4 pm».' },
  { keyword: 'buenos dias', category: 'saludo', response: '👋 ¡Buenos días! ¿Te agendo una cita? Dime el día y la hora, por ejemplo «el viernes a las 11 am».' },
  { keyword: 'buenas tardes', category: 'saludo', response: '👋 ¡Buenas tardes! ¿Te agendo una cita? Dime el día y la hora, por ejemplo «mañana a las 4 pm».' },
  { keyword: 'horario', category: 'informacion', response: '🕐 Nuestro horario de atención es:\nLunes a Viernes: 9:00 - 18:00\nSábados: 10:00 - 14:00\nDomingos: Cerrado' },
  { keyword: 'ubicacion', category: 'informacion', response: '📍 Estamos en:\nCalle Principal #123, Colonia Centro\nCiudad de México\n\n¿Necesitas indicaciones?' },
  { keyword: 'precio', category: 'informacion', response: '💳 Los precios varían según el servicio. Escríbenos el servicio que te interesa y te cotizamos, o agenda una primera consulta.' },
  { keyword: 'cancelar', category: 'citas', response: '❌ Para cancelar o reagendar tu cita, respóndenos con la fecha de tu cita y te ayudamos con el cambio.' },
  { keyword: 'confirmo', category: 'citas', response: '✅ ¡Perfecto! Tu cita queda confirmada. Te esperamos.' },
  { keyword: 'gracias', category: 'cortesia', response: '😊 ¡De nada! ¿Hay algo más en lo que pueda ayudarte?' },
  { keyword: 'ayuda', category: 'ayuda', response: '📋 *Puedo ayudarte con:*\n\n1. Agendar una cita — dime día y hora («mañana a las 4 pm»)\n2. "Horario" — horarios de atención\n3. "Ubicación" — dónde estamos\n4. "Cancelar" — cancelar o reagendar\n5. "Ayuda" — este menú' },
];

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

/**
 * Busca la primera respuesta cuya palabra clave esté contenida en el mensaje
 * (case/acentos-insensible). Las palabras clave más largas ganan para que
 * «confirmar cita» le gane a «cita».
 */
export function matchAutoResponse(message: string, rows: AutoResponse[]): AutoResponse | null {
  const msg = normalize(message);
  const candidates = rows
    .filter((r) => r.active !== false && r.keyword && msg.includes(normalize(r.keyword)))
    .sort((a, b) => b.keyword.length - a.keyword.length);
  return candidates[0] ?? null;
}
