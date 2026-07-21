import { randomUUID } from 'crypto';
import type {
  PacProvider,
  CfdiInput,
  TimbreResult,
  CancelResult,
  RepInput,
  RepResult,
} from './types';

/**
 * PAC simulado (mockeable). Genera un UUID y un XML CFDI 4.0 plausible para
 * desarrollo y pruebas, sin llamar a un PAC real. Reemplazable por Facturama /
 * Finkok / SW implementando la misma interfaz PacProvider.
 */
export class StubPacProvider implements PacProvider {
  readonly name = 'stub';

  async timbrar(input: CfdiInput): Promise<TimbreResult> {
    const uuid = randomUUID().toUpperCase();
    const fecha = new Date().toISOString().slice(0, 19);
    const conceptos = input.conceptos
      .map(
        (c) =>
          `    <cfdi:Concepto ClaveProdServ="01010101" Cantidad="${c.qty}" ClaveUnidad="H87" Descripcion="${escapeXml(
            c.name,
          )}" ValorUnitario="${c.unitPrice.toFixed(2)}" Importe="${(c.qty * c.unitPrice).toFixed(2)}"/>`,
      )
      .join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0" Serie="${input.serie}" Folio="${input.folio}" Fecha="${fecha}" SubTotal="${input.subtotal.toFixed(
      2,
    )}" Total="${input.total.toFixed(2)}" Moneda="MXN" TipoDeComprobante="I" Exportacion="01" MetodoPago="PUE">
  <cfdi:Receptor Rfc="${input.receptorRfc}" Nombre="${escapeXml(input.receptorNombre)}" RegimenFiscalReceptor="${firstCode(
      input.regimen,
    )}" UsoCFDI="${firstCode(input.usoCfdi)}"/>
  <cfdi:Conceptos>
${conceptos}
  </cfdi:Conceptos>
  <cfdi:Impuestos TotalImpuestosTrasladados="${input.tax.toFixed(2)}"/>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="1.1" UUID="${uuid}" FechaTimbrado="${fecha}" RfcProvCertif="STUB010101000"/>
  </cfdi:Complemento>
</cfdi:Comprobante>`;

    return { uuid, xml };
  }

  async cancelar(uuid: string, motivo = '02'): Promise<CancelResult> {
    const canceladoAt = new Date().toISOString();
    const acuse = `<?xml version="1.0"?><Acuse uuid="${uuid}" motivo="${motivo}" estatus="Cancelado" fecha="${canceladoAt}"/>`;
    return { acuse, canceladoAt };
  }

  async timbrarREP(input: RepInput): Promise<RepResult> {
    const uuid = randomUUID().toUpperCase();
    const fecha = new Date().toISOString().slice(0, 19);
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:pago20="http://www.sat.gob.mx/Pagos20" Version="4.0" Serie="${input.serie}" Folio="${input.folio}" Fecha="${fecha}" SubTotal="0" Total="0" Moneda="XXX" TipoDeComprobante="P" Exportacion="01">
  <cfdi:Receptor Rfc="${input.receptorRfc}" Nombre="${escapeXml(input.receptorNombre)}"/>
  <cfdi:Complemento>
    <pago20:Pagos Version="2.0">
      <pago20:Pago FechaPago="${fecha}" FormaDePagoP="${input.formaPago}" MonedaP="MXN" Monto="${input.monto.toFixed(2)}">
        <pago20:DoctoRelacionado IdDocumento="${input.facturaUuid}" Serie="${input.serie}" Folio="${input.folio}" MetodoDePagoDR="PPD" NumParcialidad="${input.numParcialidad}" ImpSaldoAnt="${input.saldoAnterior.toFixed(
          2,
        )}" ImpPagado="${input.monto.toFixed(2)}" ImpSaldoInsoluto="${input.saldoInsoluto.toFixed(2)}"/>
      </pago20:Pago>
    </pago20:Pagos>
  </cfdi:Complemento>
  <tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="1.1" UUID="${uuid}" FechaTimbrado="${fecha}" RfcProvCertif="STUB010101000"/>
</cfdi:Comprobante>`;
    return { uuid, xml };
  }
}

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]!));
}
// "601 · General de Ley..." -> "601"
function firstCode(s: string): string {
  return (s || '').split('·')[0].trim() || s;
}
