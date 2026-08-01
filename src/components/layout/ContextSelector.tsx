import { User, Building2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCompanyContext } from "@/hooks/useCompanyContext";

export function ContextSelector() {
  const { contextType, selectedCompanyId, companies, setContext } = useCompanyContext();

  // PF só aparece se o usuário estiver ativamente em PF (legado) — novos cadastros são PJ.
  const isLegacyPf = contextType === "pf";
  const currentValue = contextType === "pf" ? "pf|null" : `pj|${selectedCompanyId}`;

  const handleChange = (val: string) => {
    const [type, companyId] = val.split("|");
    setContext(type as "pf" | "pj", companyId === "null" ? null : companyId);
  };

  return (
    <Select value={currentValue} onValueChange={handleChange}>
      <SelectTrigger
        aria-label="Selecionar contexto (pessoal ou empresa)"
        className="h-9 w-auto min-w-0 max-w-[42vw] shrink text-xs gap-1.5 border-dashed md:h-8 md:w-[180px] md:max-w-none"
      >
        {contextType === "pf" ? (
          <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <SelectValue placeholder="Selecione a empresa" />
      </SelectTrigger>
      <SelectContent>
        {isLegacyPf && (
          <SelectItem value="pf|null">
            <span className="flex items-center gap-2">
              <User className="h-3.5 w-3.5" /> Pessoal
            </span>
          </SelectItem>
        )}
        {companies.map((c) => (
          <SelectItem key={c.id} value={`pj|${c.id}`}>
            <span className="flex items-center gap-2">
              <Building2 className="h-3.5 w-3.5" />
              <span className="truncate max-w-[140px]">{c.trade_name || c.name}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
