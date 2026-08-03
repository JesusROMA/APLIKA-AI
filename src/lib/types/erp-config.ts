/**
 * CONTRATO F4 — Tipos compartidos de Transversales (config/auditoría/branding/
 * campos personalizados). Ver docs/erp/F4-CONTRATOS.md §C2. PROPIEDAD DEL
 * ORQUESTADOR: los subagentes de la Tanda B importan de aquí; NO editan.
 */

import type { ModuleKey, PermAction, Role } from '@/lib/types/erp';

// ===== Editor de permisos RBAC =====

export interface PermissionCell {
  role: Role;
  moduleKey: ModuleKey;
  action: PermAction;
  defaultAllowed: boolean; // default global (organization_id NULL)
  override: boolean | null; // override del tenant, o null si no hay
  effective: boolean; // lo que realmente aplica
}

/** allowed=null ⇒ eliminar el override (volver al default global). */
export interface PermissionOverrideInput {
  role: Role;
  moduleKey: ModuleKey;
  action: PermAction;
  allowed: boolean | null;
}

// ===== Toggle de módulos =====

export interface ModuleToggleRow {
  key: string;
  name: string;
  enabled: boolean;
  core: boolean; // core no se puede desactivar
}

// ===== Series de folios =====

export interface ConfigSeriesRow {
  id: string;
  docType: string;
  serie: string;
  prefix: string;
  nextValue: number;
  isDefault: boolean;
}

export interface ConfigSeriesInput {
  docType: string;
  serie: string;
  prefix: string;
  nextValue?: number;
}

// ===== Branding =====

export interface BrandingInfo {
  name: string;
  logoUrl: string | null;
  brandColor: string | null;
}

export interface BrandingInput {
  logoUrl?: string | null;
  brandColor?: string | null;
}

// ===== Campos personalizados =====

export type CustomFieldType = 'text' | 'number' | 'date' | 'select' | 'boolean';

export interface CustomFieldDef {
  id: string;
  moduleKey: string;
  fieldKey: string;
  label: string;
  fieldType: CustomFieldType;
  required: boolean;
  options: string[]; // para field_type 'select'
  sort: number;
  active: boolean;
}

export interface CustomFieldInput {
  moduleKey: string;
  fieldKey: string;
  label: string;
  fieldType: CustomFieldType;
  required?: boolean;
  options?: string[];
  sort?: number;
  active?: boolean;
}

// ===== Bitácora / auditoría =====

export interface AuditRow {
  id: number;
  actorId: string | null;
  actorName: string | null;
  entityType: string;
  entityId: string;
  action: string;
  detail: Record<string, unknown>;
  createdAt: string;
}
