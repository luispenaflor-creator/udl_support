// Catálogo de planteles (tabla public.campuses). Si la tabla aún no existe, se usa la lista institucional fija.
import { cache } from 'react';
import { CAMPUS } from './types';
import type { access } from './auth';

type Db = Awaited<ReturnType<typeof access>>['s'];
export type Campus = { id: string; name: string; address: string | null; active: boolean; created_at?: string };

// Una sola consulta por petición aunque varios componentes la pidan.
export const loadCampuses = cache(async (s: Db): Promise<{ list: Campus[]; fromDb: boolean }> => {
  const { data, error } = await s.from('campuses').select('*').order('name');
  if (error || !data) return { list: CAMPUS.map((name) => ({ id: name, name, address: null, active: true })), fromDb: false };
  return { list: data as Campus[], fromDb: true };
});

// Nombres de planteles activos, para filtros y formularios.
export async function campusNames(s: Db): Promise<string[]> {
  return (await loadCampuses(s)).list.filter((c) => c.active).map((c) => c.name);
}

// Para validar valores recibidos se aceptan también planteles desactivados (tickets antiguos los conservan).
export async function allCampusNames(s: Db): Promise<string[]> {
  return (await loadCampuses(s)).list.map((c) => c.name);
}
