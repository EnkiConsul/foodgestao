/** Carregamento discreto entre telas: linha no topo, sem apagar a estrutura. */
export function RouteFallback() {
  return (
    <div className="animate-in fade-in duration-150" aria-busy="true" aria-label="Carregando">
      <div className="fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden bg-primary/15">
        <div className="h-full w-1/3 animate-pulse bg-primary" />
      </div>
      <div className="min-h-[50vh]" />
    </div>
  );
}
