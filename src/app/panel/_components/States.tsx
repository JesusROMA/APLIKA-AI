'use client';

/** Estados transversales de carga / vacío / error + spinner y badges. */

export function Spinner({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="panel-state" role="status" aria-live="polite">
      <span className="panel-spinner" aria-hidden="true" />
      <p className="panel-state-msg">{label}</p>
    </div>
  );
}

export function LoadingState({ label }: { label?: string }) {
  return <Spinner label={label} />;
}

export function EmptyState({
  title = 'Sin registros',
  message = 'Aún no hay nada que mostrar aquí.',
  action,
}: {
  title?: string;
  message?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="panel-state">
      <p className="panel-state-title">{title}</p>
      <p className="panel-state-msg">{message}</p>
      {action}
    </div>
  );
}

export function ErrorState({
  title = 'Algo salió mal',
  message,
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="panel-state" role="alert">
      <p className="panel-state-title">{title}</p>
      <p className="panel-state-msg">{message ?? 'No se pudieron cargar los datos.'}</p>
      {onRetry && (
        <button type="button" className="pbtn pbtn--ghost" onClick={onRetry}>
          Reintentar
        </button>
      )}
    </div>
  );
}

/** Fila de skeletons para tablas mientras carga. */
export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="panel-table-wrap" aria-hidden="true">
      <table className="panel-table">
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r}>
              {Array.from({ length: cols }).map((__, c) => (
                <td key={c}>
                  <span className="panel-skeleton" style={{ width: `${40 + ((c * 17) % 50)}%` }} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Badge de estado activo/inactivo o default. */
export function Badge({
  children,
  tone = 'off',
}: {
  children: React.ReactNode;
  tone?: 'on' | 'off' | 'blue' | 'ro';
}) {
  return <span className={`panel-badge panel-badge--${tone}`}>{children}</span>;
}

/**
 * Badge de "solo lectura": se muestra cuando la sesión NO tiene permiso de
 * escritura en el módulo, para explicar por qué las acciones están ocultas.
 */
export function ReadOnlyBadge() {
  return <Badge tone="ro">Solo lectura</Badge>;
}
