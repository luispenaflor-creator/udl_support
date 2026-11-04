'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Icon, type IconName } from '@/components/Icon';

type Mode = 'login' | 'forgot' | 'recovery';

const FEATURES: { icon: IconName; title: string; text: string }[] = [
  { icon: 'ticket', title: 'Pide soporte en minutos', text: 'Reporta fallas de equipo, red, correo o accesos desde cualquier plantel.' },
  { icon: 'bell', title: 'Entérate de cada avance', text: 'Recibe avisos cuando un agente toma tu solicitud o te responde.' },
  { icon: 'star', title: 'Califica la atención', text: 'Tu opinión ayuda a mejorar el servicio de soporte.' },
];

export default function Login() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
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
        setMode('recovery');
        setMessage('Crea una contraseña nueva para tu cuenta.');
      }
    };
    isRecoveryLink();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setMode('recovery');
        setMessage('Crea una contraseña nueva para tu cuenta.');
      }
    });
    return () => subscription.unsubscribe();
  }, [supabase]);

  const go = (m: Mode) => { setMode(m); setError(''); setMessage(''); };

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
      setError('No se pudo conectar con UDL Support. Revisa tu conexión a internet e intenta de nuevo.');
      setBusy(false);
    }
  }

  // Envía el correo de recuperación. El mensaje es el mismo exista o no la cuenta, para no revelar correos registrados.
  async function sendRecovery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const { error: e } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/login` });
    setBusy(false);
    if (e && /rate|limit|seconds/i.test(e.message)) {
      setError('Ya se envió un correo hace poco. Espera unos minutos e intenta de nuevo.');
      return;
    }
    setMessage('Si el correo está registrado, te enviamos un enlace para crear una contraseña nueva. Revisa también la carpeta de spam.');
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
    setMode('login');
    setBusy(false);
    setMessage('Contraseña actualizada. Ahora inicia sesión con la contraseña nueva.');
  }

  const passwordField = (label: string, value: string, set: (v: string) => void, auto: string, id: string) => (
    <label className="login-field" htmlFor={id}>
      <span>{label}</span>
      <span className="input-wrap">
        <Icon name="lock" size={18} />
        <input id={id} autoComplete={auto} type={showPass ? 'text' : 'password'} value={value} onChange={(e) => set(e.target.value)} required minLength={mode === 'login' ? undefined : 8} />
        <button type="button" className="peek" onClick={() => setShowPass((s) => !s)} aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={showPass}>
          <Icon name={showPass ? 'eyeOff' : 'eye'} size={17} />
        </button>
      </span>
    </label>
  );

  return (
    <main className="login">
      <section className="login-brand">
        <div className="brand login-logo"><span className="brand-mark" aria-hidden="true">U</span><span className="brand-text">UDL <span>Support</span></span></div>
        <h1>La mesa de ayuda de la <span className="grad">Universidad de Londres</span></h1>
        <p className="login-lead">Un solo lugar para pedir soporte tecnológico y seguir cada solicitud en los planteles de la universidad.</p>
        <ul className="login-features">
          {FEATURES.map((f, i) => (
            <li key={f.title} style={{ '--d': `${200 + i * 120}ms` } as React.CSSProperties}>
              <span className="lf-icon"><Icon name={f.icon} size={20} /></span>
              <span><strong>{f.title}</strong><small>{f.text}</small></span>
            </li>
          ))}
        </ul>
        <div className="login-orb" aria-hidden="true" />
      </section>

      <section className="login-card glass" aria-labelledby="login-title">
        {mode === 'recovery' ? (
          <form onSubmit={updatePassword} className="form login-form">
            <span className="login-kicker"><Icon name="key" size={16} />Recuperación</span>
            <h2 id="login-title">Crea tu contraseña nueva</h2>
            <p className="muted">Escríbela dos veces. Debe tener al menos 8 caracteres.</p>
            {passwordField('Contraseña nueva', password, setPassword, 'new-password', 'new-pass')}
            {passwordField('Confirma la contraseña', confirmPassword, setConfirmPassword, 'new-password', 'confirm-pass')}
            {message && <p className="login-msg ok" role="status">{message}</p>}
            {error && <p role="alert">{error}</p>}
            <button className="login-submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar contraseña nueva'}</button>
          </form>
        ) : mode === 'forgot' ? (
          <form onSubmit={sendRecovery} className="form login-form">
            <span className="login-kicker"><Icon name="key" size={16} />¿Olvidaste tu contraseña?</span>
            <h2 id="login-title">Te enviamos un enlace</h2>
            <p className="muted">Escribe tu correo institucional y te mandaremos un enlace para crear una contraseña nueva.</p>
            <label className="login-field" htmlFor="forgot-email"><span>Correo</span>
              <span className="input-wrap"><Icon name="mail" size={18} />
                <input id="forgot-email" autoComplete="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="nombre@udlondres.com" />
              </span>
            </label>
            {message && <p className="login-msg ok" role="status">{message}</p>}
            {error && <p role="alert">{error}</p>}
            <button className="login-submit" disabled={busy}>{busy ? 'Enviando…' : 'Enviar enlace'}</button>
            <button type="button" className="link-btn back-login" onClick={() => go('login')}><Icon name="arrowRight" size={14} className="flip" />Volver a iniciar sesión</button>
          </form>
        ) : (
          <form onSubmit={signIn} className="form login-form">
            <span className="login-kicker"><Icon name="sparkle" size={16} />Bienvenido</span>
            <h2 id="login-title">Inicia sesión</h2>
            <p className="muted">Usa el correo y la contraseña que te dio el área de soporte.</p>
            <label className="login-field" htmlFor="email"><span>Correo</span>
              <span className="input-wrap"><Icon name="mail" size={18} />
                <input id="email" autoComplete="email" name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="nombre@udlondres.com" />
              </span>
            </label>
            {passwordField('Contraseña', password, setPassword, 'current-password', 'password')}
            <button type="button" className="link-btn forgot" onClick={() => go('forgot')}>¿Olvidaste tu contraseña?</button>
            {message && <p className="login-msg ok" role="status">{message}</p>}
            {error && <p role="alert">{error}</p>}
            <button className="login-submit" disabled={busy}>{busy ? 'Entrando…' : <>Entrar<Icon name="arrowRight" size={18} /></>}</button>
            <p className="login-help muted"><Icon name="hand" size={14} />¿No tienes cuenta? Solicítala al área de soporte de tu plantel.</p>
          </form>
        )}
      </section>
    </main>
  );
}
