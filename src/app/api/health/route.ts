import { ok, handle } from '@/lib/api';

export const dynamic = 'force-dynamic';

// Healthcheck para Docker / IONOS.
export const GET = handle(async () => ok({ status: 'ok', service: 'aplika-erp', ts: Date.now() }));
