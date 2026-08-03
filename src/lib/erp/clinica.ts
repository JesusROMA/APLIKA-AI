import type { ErpClient } from '@/lib/erp/db';
import type { ProfessionalRef } from '@/lib/types/erp-clinica';

/**
 * Pieza compartida F3. Lista los profesionales (perfiles de staff) del tenant
 * para asignar citas/series. La policy `profiles_self` permite a cualquier
 * miembro leer los perfiles de su organización. Pacientes = customers (se usan
 * los helpers/endpoints existentes de maestros).
 */
export async function fetchProfessionals(
  supabase: ErpClient,
  orgId: string,
): Promise<ProfessionalRef[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .eq('organization_id', orgId)
    .neq('role', 'customer')
    .order('full_name');
  if (error) throw error;
  return (data ?? []).map((p) => ({
    id: p.id,
    name: p.full_name ?? '(sin nombre)',
    role: p.role,
  }));
}
