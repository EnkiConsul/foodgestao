import { MODULE_LABEL, useActiveModule } from "@/hooks/useActiveModule";

/** Header do /mais — mostra sempre o nome do módulo ativo (fixo no topo).
 *  Não repete o nome da empresa: essa informação já está na topbar mobile. */
export function MoreHeader() {
  const activeModule = useActiveModule();
  const moduleLabel = MODULE_LABEL[activeModule];

  return (
    <header className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b">
      <div className="px-4 py-3">
        <h1 className="text-xl font-semibold tracking-tight truncate">
          {moduleLabel}
        </h1>
        <p className="text-[11px] text-muted-foreground">Menu completo</p>
      </div>
    </header>
  );
}
