// SOLO SERVIDOR. Clientes de Supabase sin sesión de navegador para operaciones administrativas.
// Nunca importar desde componentes 'use client': la clave de servicio no debe llegar al navegador.
import { createClient } from '@supabase/supabase-js';

const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publicKey = () => (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!;
const noSession = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

export const hasServiceRole = () => Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY !== 'SERVER_ONLY');

// Cliente con privilegios de servicio (Auth Admin API). null si la clave no está configurada.
export function serviceClient() {
  return hasServiceRole() ? createClient(url(), process.env.SUPABASE_SERVICE_ROLE_KEY!, noSession) : null;
}

// Cliente público aislado: no comparte cookies con la sesión del administrador.
export function isolatedPublicClient() {
  return createClient(url(), publicKey(), noSession);
}
