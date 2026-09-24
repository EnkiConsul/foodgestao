import { Wallet } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import type { CompanyAccount } from "@/hooks/useCompanyAccounts";

interface Props {
  accounts: CompanyAccount[];
  /** null = todas as contas. Lista = somente as contas marcadas. */
  value: string[] | null;
  onChange: (next: string[] | null) => void;
  /** Perfis com acesso total sempre veem todas as contas. */
  bloqueado?: boolean;
  nomeEmpresa?: string;
}

export function AccountAccessPicker({ accounts, value, onChange, bloqueado, nomeEmpresa }: Props) {
  const todas = value === null;
  const marcadas = value ?? [];

  const toggle = (id: string, checked: boolean) => {
    onChange(checked ? [...new Set([...marcadas, id])] : marcadas.filter((x) => x !== id));
  };

  return (
    <div className="space-y-2 rounded-lg border bg-card p-3">
      <div className="flex items-center gap-2">
        <Wallet className="h-4 w-4 text-primary" />
        <Label className="text-sm font-semibold">
          Contas financeiras{nomeEmpresa ? ` — ${nomeEmpresa}` : ""}
        </Label>
        {!todas && (
          <Badge variant="secondary" className="ml-auto text-[11px]">
            {marcadas.length} de {accounts.length}
          </Badge>
        )}
      </div>

      <label className="flex min-h-11 items-center justify-between gap-3 rounded-md border px-3 text-sm">
        <span>Todas as contas da empresa</span>
        <Switch
          checked={todas || bloqueado}
          disabled={bloqueado}
          onCheckedChange={(c) => onChange(c ? null : [])}
        />
      </label>

      {!todas && !bloqueado && (
        <>
          {accounts.length === 0 ? (
            <p className="text-xs text-muted-foreground">Esta empresa ainda não tem contas cadastradas.</p>
          ) : (
            <>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded-md border bg-background px-2.5 py-1 text-[11px] font-medium hover:bg-accent"
                  onClick={() => onChange(accounts.map((a) => a.id))}
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
                {accounts.map((a) => (
                  <label
                    key={a.id}
                    className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border p-2.5 text-sm active:bg-accent/40"
                  >
                    <Checkbox
                      checked={marcadas.includes(a.id)}
                      onCheckedChange={(ch) => toggle(a.id, ch === true)}
                    />
                    <span className="min-w-0 flex-1 break-words">
                      {a.name}
                      {!a.is_active && <span className="ml-1 text-xs text-muted-foreground">(inativa)</span>}
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
          ? "Donos e administradores sempre veem todas as contas."
          : "O usuário só vê saldos, extratos e lançamentos das contas marcadas."}
      </p>
    </div>
  );
}
