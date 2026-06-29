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

export interface PacProvider {
  readonly name: string;
  timbrar(input: CfdiInput): Promise<TimbreResult>;
  cancelar(uuid: string, motivo?: string): Promise<CancelResult>;
}
