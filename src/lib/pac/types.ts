// Adaptador desacoplado de timbrado CFDI 4.0. No atado a un PAC concreto.
// Implementaciones: stub (default), Facturama, Finkok, SW... (ver index.ts)

export interface CfdiConcept {
  sku: string;
  name: string;
  qty: number;
  unitPrice: number;
}

export interface CfdiInput {
  serie: string;
  folio: string;
  receptorNombre: string;
  receptorRfc: string;
  regimen: string;
  usoCfdi: string;
  subtotal: number;
  tax: number;
  total: number;
  conceptos: CfdiConcept[];
}

export interface TimbreResult {
  uuid: string;
  xml: string; // contenido XML del CFDI timbrado
  pdfBase64?: string; // opcional; el stub no genera PDF binario
}

export interface CancelResult {
  acuse: string; // acuse de cancelación (XML/base64)
  canceladoAt: string;
}

/**
 * Datos de un pago para timbrar un REP (CFDI con Complemento de Pago 2.0), que
 * el SAT exige por cada pago de una factura PPD (F1 · CxC/REP).
 */
export interface RepInput {
  serie: string;
  folio: string;
  facturaUuid: string; // UUID (folio fiscal) de la factura ingreso que se paga
  receptorNombre: string;
  receptorRfc: string;
  monto: number;
  formaPago: string; // c_FormaPago SAT ('03' transferencia, etc.)
  numParcialidad: number; // 1, 2, 3...
  saldoAnterior: number;
  saldoInsoluto: number; // saldo tras aplicar este pago
}

export interface RepResult {
  uuid: string;
  xml: string; // CFDI de tipo P (Pago) timbrado
}

export interface PacProvider {
  readonly name: string;
  timbrar(input: CfdiInput): Promise<TimbreResult>;
  cancelar(uuid: string, motivo?: string): Promise<CancelResult>;
  /** Timbra un Recibo Electrónico de Pago (complemento de pago) — facturas PPD. */
  timbrarREP(input: RepInput): Promise<RepResult>;
}
