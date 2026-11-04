'use client';

import { createBrowserClient } from '@supabase/ssr';

// Cliente del navegador (usa la sesión guardada en cookies). Una sola instancia por pestaña.
let client: ReturnType<typeof createBrowserClient> | null = null;

export function browserDb() {
  client ??= createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
  );
  return client;
}
