import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";

const secoes = [
  ["dados", "Dados"], ["setores", "Setores"], ["funcionamento", "Horários"],
  ["feriados", "Feriados"], ["sindicato", "Sindicato"],
];

export function UnidadeTabsBar({ value }: { value: string }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [bordas, setBordas] = useState({ esquerda: false, direita: false });

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const atualizar = () => setBordas({
      esquerda: el.scrollLeft > 2,
      direita: el.scrollWidth - el.clientWidth - el.scrollLeft > 2,
    });
    const mostrarAtiva = () => {
      const ativa = el.querySelector<HTMLElement>('[data-state="active"]');
      if (ativa) {
        const margem = 32;
        const inicio = ativa.offsetLeft;
        const fim = inicio + ativa.offsetWidth;
        const reduzido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (inicio < el.scrollLeft + margem) el.scrollTo({ left: Math.max(0, inicio - margem), behavior: reduzido ? "auto" : "smooth" });
        else if (fim > el.scrollLeft + el.clientWidth - margem) el.scrollTo({ left: fim - el.clientWidth + margem, behavior: reduzido ? "auto" : "smooth" });
      }
      atualizar();
    };
    const observer = new ResizeObserver(mostrarAtiva);
    observer.observe(el);
    el.addEventListener("scroll", atualizar, { passive: true });
    mostrarAtiva();
    return () => { observer.disconnect(); el.removeEventListener("scroll", atualizar); };
  }, [value]);

  const deslocar = (sentido: number) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollBy({ left: sentido * el.clientWidth * 0.6, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };

  return (
    <div className="relative min-w-0 shrink-0 border-b px-4 py-2">
      <div ref={scroller} className="relative min-w-0 max-w-full overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <TabsList aria-label="Seções da unidade" className="flex h-auto min-h-12 w-max min-w-full justify-start sm:w-full">
          {secoes.map(([valor, label]) => <TabsTrigger key={valor} value={valor} className="h-11 shrink-0 px-3 sm:flex-1 sm:px-2">{label}</TabsTrigger>)}
        </TabsList>
      </div>
      {bordas.esquerda && <div className="absolute inset-y-2 left-4 flex w-11 items-center bg-gradient-to-r from-background via-background/90 to-transparent">
        <Button type="button" variant="ghost" size="icon" className="h-11 w-7" aria-label="Mostrar abas anteriores" title="Mostrar abas anteriores" onClick={() => deslocar(-1)}><ChevronLeft className="h-4 w-4" /></Button>
      </div>}
      {bordas.direita && <div className="absolute inset-y-2 right-4 flex w-11 items-center justify-end bg-gradient-to-l from-background via-background/90 to-transparent">
        <Button type="button" variant="ghost" size="icon" className="h-11 w-7" aria-label="Mostrar próximas abas" title="Mostrar próximas abas" onClick={() => deslocar(1)}><ChevronRight className="h-4 w-4" /></Button>
      </div>}
    </div>
  );
}