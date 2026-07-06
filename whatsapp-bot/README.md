# Contestador automático de WhatsApp — sin Twilio

Conecta **tu propio número de WhatsApp** por código QR (como WhatsApp Web) y
contesta automáticamente: agenda citas y usa las **respuestas programadas del
Panel Super-admin → Plataforma → WhatsApp automático**.

No usa Twilio. El webhook de Twilio (`/api/webhooks/whatsapp`) sigue
funcionando en paralelo: este bot reenvía cada mensaje entrante a ese mismo
endpoint local (el "cerebro"), así ambos canales comparten parser de citas,
respuestas automáticas y registro en Supabase, sin duplicar lógica.

## Uso

```bash
# 1. Instalar dependencias del bot (una sola vez; descarga Chromium)
npm run bot:install

# 2. Tener el servidor corriendo en otra terminal
npm run dev

# 3. Arrancar el bot
npm run bot
```

Al arrancar imprime un **código QR**: escanéalo desde el teléfono cuyo número
contestará (WhatsApp → Dispositivos vinculados → Vincular dispositivo). La
sesión queda guardada en `whatsapp-bot/.wwebjs_auth/` (gitignoreada) — no
pide QR de nuevo.

Cualquier persona que escriba a ese número recibe respuesta automática:
- «quiero una cita mañana a las 4 pm» → agenda la cita en el calendario
- «horario», «ubicación», «precio», «ayuda»… → respuesta del panel
- otra cosa → pide día y hora

## Notas

- El teléfono debe tener internet (es una sesión de WhatsApp Web).
- Ignora grupos y estados; solo contesta chats directos.
- `APLIKA_BOT_TARGET` (env) apunta a otro servidor si no es localhost:3000.
- whatsapp-web.js es una librería no oficial: para producción seria considera
  la API oficial (el canal Twilio ya está integrado).
