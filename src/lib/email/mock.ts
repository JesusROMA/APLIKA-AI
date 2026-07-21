import { randomUUID } from 'crypto';
import type { EmailProvider, EmailMessage, EmailResult } from './types';

/**
 * Proveedor de correo simulado (default en dev/pruebas). No envía nada real:
 * registra en consola y devuelve un id sintético. Reemplazable por Resend/SES/
 * SendGrid implementando la misma interfaz EmailProvider. Autorización explícita
 * requerida antes de conectar un proveedor real (regla del proyecto).
 */
export class MockEmailProvider implements EmailProvider {
  readonly name = 'mock';

  async send(msg: EmailMessage): Promise<EmailResult> {
    const id = randomUUID();
    const sentAt = new Date().toISOString();
    // eslint-disable-next-line no-console
    console.info(
      `[email:mock] → ${msg.to} · "${msg.subject}"` +
        (msg.docType ? ` · ${msg.docType}:${msg.docId ?? ''}` : '') +
        ` · id=${id}`,
    );
    return { id, provider: this.name, sentAt };
  }
}
