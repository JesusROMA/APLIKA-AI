import { handle, ok, ApiError } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import { parseListParams, rangeFor, paginated } from '@/lib/erp/pagination';
import { resolvePatientName } from '@/app/api/erp/appointments/_shared';
import {
  SERIES_SELECT,
  mapSeriesRow,
  seriesInputSchema,
  type SeriesJoinRow,
} from './_shared';

export const dynamic = 'force-dynamic';

// GET /api/erp/appointment-series — listado paginado (calendario/ver).
export const GET = handle(async (req) => {
  const session = await getErpSession();
  requireAccess(session, 'calendario', 'ver');
  const supabase = erpClientFor(session);

  const { page, pageSize } = parseListParams(new URL(req.url));
  const [from, to] = rangeFor(page, pageSize);

  const { data, error, count } = await supabase
    .from('appointment_series')
    .select(SERIES_SELECT, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);
  if (error) throw error;

  const rows = ((data ?? []) as unknown as SeriesJoinRow[]).map(mapSeriesRow);
  return ok(paginated(rows, page, pageSize, count));
});

// POST /api/erp/appointment-series — alta de serie (calendario/crear).
export const POST = handle(async (req) => {
  const session = await getErpSession();
  requireAccess(session, 'calendario', 'crear');
  const supabase = erpClientFor(session);
  const orgId = session.organization!.id;

  const body = seriesInputSchema.parse(await req.json());

  // patient_name es opcional en series; si sólo hay cliente, se resuelve del maestro.
  const patientName = await resolvePatientName(
    supabase,
    { patientName: body.patientName, customerId: body.customerId },
    false,
  );

  const { data, error } = await supabase
    .from('appointment_series')
    .insert({
      organization_id: orgId,
      professional_id: body.professionalId,
      customer_id: body.customerId ?? null,
      patient_name: patientName,
      freq: body.freq,
      weekday: body.weekday,
      start_time: body.startTime,
      duration_min: body.durationMin,
      until: body.until,
      resource: body.resource ?? null,
      price_mxn: body.priceMxn ?? null,
      created_by: session.userId,
    })
    .select('id')
    .single();
  if (error) throw new ApiError(400, error.message);

  return ok({ ok: true, id: data.id }, { status: 201 });
});
