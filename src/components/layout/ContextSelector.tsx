import { Building2, Loader2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";

import { useCompanyContext } from "@/hooks/useCompanyContext";

export function ContextSelector() {
  const { selectedCompanyId, companies, setContext, syncing } = useCompanyContext();

  const currentValue = `pj|${selectedCompanyId}`;
  const currentLabel =
    companies.find((c) => c.id === selectedCompanyId)?.trade_name ||
    companies.find((c) => c.id === selectedCompanyId)?.name ||
    "";

  const handleChange = (val: string) => {
    const [, companyId] = val.split("|");
    setContext("pj", companyId === "null" ? null : companyId);
  };

  return (
    <Select value={currentValue} onValueChange={handleChange}>
      <SelectTrigger
        aria-label="Selecionar empresa"
        aria-busy={syncing}
        className="h-9 w-auto min-w-0 max-w-[42vw] shrink text-xs gap-1.5 border-dashed md:h-8 md:w-[180px] md:max-w-none"
      >
        {syncing ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1 truncate text-left">
          {currentLabel || "Selecione a empresa"}
        </span>
      </SelectTrigger>

      <SelectContent>
        {companies.map((c) => (
          <SelectItem key={c.id} value={`pj|${c.id}`}>
            <span className="flex items-center gap-2">
              <Building2 aria-hidden className="h-3.5 w-3.5" />
              <span className="truncate max-w-[220px]">{c.trade_name || c.name}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
