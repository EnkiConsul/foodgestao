import { Building2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import type { CompanyUnidade } from "@/hooks/useCompanyUnidades";

interface Props {
  unidades: CompanyUnidade[];
  /** null = todas as unidades. Lista = somente as unidades marcadas. */
  value: string[] | null;
  onChange: (next: string[] | null) => void;
  /** Perfis com acesso total sempre veem todas as unidades. */
  bloqueado?: boolean;
  nomeEmpresa?: string;
}

export function UnitAccessPicker({ unidades, value, onChange, bloqueado, nomeEmpresa }: Props) {
  const todas = value === null;
  const marcadas = value ?? [];

  const toggle = (id: string, checked: boolean) => {
    onChange(checked ? [...new Set([...marcadas, id])] : marcadas.filter((x) => x !== id));
  };

  return (
    <div className="space-y-2 rounded-lg border bg-card p-3">
      <div className="flex items-center gap-2">
        <Building2 className="h-4 w-4 text-primary" />
        <Label className="text-sm font-semibold">
          Unidades do Pessoas 360°{nomeEmpresa ? ` — ${nomeEmpresa}` : ""}
        </Label>
        {!todas && (
          <Badge variant="secondary" className="ml-auto text-[11px]">
            {marcadas.length} de {unidades.length}
          </Badge>
        )}
      </div>

      <label className="flex min-h-11 items-center justify-between gap-3 rounded-md border px-3 text-sm">
        <span>Todas as unidades da empresa</span>
        <Switch
          checked={todas || bloqueado}
          disabled={bloqueado}
          onCheckedChange={(c) => onChange(c ? null : [])}
        />
      </label>

      {!todas && !bloqueado && (
        <>
          {unidades.length === 0 ? (
            <p className="text-xs text-muted-foreground">Esta empresa ainda não tem unidades cadastradas.</p>
          ) : (
            <>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded-md border bg-background px-2.5 py-1 text-[11px] font-medium hover:bg-accent"
                  onClick={() => onChange(unidades.map((u) => u.id))}
                >
                  Marcar todas
                </button>
                <button
                  type="button"
                  className="rounded-md border bg-background px-2.5 py-1 text-[11px] font-medium hover:bg-accent"
                  onClick={() => onChange([])}
                >
                  Limpar
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {unidades.map((u) => (
                  <label
                    key={u.id}
                    className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border p-2.5 text-sm active:bg-accent/40"
                  >
                    <Checkbox
                      checked={marcadas.includes(u.id)}
                      onCheckedChange={(ch) => toggle(u.id, ch === true)}
                    />
                    <span className="min-w-0 flex-1 break-words">
                      {u.nome}
                      {!u.ativo && <span className="ml-1 text-xs text-muted-foreground">(inativa)</span>}
                    </span>
                  </label>
                ))}
              </div>
            </>
          )}
        </>
      )}

      <p className="text-[11px] text-muted-foreground">
        {bloqueado
          ? "Donos e administradores sempre acessam todas as unidades."
          : "O usuário só acessa colaboradores, escalas e folgas das unidades marcadas."}
      </p>
    </div>
  );
}
