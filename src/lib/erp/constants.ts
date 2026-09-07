import type { ModuleKey, PermAction } from '@/lib/types/erp';

/** Todas las keys de módulo del contrato (0026: maestros como módulos reales). */
export const ALL_MODULE_KEYS: ModuleKey[] = [
  'dashboard',
  'ordenes',
  'cotizaciones',
  'compras',
  'inventario',
  'facturacion',
  'pagos',
  'crm',
  'calendario',
  'expediente',
  'reservas_whatsapp',
  'ia_agente',
  'config',
  'maestro_clientes',
  'maestro_proveedores',
  'maestro_productos',
  'maestro_almacenes',
  'maestro_precios',
];

/** Keys de los 5 maestros (módulos asignables por tenant desde 0026). */
export const MAESTRO_MODULES: ModuleKey[] = [
  'maestro_clientes',
  'maestro_proveedores',
  'maestro_productos',
  'maestro_almacenes',
  'maestro_precios',
];

/** Todas las acciones RBAC. */
export const ALL_ACTIONS: PermAction[] = ['ver', 'crear', 'editar', 'cancelar', 'configurar'];

/**
 * Módulos "core": org_has_module() devuelve true para ellos aunque no estén en
 * organization_modules (dashboard/config). Los guards los tratan como siempre
 * activos si existe la org. Los maestros dejaron de ser virtuales en 0026:
 * ahora son módulos de catálogo asignables por tenant.
 */
export const CORE_MODULES = new Set<ModuleKey>(['dashboard', 'config']);
