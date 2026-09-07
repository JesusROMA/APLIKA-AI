'use client';

/**
 * Configuración → Usuarios: gestión de usuarios del tenant (solo con
 * config/configurar — dueño/admin). Invitar con contraseña temporal (se
 * muestra UNA vez), cambiar rol, suspender/reactivar acceso y restablecer
 * contraseña. Todo queda en la Bitácora.
 */

import { useState } from 'react';
import { useSession } from '../../_components/session';
import { useAsyncData } from '../../_lib/hooks';
import {
  createUser,
  getUsers,
  patchUser,
  resetUserPassword,
  type OrgUser,
  type TenantRole,
} from '../../_lib/usuarios';
import { Badge, EmptyState, ErrorState, LoadingState } from '../../_components/States';

const ROLE_OPTIONS: { value: TenantRole; label: string }[] = [
  { value: 'tenant_admin', label: 'Dueño / Admin' },
  { value: 'tenant_user', label: 'Operador' },
  { value: 'tenant_viewer', label: 'Solo lectura' },
];

function fmtLastSeen(iso: string | null): string {
  if (!iso) return 'Nunca';
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function UsersTab({ canWrite }: { canWrite: boolean }) {
  const session = useSession();
  const { data, loading, error, reload } = useAsyncData(getUsers);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // Credencial temporal recién generada (invitación o reset): se muestra 1 vez.
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null);

  // --- Form de invitación ---
  const [inviteOpen, setInviteOpen] = useState(false);
  const [form, setForm] = useState({ email: '', fullName: '', role: 'tenant_user' as TenantRole });

  if (!canWrite) {
    return (
      <EmptyState
        title="Solo administradores"
        message="La gestión de usuarios requiere el permiso de configuración (dueño/admin)."
      />
    );
  }
  if (loading) return <LoadingState label="Cargando usuarios…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const users = data ?? [];

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setActionError(null);
    try {
      await fn();
      reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'No se pudo completar la acción.');
    } finally {
      setBusy(null);
    }
  };

  const submitInvite = () =>
    run('invite', async () => {
      const r = await createUser(form);
      setIssued({ email: form.email, password: r.tempPassword });
      setInviteOpen(false);
      setForm({ email: '', fullName: '', role: 'tenant_user' });
    });

  return (
    <div>
      <div className="panel-page-head">
        <div>
          <h3 className="panel-page-title" style={{ fontSize: 'var(--fs-lg, 1.1rem)' }}>
            Usuarios y roles
          </h3>
          <p className="panel-page-sub">
            Quién entra a tu panel y con qué rol. Los permisos finos por rol viven en la pestaña Permisos.
          </p>
        </div>
        <button type="button" className="pbtn pbtn--primary pbtn--sm" onClick={() => setInviteOpen((v) => !v)}>
          + Invitar usuario
        </button>
      </div>

      {actionError && (
        <p className="panel-form-error" role="alert" style={{ marginBottom: 'var(--sp-2)' }}>
          {actionError}
        </p>
      )}

      {issued && (
        <div className="users-issued" role="status">
          <div>
            <strong>Credencial temporal para {issued.email}</strong>
            <p>
              Contraseña: <code className="users-issued-pass">{issued.password}</code>
            </p>
            <p className="users-issued-note">
              Cópiala ahora — no se volverá a mostrar. Pide al usuario cambiarla al entrar.
            </p>
          </div>
          <button type="button" className="pbtn pbtn--ghost pbtn--sm" onClick={() => setIssued(null)}>
            Entendido
          </button>
        </div>
      )}

      {inviteOpen && (
        <div className="panel-card users-invite">
          <div className="users-invite-grid">
            <label className="panel-field">
              <span className="panel-label">Nombre</span>
              <input
                className="panel-input"
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                placeholder="Nombre y apellido"
              />
            </label>
            <label className="panel-field">
              <span className="panel-label">Correo</span>
              <input
                className="panel-input"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="usuario@empresa.mx"
              />
            </label>
            <label className="panel-field">
              <span className="panel-label">Rol</span>
              <select
                className="panel-input"
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as TenantRole })}
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div style={{ display: 'flex', gap: 'var(--sp-1)', justifyContent: 'flex-end' }}>
            <button type="button" className="pbtn pbtn--ghost pbtn--sm" onClick={() => setInviteOpen(false)}>
              Cancelar
            </button>
            <button
              type="button"
              className="pbtn pbtn--primary pbtn--sm"
              disabled={busy === 'invite' || !form.email.trim() || !form.fullName.trim()}
              onClick={submitInvite}
            >
              {busy === 'invite' ? 'Creando…' : 'Crear usuario'}
            </button>
          </div>
        </div>
      )}

      <div className="panel-table-wrap chart-table">
        <table className="panel-table">
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Rol</th>
              <th>Última sesión</th>
              <th>Estado</th>
              <th className="panel-table-num">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const self = u.id === session.userId;
              return (
                <tr key={u.id}>
                  <td>
                    <strong>{u.fullName ?? u.email}</strong>
                    {self && <span className="users-self"> (tú)</span>}
                    <div className="users-email">{u.email}</div>
                  </td>
                  <td>
                    {self || u.role === 'super_admin' ? (
                      <Badge tone="blue">{ROLE_OPTIONS.find((r) => r.value === u.role)?.label ?? u.role}</Badge>
                    ) : (
                      <select
                        className="panel-input users-role"
                        value={u.role}
                        disabled={busy !== null}
                        onChange={(e) =>
                          run(`role-${u.id}`, () => patchUser(u.id, { role: e.target.value as TenantRole }).then(() => undefined))
                        }
                        aria-label={`Rol de ${u.email}`}
                      >
                        {ROLE_OPTIONS.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td>{fmtLastSeen(u.lastSignInAt)}</td>
                  <td>
                    <Badge tone={u.suspended ? 'ro' : 'on'}>{u.suspended ? 'Suspendido' : 'Activo'}</Badge>
                  </td>
                  <td className="panel-table-num">
                    {!self && u.role !== 'super_admin' && (
                      <span className="users-actions">
                        <button
                          type="button"
                          className="pbtn pbtn--ghost pbtn--sm"
                          disabled={busy !== null}
                          onClick={() =>
                            run(`pass-${u.id}`, async () => {
                              const r = await resetUserPassword(u.id);
                              setIssued({ email: u.email, password: r.tempPassword });
                            })
                          }
                        >
                          Restablecer contraseña
                        </button>
                        <button
                          type="button"
                          className={`pbtn pbtn--sm ${u.suspended ? 'pbtn--primary' : 'pbtn--danger'}`}
                          disabled={busy !== null}
                          onClick={() =>
                            run(`susp-${u.id}`, () => patchUser(u.id, { suspended: !u.suspended }).then(() => undefined))
                          }
                        >
                          {u.suspended ? 'Reactivar' : 'Suspender'}
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
