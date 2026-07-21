import type { ModuleKey, PermAction } from '@/lib/types/erp';

/** Todas las keys de módulo del contrato (incluye el virtual 'maestros'). */
export const ALL_MODULE_KEYS: ModuleKey[] = [
  'dashboard',
  'ordenes',
  'cotizaciones',
  'remisiones',
  'inventario',
  'facturacion',
  'pagos',
  'crm',
  'calendario',
  'reservas_whatsapp',
  'ia_agente',
  'config',
  'maestros',
];

/** Todas las acciones RBAC. */
export const ALL_ACTIONS: PermAction[] = ['ver', 'crear', 'editar', 'cancelar', 'configurar'];

/**
 * Módulos "core": org_has_module() devuelve true para ellos aunque no estén en
 * organization_modules (dashboard/config son core; 'maestros' es virtual). Los
 * guards los tratan como siempre activos si existe la org.
 */
export const CORE_MODULES = new Set<ModuleKey>(['dashboard', 'config', 'maestros']);
