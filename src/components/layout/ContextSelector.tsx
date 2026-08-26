import { User, Building2, Loader2 } from "lucide-react";
import { SelectItemText } from "@radix-ui/react-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useLegacyPfData } from "@/hooks/useLegacyPfData";

export function ContextSelector() {
  const { contextType, selectedCompanyId, companies, setContext, syncing } = useCompanyContext();
  const legacyPf = useLegacyPfData();

  // "Pessoal" só aparece para quem está em PF agora ou tem dados PF legados —
  // contas novas são PJ-first e nunca veem o espaço pessoal vazio.
  const isLegacyPf = contextType === "pf" || legacyPf.data === true;
  const currentValue = contextType === "pf" ? "pf|null" : `pj|${selectedCompanyId}`;

  const handleChange = (val: string) => {
    const [type, companyId] = val.split("|");
    setContext(type as "pf" | "pj", companyId === "null" ? null : companyId);
  };

  return (
    <Select value={currentValue} onValueChange={handleChange}>
      <SelectTrigger
        aria-label="Selecionar contexto (pessoal ou empresa)"
        aria-busy={syncing}
        className="h-9 w-auto min-w-0 max-w-[42vw] shrink text-xs gap-1.5 border-dashed md:h-8 md:w-[180px] md:max-w-none"
      >
        {syncing ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
        ) : contextType === "pf" ? (
          <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <SelectValue placeholder="Selecione a empresa" />
      </SelectTrigger>

      <SelectContent>
        {isLegacyPf && (
          <SelectItem value="pf|null" textValue="Pessoal">
            <span className="flex items-center gap-2">
              <User aria-hidden className="h-3.5 w-3.5" />
              <SelectItemText>Pessoal</SelectItemText>
            </span>
          </SelectItem>
        )}
        {companies.map((c) => (
          <SelectItem key={c.id} value={`pj|${c.id}`} textValue={c.trade_name || c.name}>
            <span className="flex items-center gap-2">
              <Building2 aria-hidden className="h-3.5 w-3.5" />
              <SelectItemText>
                <span className="truncate max-w-[140px]">{c.trade_name || c.name}</span>
              </SelectItemText>
            </span>
          </SelectItem>
        ))}
      </SelectContent>

    </Select>
  );
}
