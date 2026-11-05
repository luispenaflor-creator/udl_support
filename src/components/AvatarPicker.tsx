'use client';

import { useRef, useState } from 'react';
import { Icon } from './Icon';

const SIZE = 400; // px: la foto se recorta en cuadrado y se reduce antes de enviarla (≈ 40–80 KB).

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
}

// Recorta al centro y convierte a JPEG en el navegador; así no se sube la foto original de varios MB.
async function shrink(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, fail) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => fail(new Error('No se pudo leer la imagen'));
      i.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = Math.min(SIZE, side);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Foto de perfil con botón "Examinar". Envía la imagen reducida en el campo oculto `avatar_data`;
 * el servidor la guarda en Storage. También permite quitarla o usar una ruta/URL.
 */
export function AvatarPicker({ id, name, current, presets, canUpload }: { id: string; name: string; current: string | null; presets: string[]; canUpload: boolean }) {
  const [preview, setPreview] = useState<string | null>(current);
  const [data, setData] = useState('');
  const [remove, setRemove] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const pick = async (file: File | undefined) => {
    setError('');
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { setError('Usa una imagen JPG, PNG o WebP'); return; }
    if (file.size > 15 * 1024 * 1024) { setError('La imagen pesa más de 15 MB'); return; }
    setBusy(true);
    try {
      const out = await shrink(file);
      setData(out); setPreview(out); setRemove(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo procesar la imagen');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div className="avatar-picker span-all">
      <span className="ap-preview" aria-hidden="true">
        {preview && !remove ? <img src={preview} alt="" /> : <span>{initials(name)}</span>}
      </span>
      <div className="ap-body">
        <strong>Foto de perfil</strong>
        {canUpload ? (
          <div className="ap-actions">
            <label className="button small ghost-btn ap-browse" htmlFor={`ap-${id}`}>
              <Icon name="upload" size={16} />{busy ? 'Procesando…' : 'Examinar…'}
            </label>
            <input id={`ap-${id}`} ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
            {(preview || data) && !remove && (
              <button type="button" className="link-btn" onClick={() => { setRemove(true); setData(''); }}><Icon name="x" size={14} />Quitar foto</button>
            )}
            {remove && <button type="button" className="link-btn" onClick={() => { setRemove(false); setPreview(current); }}>Deshacer</button>}
          </div>
        ) : <small className="muted">Subir fotos requiere la clave de servicio en el servidor.</small>}
        <small className="muted">{data ? 'Foto lista: se guardará al presionar Guardar.' : 'JPG, PNG o WebP. Se recorta en cuadrado.'}</small>
        {error && <small className="ap-error" role="alert">{error}</small>}
        <input type="hidden" name="avatar_data" value={data} />
        <input type="hidden" name="avatar_remove" value={remove ? '1' : ''} />
        <details className="ap-advanced">
          <summary>Usar una ruta o URL</summary>
          <input name="avatar_url" defaultValue={current ?? ''} list={`avatars-${id}`} placeholder="/avatars/… o https://…  (vacío = iniciales)" />
          <datalist id={`avatars-${id}`}>{presets.map((a) => <option key={a} value={a} />)}</datalist>
        </details>
      </div>
    </div>
  );
}
