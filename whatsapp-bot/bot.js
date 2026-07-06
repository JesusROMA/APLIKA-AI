// ============================================================================
// Aplika — Contestador automático de WhatsApp SIN Twilio.
// Conecta TU número de WhatsApp vía código QR (whatsapp-web.js, patrón del
// proyecto whatsapp-bot-citas) y reenvía cada mensaje entrante al mismo
// cerebro del servidor Aplika (POST /api/webhooks/whatsapp): parser de citas,
// respuestas automáticas del panel Super-admin y registro en Supabase.
// El webhook de Twilio queda intacto — ambos canales conviven.
//
// Uso:  npm run bot:install (una vez)  →  npm run bot  →  escanear QR.
// ============================================================================
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// --- Config: lee .env.local del proyecto (sin dependencia dotenv) ---
function loadEnvLocal() {
  const file = path.join(__dirname, '..', '.env.local');
  const env = {};
  try {
    for (const line of fs.readFileSync(file, 'utf-8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !line.trim().startsWith('#')) env[m[1]] = m[2];
    }
  } catch { /* sin .env.local: defaults */ }
  return env;
}
const ENV = loadEnvLocal();
const TARGET = process.env.APLIKA_BOT_TARGET || 'http://localhost:3000';
const WEBHOOK = TARGET.replace(/\/$/, '') + '/api/webhooks/whatsapp';
const TOKEN = ENV.TWILIO_AUTH_TOKEN || '';
// El server valida la firma contra APLIKA_PUBLIC_URL (si está definida); el
// bot firma con la misma URL para que coincida. Sin token no se firma.
const SIGN_URL = (ENV.APLIKA_PUBLIC_URL ? ENV.APLIKA_PUBLIC_URL.replace(/\/$/, '') : TARGET.replace(/\/$/, '')) + '/api/webhooks/whatsapp';

// --- Utilidades ---
function sign(params) {
  const data = SIGN_URL + Object.keys(params).sort().map((k) => k + params[k]).join('');
  return crypto.createHmac('sha1', TOKEN).update(Buffer.from(data, 'utf-8')).digest('base64');
}
function unescapeXml(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}
// '5215572700872@c.us' -> 'whatsapp:+5215572700872' (misma forma que Twilio)
function toWaAddr(jid) {
  return 'whatsapp:+' + String(jid || '').replace(/@.*$/, '');
}

// Pregunta al cerebro del servidor qué contestar (mismo contrato que Twilio).
async function brainReply(from, body, profileName) {
  const params = { From: from, To: 'whatsapp:bot-local', Body: body, ProfileName: profileName || '' };
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (TOKEN) headers['X-Twilio-Signature'] = sign(params);
  const res = await fetch(WEBHOOK, { method: 'POST', headers, body: new URLSearchParams(params).toString() });
  const text = await res.text();
  if (!res.ok) throw new Error('servidor respondió HTTP ' + res.status + ': ' + text.slice(0, 120));
  const m = text.match(/<Message>([\s\S]*?)<\/Message>/);
  return m ? unescapeXml(m[1]) : null;
}

// --- Cliente de WhatsApp (patrón del proyecto original) ---
const client = new Client({
  authStrategy: new LocalAuth({ dataPath: path.join(__dirname, '.wwebjs_auth') }),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-accelerated-2d-canvas', '--disable-gpu'],
  },
});

client.on('qr', (qr) => {
  console.log('\n📱 Escanea este código QR con tu WhatsApp (Dispositivos vinculados → Vincular dispositivo):\n');
  qrcode.generate(qr, { small: true });
});

client.on('authenticated', () => console.log('🔐 Autenticación exitosa (sesión guardada; el QR no se pedirá de nuevo)'));
client.on('auth_failure', (msg) => console.error('❌ Fallo de autenticación:', msg));

client.on('ready', () => {
  console.log('✅ Contestador de WhatsApp listo — sin Twilio.');
  console.log('   Cerebro: ' + WEBHOOK + (TOKEN ? ' (firmado)' : ' (sin firma)'));
  console.log('   Las respuestas se editan en el Panel Super-admin → Plataforma → WhatsApp automático.');
});

client.on('disconnected', (reason) => {
  console.log('⚠️ Cliente desconectado:', reason, '— reintentando en 5 s…');
  setTimeout(() => client.initialize(), 5000);
});

client.on('message', async (message) => {
  try {
    // Solo chats directos: fuera grupos, estados y mensajes propios.
    if (message.fromMe) return;
    if (message.from.endsWith('@g.us') || message.from === 'status@broadcast') return;
    if (!message.body || !message.body.trim()) return;

    const from = toWaAddr(message.from);
    const name = (message._data && message._data.notifyName) || '';
    console.log('📩', from, '→', message.body.slice(0, 80));

    const reply = await brainReply(from, message.body.trim(), name);
    if (reply) {
      await message.reply(reply);
      console.log('📤 respondido:', reply.replace(/\n/g, ' ').slice(0, 80));
    }
  } catch (e) {
    console.error('❌ Error procesando mensaje:', e.message);
    try { await message.reply('❌ Hubo un error procesando tu mensaje. Intenta de nuevo en un momento.'); } catch {}
  }
});

// Cierre limpio
async function shutdown() {
  console.log('\n🛑 Cerrando bot…');
  try { await client.destroy(); } catch {}
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('unhandledRejection', (r) => console.error('❌ Promesa no manejada:', r));

console.log('🚀 Inicializando contestador de WhatsApp (sin Twilio)…');
console.log('   Requiere el servidor Aplika corriendo en ' + TARGET + ' (npm run dev).');
client.initialize();
