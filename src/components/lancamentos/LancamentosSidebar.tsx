import { useState, type ReactNode } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronDown, CalendarIcon, DollarSign, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MultiSelectFilter } from "@/components/lancamentos/MultiSelectFilter";
import { cn } from "@/lib/utils";

export function FilterSection({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border rounded">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center justify-between w-full px-1.5 py-1 text-[9px] font-semibold text-muted-foreground uppercase tracking-wider hover:bg-muted/50 transition-colors"
      >
        {title}
        <ChevronDown className={cn("h-2.5 w-2.5 transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="px-1.5 pb-1.5">{children}</div>}
    </div>
  );
}

export interface FilterPanelProps {
  accounts: { id: string; name: string }[];
  paymentMethods: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  filterAccount: string[];
  setFilterAccount: (v: string[]) => void;
  filterPaymentMethod: string[];
  setFilterPaymentMethod: (v: string[]) => void;
  filterCategory: string;
  setFilterCategory: (v: string) => void;
  filterCredito: boolean;
  setFilterCredito: (v: boolean) => void;
  filterDebito: boolean;
  setFilterDebito: (v: boolean) => void;
  filterTransferencia: boolean;
  setFilterTransferencia: (v: boolean) => void;
  filterPago: boolean;
  setFilterPago: (v: boolean) => void;
  filterAVencer: boolean;
  setFilterAVencer: (v: boolean) => void;
  filterAtrasado: boolean;
  setFilterAtrasado: (v: boolean) => void;
  dateFrom: Date | undefined;
  setDateFrom: (v: Date | undefined) => void;
  dateTo: Date | undefined;
  setDateTo: (v: Date | undefined) => void;
  clearFilters: () => void;
}

export function FilterPanel(props: FilterPanelProps) {
  const {
    accounts, paymentMethods, categories,
    filterAccount, setFilterAccount,
    filterPaymentMethod, setFilterPaymentMethod,
    filterCategory, setFilterCategory,
    filterCredito, setFilterCredito,
    filterDebito, setFilterDebito,
    filterTransferencia, setFilterTransferencia,
    filterPago, setFilterPago,
    filterAVencer, setFilterAVencer,
    filterAtrasado, setFilterAtrasado,
    dateFrom, setDateFrom,
    dateTo, setDateTo,
    clearFilters,
  } = props;

  return (
    <div className="space-y-1">
      <FilterSection title="Conta">
        <MultiSelectFilter
          value={filterAccount}
          onChange={setFilterAccount}
          options={accounts}
          allLabel="Todas"
          itemLabelSingular="conta"
          itemLabelPlural="contas"
        />
      </FilterSection>

      <FilterSection title="Forma de Pagamento">
        <MultiSelectFilter
          value={filterPaymentMethod}
          onChange={setFilterPaymentMethod}
          options={paymentMethods}
          allLabel="Todas"
          itemLabelSingular="forma"
          itemLabelPlural="formas"
        />
      </FilterSection>

      <FilterSection title="Categoria">
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="mt-0.5 h-6 text-[11px]"><SelectValue placeholder="Todas" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </FilterSection>

      <FilterSection title="Lançamentos">
        <div className="space-y-0.5 mt-0.5">
          <label className="flex items-center gap-1 text-[11px]">
            <Checkbox checked={filterCredito} onCheckedChange={(v) => setFilterCredito(!!v)} className="h-3 w-3" />
            Crédito (Receita)
          </label>
          <label className="flex items-center gap-1 text-[11px]">
            <Checkbox checked={filterDebito} onCheckedChange={(v) => setFilterDebito(!!v)} className="h-3 w-3" />
            Débito (Despesa)
          </label>
          <label className="flex items-center gap-1 text-[11px]">
            <Checkbox checked={filterTransferencia} onCheckedChange={(v) => setFilterTransferencia(!!v)} className="h-3 w-3" />
            Transferências
          </label>
        </div>
      </FilterSection>

      <FilterSection title="Status">
        <div className="space-y-0.5 mt-0.5">
          <label className="flex items-center gap-1 text-[11px]">
            <Checkbox checked={filterPago} onCheckedChange={(v) => setFilterPago(!!v)} className="h-3 w-3" />
            Pago
          </label>
          <label className="flex items-center gap-1 text-[11px]">
            <Checkbox checked={filterAVencer} onCheckedChange={(v) => setFilterAVencer(!!v)} className="h-3 w-3" />
            A Vencer
          </label>
          <label className="flex items-center gap-1 text-[11px]">
            <Checkbox checked={filterAtrasado} onCheckedChange={(v) => setFilterAtrasado(!!v)} className="h-3 w-3" />
            Atrasado
          </label>
        </div>
      </FilterSection>

      <FilterSection title="Período (Vencimento)" defaultOpen={false}>
        <div className="space-y-1 mt-0.5">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn("w-full justify-start text-left font-normal text-[10px] h-6", !dateFrom && "text-muted-foreground")}>
                <CalendarIcon className="mr-1 h-2.5 w-2.5" />
                {dateFrom ? format(dateFrom, "dd/MM/yyyy") : "Data início"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus className={cn("p-3 pointer-events-auto")} locale={ptBR} />
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn("w-full justify-start text-left font-normal text-[10px] h-6", !dateTo && "text-muted-foreground")}>
                <CalendarIcon className="mr-1 h-2.5 w-2.5" />
                {dateTo ? format(dateTo, "dd/MM/yyyy") : "Data fim"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={dateTo} onSelect={setDateTo} initialFocus className={cn("p-3 pointer-events-auto")} locale={ptBR} />
            </PopoverContent>
          </Popover>
          {(dateFrom || dateTo) && (
            <Button variant="ghost" size="sm" className="w-full text-[10px] h-6" onClick={() => { setDateFrom(undefined); setDateTo(undefined); }}>
              <X className="h-2.5 w-2.5 mr-1" /> Limpar período
            </Button>
          )}
        </div>
      </FilterSection>

      <div className="flex gap-1 pt-1">
        <Button size="sm" className="flex-1 h-6 text-[11px]" onClick={() => {}}>Filtrar</Button>
        <Button size="sm" variant="outline" className="flex-1 h-6 text-[11px]" onClick={clearFilters}>Limpar</Button>
      </div>
    </div>
  );
}

export interface SaldosCardProps {
  previousBalance: number;
  saldoPeriodo: number;
  saldoAcumulado: number;
  dates: { prevEnd: string; curEnd: string; curRange: string };
  formatBRL: (n: number) => string;
}

export function SaldosCard({ previousBalance, saldoPeriodo, saldoAcumulado, dates, formatBRL }: SaldosCardProps) {
  const [open, setOpen] = useState(true);
  const rows = [
    { label: "Saldo Anterior", date: dates.prevEnd, value: previousBalance },
    { label: "Saldo do Período", date: dates.curRange, value: saldoPeriodo },
    { label: "Saldo Acumulado", date: dates.curEnd, value: saldoAcumulado },
  ];
  return (
    <Card className="shadow-sm mb-3">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center justify-between w-full px-1.5 py-1.5"
      >
        <div className="flex items-center gap-1.5">
          <DollarSign className="h-3 w-3 text-muted-foreground" />
          <span className="text-[11px] font-semibold">Saldos</span>
        </div>
        <ChevronDown className={cn("h-3 w-3 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="px-1.5 pb-1.5">
          {rows.map((r, i) => (
            <div key={i} className="flex items-end justify-between py-1 border-b last:border-b-0">
              <div>
                <p className="text-[10px] text-muted-foreground leading-tight">{r.label}</p>
                <p className="text-[9px] text-muted-foreground/70 leading-tight">{r.date}</p>
              </div>
              <span className={cn("text-[11px] font-medium", r.value >= 0 ? "text-success" : "text-destructive")}>
                {formatBRL(r.value)}
              </span>
            </div>
          ))}
          <div className="mt-1.5 rounded-md bg-success/10 p-2 flex items-end justify-between">
            <p className="text-[10px] text-muted-foreground">Saldo Atual</p>
            <span className={cn("text-[12px] font-bold", saldoAcumulado >= 0 ? "text-success" : "text-destructive")}>
              {formatBRL(saldoAcumulado)}
            </span>
          </div>
        </div>
      )}
    </Card>
  );
}
