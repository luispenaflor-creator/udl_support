'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [recovery, setRecovery] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const supabase = useMemo(() => createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
  ), []);

  useEffect(() => {
    const isRecoveryLink = () => {
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const query = new URLSearchParams(window.location.search);
      if (hash.get('type') === 'recovery' || query.get('type') === 'recovery') {
        setRecovery(true);
        setMessage('Crea una contraseña nueva para tu cuenta.');
      }
    };
    isRecoveryLink();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setRecovery(true);
        setMessage('Crea una contraseña nueva para tu cuenta.');
      }
    });
    return () => subscription.unsubscribe();
  }, [supabase]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(result.error || 'No se pudo iniciar sesión. Revisa el correo y la contraseña.');
        setBusy(false);
        return;
      }
      const sessionCheck = await fetch('/auth/session-check', { cache: 'no-store' });
      const sessionStatus = await sessionCheck.json().catch(() => ({}));
      if (!sessionCheck.ok) {
        setError(sessionStatus.error || 'La cuenta se validó, pero no se pudo abrir el panel.');
        setBusy(false);
        return;
      }
      window.location.replace('/');
    } catch {
      setError('No se pudo conectar con UDL Support. Comprueba que el programa siga abierto.');
      setBusy(false);
    }
  }

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setBusy(true);
    // Supabase normalmente procesa la sesión de recuperación al cargar la página.
    // Si aún no aparece, intenta restaurarla desde los tokens del enlace del correo.
    let { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (!session && !sessionError) {
      const recoveryParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const accessToken = recoveryParams.get('access_token');
      const refreshToken = recoveryParams.get('refresh_token');
      if (accessToken && refreshToken) {
        const restored = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        session = restored.data.session;
        sessionError = restored.error;
      }
    }
    if (sessionError || !session) {
      setBusy(false);
      setError(sessionError?.message || 'El enlace no creó una sesión válida. Solicita un correo de recuperación nuevo y ábrelo una sola vez.');
      return;
    }
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setBusy(false);
      setError(`Supabase no aceptó el cambio: ${updateError.message}`);
      return;
    }
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      setBusy(false);
      setError(`La contraseña sí se actualizó, pero no se pudo cerrar la sesión: ${signOutError.message}. Ya puedes probar el inicio de sesión.`);
      return;
    }
    window.history.replaceState({}, '', '/login');
    setPassword('');
    setConfirmPassword('');
    setRecovery(false);
    setBusy(false);
    setMessage('Contraseña actualizada. Ahora inicia sesión con la contraseña nueva.');
  }

  return (
    <main className="card" style={{ maxWidth: 420, margin: '10vh auto' }}>
      <div className="brand">UDL <span>Support</span></div>
      <p className="muted">Mesa de ayuda · Universidad de Londres</p>
      {recovery ? (
        <form onSubmit={updatePassword} className="form">
          <h2>Nueva contraseña</h2>
          <p className="muted">Escribe y confirma la contraseña que usarás para entrar.</p>
          <label>Contraseña nueva<input autoComplete="new-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} /></label>
          <label>Confirma la contraseña<input autoComplete="new-password" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required minLength={8} /></label>
          {message && <p role="status">{message}</p>}
          {error && <p role="alert">{error}</p>}
          <button disabled={busy}>{busy ? 'Guardando…' : 'Guardar contraseña nueva'}</button>
        </form>
      ) : (
        <form onSubmit={signIn} className="form">
          <label>Correo<input autoComplete="email" name="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          <label>Contraseña<input autoComplete="current-password" name="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
          {message && <p role="status">{message}</p>}
          {error && <p role="alert">{error}</p>}
          <button disabled={busy}>{busy ? 'Entrando…' : 'Iniciar sesión'}</button>
        </form>
      )}
    </main>
  );
}
