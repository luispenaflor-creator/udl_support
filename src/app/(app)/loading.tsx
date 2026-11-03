export default function Loading() {
  return (
    <div className="dash" role="status" aria-live="polite">
      <span className="sr-only">Cargando panel…</span>
      <div className="glass skeleton" style={{ height: 132 }} />
      <section className="stats">
        {[0, 1, 2, 3].map((i) => <div key={i} className="glass skeleton" style={{ height: 150 }} />)}
      </section>
      <div className="glass skeleton" style={{ height: 320 }} />
    </div>
  );
}
