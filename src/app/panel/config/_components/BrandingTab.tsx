'use client';

/**
 * Branding del tenant: logo (URL) y color de marca, con preview simple. Guarda
 * vía PATCH (RPC set_org_branding). Escritura gated por config/configurar.
 */

import { useEffect, useState } from 'react';
import { getBranding, updateBranding } from '../../_lib/config';
import { useAsyncData } from '../../_lib/hooks';
import { LoadingState, ErrorState, ReadOnlyBadge } from '../../_components/States';
import { TextField } from '../../_components/Field';

const DEFAULT_COLOR = '#2563eb';

export function BrandingTab({ canWrite }: { canWrite: boolean }) {
  const { data, loading, error, reload } = useAsyncData(getBranding);
  const [logoUrl, setLogoUrl] = useState('');
  const [brandColor, setBrandColor] = useState(DEFAULT_COLOR);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data) {
      setLogoUrl(data.logoUrl ?? '');
      setBrandColor(data.brandColor ?? DEFAULT_COLOR);
    }
  }, [data]);

  if (loading) return <LoadingState label="Cargando branding…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const submit = async () => {
    if (!canWrite || saving) return;
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      await updateBranding({
        logoUrl: logoUrl.trim() || null,
        brandColor: brandColor || null,
      });
      setSaved(true);
      reload();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="panel-page-head">
        <div>
          <h3 className="panel-page-title" style={{ fontSize: 'var(--fs-lg, 1.1rem)' }}>
            Marca
          </h3>
          <p className="panel-page-sub">Logo y color de tu organización: {data?.name}.</p>
        </div>
        {!canWrite && <ReadOnlyBadge />}
      </div>

      {saveError && (
        <p className="panel-field-error" role="alert" style={{ marginBottom: 'var(--sp-2)' }}>
          {saveError}
        </p>
      )}
      {saved && !saveError && (
        <p className="panel-field-hint" role="status" style={{ marginBottom: 'var(--sp-2)' }}>
          Cambios guardados.
        </p>
      )}

      <div style={{ display: 'flex', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>
        <fieldset
          disabled={!canWrite}
          style={{ border: 0, padding: 0, margin: 0, flex: '1 1 280px', minWidth: 260 }}
        >
          <TextField
            label="URL del logo"
            name="logoUrl"
            value={logoUrl}
            onChange={setLogoUrl}
            placeholder="https://…"
            hint="Enlace público a la imagen del logo."
          />
          <div className="panel-field">
            <label className="panel-field-label" htmlFor="brandColor">
              Color de marca
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
              <input
                id="brandColor"
                name="brandColor"
                type="color"
                value={/^#[0-9a-fA-F]{6}$/.test(brandColor) ? brandColor : DEFAULT_COLOR}
                onChange={(e) => setBrandColor(e.target.value)}
                aria-label="Color de marca"
                style={{ width: 44, height: 36, padding: 0, border: 'none', background: 'none' }}
              />
              <input
                className="panel-input"
                value={brandColor}
                onChange={(e) => setBrandColor(e.target.value)}
                aria-label="Color de marca (hex)"
                style={{ maxWidth: 140 }}
              />
            </div>
          </div>
        </fieldset>

        <div style={{ flex: '1 1 240px', minWidth: 220 }}>
          <span className="panel-field-label">Vista previa</span>
          <div
            style={{
              marginTop: 'var(--sp-1)',
              border: '1px solid var(--panel-border, #e5e7eb)',
              borderRadius: 8,
              padding: 'var(--sp-3)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--sp-2)',
            }}
          >
            {logoUrl.trim() ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt="Logo"
                style={{ height: 40, width: 'auto', maxWidth: 120, objectFit: 'contain' }}
              />
            ) : (
              <div
                style={{
                  height: 40,
                  width: 40,
                  borderRadius: 8,
                  background: brandColor,
                }}
                aria-hidden="true"
              />
            )}
            <span
              style={{
                fontWeight: 600,
                color: /^#[0-9a-fA-F]{6}$/.test(brandColor) ? brandColor : undefined,
              }}
            >
              {data?.name}
            </span>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 'var(--sp-3)' }}>
        <button type="button" className="pbtn pbtn--primary" disabled={!canWrite || saving} onClick={submit}>
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>
  );
}
