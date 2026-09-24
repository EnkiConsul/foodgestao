import { Building2, Lock } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import type { AdminCompany } from "@/hooks/useAdminCompanies";

interface Props {
  companies: AdminCompany[];
  selected: string[];
  onChange: (ids: string[]) => void;
  /** Empresa que não pode ser desmarcada (a que está aberta na tela). */
  lockedId?: string;
  ajuda?: string;
}

export function CompanyAccessPicker({ companies, selected, onChange, lockedId, ajuda }: Props) {
  const toggle = (id: string, checked: boolean) => {
    if (id === lockedId) return;
    onChange(checked ? [...new Set([...selected, id])] : selected.filter((x) => x !== id));
  };

  return (
    <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
      <div className="flex items-center gap-2">
        <Building2 className="h-4 w-4 text-primary" />
        <Label className="text-sm font-semibold">Empresas com acesso *</Label>
        <Badge variant="secondary" className="ml-auto text-[11px]">
          {selected.length} de {companies.length}
        </Badge>
      </div>

      {companies.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhuma empresa disponível.</p>
      ) : (
        <>
          {companies.length > 1 && (
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded-md border bg-background px-2.5 py-1 text-[11px] font-medium hover:bg-accent"
                onClick={() => onChange(companies.map((c) => c.id))}
              >
                Marcar todas
              </button>
              <button
                type="button"
                className="rounded-md border bg-background px-2.5 py-1 text-[11px] font-medium hover:bg-accent"
                onClick={() => onChange(lockedId ? [lockedId] : [])}
              >
                Limpar
              </button>
            </div>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            {companies.map((c) => {
              const locked = c.id === lockedId;
              const checked = selected.includes(c.id) || locked;
              return (
                <label
                  key={c.id}
                  className={`flex min-h-12 items-center gap-3 rounded-lg border bg-card p-3 text-sm ${
                    locked ? "opacity-80" : "cursor-pointer active:bg-accent/40"
                  }`}
                >
                  <Checkbox
                    checked={checked}
                    disabled={locked}
                    onCheckedChange={(ch) => toggle(c.id, ch === true)}
                  />
                  <span className="min-w-0 flex-1 break-words">{c.name}</span>
                  {locked && <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                </label>
              );
            })}
          </div>
        </>
      )}

      <p className="text-[11px] text-muted-foreground">
        {ajuda ?? "As permissões abaixo valem para as empresas marcadas. Depois você pode ajustar empresa por empresa."}
      </p>
    </div>
  );
}
