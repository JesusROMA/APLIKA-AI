// Adaptador de correo desacoplado (F1). Mismo patrón que el PacProvider: la app
// depende de la interfaz, no del proveedor. Implementaciones: mock (default),
// y en el futuro Resend/SES/SendGrid implementando la misma interfaz.

export interface EmailAttachment {
  filename: string;
  content: string; // base64 o texto plano (según mimeType)
  mimeType: string;
}

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  /** Metadatos opcionales para trazabilidad (documento origen). */
  docType?: string;
  docId?: string;
  attachments?: EmailAttachment[];
}

export interface EmailResult {
  id: string; // id del envío (para bitácora / webhook futuro)
  provider: string;
  sentAt: string;
}

export interface EmailProvider {
  readonly name: string;
  send(msg: EmailMessage): Promise<EmailResult>;
}
