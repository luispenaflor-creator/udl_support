// La API de Supabase (PostgREST) devuelve como máximo 1,000 filas por petición.
// fetchAll pide páginas consecutivas con range() hasta reunir todo o llegar a `max`.
// La consulta debe tener un orden estable (p. ej. created_at + id) para no repetir ni saltar filas.

const PAGE = 1000;
// `data` se recibe sin tipar porque el tipo inferido por supabase-js depende del select; el llamador indica T.
type Page = PromiseLike<{ data: unknown; error: { message: string } | null }>;

export async function fetchAll<T>(page: (from: number, to: number) => Page, max = 20000): Promise<{ data: T[]; error: { message: string } | null; truncated: boolean }> {
  const out: T[] = [];
  for (let from = 0; from < max; from += PAGE) {
    const to = Math.min(from + PAGE, max) - 1;
    const { data, error } = await page(from, to);
    if (error) return { data: out, error, truncated: false };
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < to - from + 1) return { data: out, error: null, truncated: false };
  }
  return { data: out, error: null, truncated: true };
}
