import { useEffect, useState, type ReactNode } from "react";
import { CalendarIcon, Search, SlidersHorizontal, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { formatDate, parseFlexibleDate } from "@/lib/date-utils";
import { cn } from "@/lib/utils";

/** Campo de busca com debounce de 300 ms. */
export function BuscaDebounce({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const [txt, setTxt] = useState(value);
  useEffect(() => setTxt(value), [value]);
  useEffect(() => {
    if (txt === value) return;
    const t = setTimeout(() => onChange(txt), 300);
    return () => clearTimeout(t);
  }, [txt]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="relative w-full md:w-72">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input value={txt} onChange={(e) => setTxt(e.target.value)} placeholder={placeholder} className="pl-8" aria-label="Buscar" />
    </div>
  );
}

export function SelectFiltro({ value, onChange, options, label, className }: {
  value: string; onChange: (v: string) => void; options: [string, string][]; label: string; className?: string;
}) {
  return (
    <Select value={value || "_"} onValueChange={(v) => onChange(v === "_" ? "" : v)}>
      <SelectTrigger className={cn("w-full md:w-44", className)} aria-label={label}><SelectValue /></SelectTrigger>
      <SelectContent>
        {options.map(([k, v]) => <SelectItem key={k || "_"} value={k || "_"}>{v}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

const toIso = (d?: Date) =>
  d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : "";

function CampoData({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const [open, setOpen] = useState(false);
  const d = value ? parseFlexibleDate(value) ?? undefined : undefined;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn("h-9 flex-1 md:w-[7.5rem] justify-start font-normal", !value && "text-muted-foreground")}>
          <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
          {value ? formatDate(value, "dd/MM/yy") : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" selected={d} onSelect={(x) => { onChange(toIso(x)); setOpen(false); }} initialFocus className="pointer-events-auto" />
        {value && (
          <div className="p-2 border-t"><Button size="sm" variant="ghost" className="w-full" onClick={() => { onChange(""); setOpen(false); }}>Limpar data</Button></div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function Intervalo({ label, de, ate, onChange }: { label: string; de: string; ate: string; onChange: (de: string, ate: string) => void }) {
  return (
    <div className="flex items-center gap-1.5 w-full md:w-auto">
      <span className="text-xs text-muted-foreground w-16 md:w-auto shrink-0">{label}</span>
      <CampoData value={de} placeholder="De" onChange={(v) => onChange(v, ate)} />
      <CampoData value={ate} placeholder="Até" onChange={(v) => onChange(de, v)} />
    </div>
  );
}

export function Chips({ opcoes, ativos, onToggle }: { opcoes: [string, string][]; ativos: string[]; onToggle: (k: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {opcoes.map(([k, v]) => {
        const on = ativos.includes(k);
        return (
          <Button key={k} type="button" size="sm" variant={on ? "default" : "outline"} aria-pressed={on}
            className="h-7 rounded-full px-3 text-xs" onClick={() => onToggle(k)}>
            {v}
          </Button>
        );
      })}
    </div>
  );
}

/** Desktop: filtros em linha; celular: gaveta com contagem. */
export function BarraFiltros({ ativos, onLimpar, children, extra }: { ativos: number; onLimpar: () => void; children: ReactNode; extra?: ReactNode }) {
  return (
    <>
      <div className="hidden md:flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {children}
          {ativos > 0 && (
            <Button size="sm" variant="ghost" onClick={onLimpar}><X className="h-4 w-4 mr-1" />Limpar filtros</Button>
          )}
        </div>
        {extra}
      </div>
      <div className="md:hidden flex items-center gap-2">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" className="flex-1">
              <SlidersHorizontal className="h-4 w-4 mr-2" />Filtros{ativos > 0 ? ` (${ativos})` : ""}
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
            <SheetHeader><SheetTitle>Filtros</SheetTitle></SheetHeader>
            <div className="flex flex-col gap-3 py-4">
              {children}
              {extra}
              {ativos > 0 && <Button variant="outline" onClick={onLimpar}>Limpar filtros</Button>}
            </div>
          </SheetContent>
        </Sheet>
        {ativos > 0 && <Badge variant="secondary">{ativos} ativo{ativos > 1 ? "s" : ""}</Badge>}
      </div>
    </>
  );
}
