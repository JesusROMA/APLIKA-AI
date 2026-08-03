/**
 * CONTRATO F7 — Tipos compartidos de CRM. PROPIEDAD DEL ORQUESTADOR.
 */

export type ProspectStage = 'nuevo' | 'contactado' | 'propuesta' | 'ganado' | 'perdido';

export interface ProspectRow {
  id: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  source: string | null;
  stage: ProspectStage;
  notas: string | null;
  customerId: string | null; // si se convirtió a cliente
  createdAt: string;
}

export interface ProspectInput {
  name: string;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  source?: string | null;
  stage?: ProspectStage;
  notas?: string | null;
}

/** Vista 360 de un cliente: saldo + documentos relacionados. */
export interface CustomerHistoryDoc {
  type: 'cotizacion' | 'pedido' | 'factura';
  id: string;
  folio: string;
  status: string;
  total: number;
  date: string;
}

export interface CustomerHistory {
  customerId: string;
  balance: number; // CxC (saldo por cobrar)
  docs: CustomerHistoryDoc[];
}
