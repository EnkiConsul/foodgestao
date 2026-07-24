import { useState } from "react";
import { Loader2, CreditCard, Landmark, Link2Off } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  useOpenFinanceAccounts,
  useLocalBankAccounts,
  useLocalCreditCards,
  useLinkOpenFinanceAccount,
  type OpenFinanceAccount,
} from "@/hooks/useOpenFinance";

const NONE = "__none__";

interface Props {
  open: boolean;
  onClose: () => void;
  connectionId: string | null;
  companyId: string;
  institutionName?: string | null;
}

function AccountRow({
  acc, companyId, bankOptions, cardOptions, saving,
  onSave,
}: {
  acc: OpenFinanceAccount;
  companyId: string;
  bankOptions: ReturnType<typeof useLocalBankAccounts>["data"];
  cardOptions: ReturnType<typeof useLocalCreditCards>["data"];
  saving: boolean;
  onSave: (input: {
    of_account_id: string;
    local_account_id?: string | null;
    local_credit_card_id?: string | null;
    auto_import?: boolean;
  }) => void;
}) {
  const isCredit = acc.provider_type === "CREDIT";
  const [linked, setLinked] = useState<string>(
    isCredit ? (acc.local_credit_card_id ?? NONE) : (acc.local_account_id ?? NONE),
  );
  const [auto, setAuto] = useState<boolean>(acc.auto_import);

  const dirty =
    (isCredit
      ? (acc.local_credit_card_id ?? NONE) !== linked
      : (acc.local_account_id ?? NONE) !== linked) ||
    auto !== acc.auto_import;

  const options = isCredit ? cardOptions : bankOptions;

  return (
    <div className="rounded-lg border p-3 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          {isCredit ? (
            <CreditCard className="w-4 h-4 mt-0.5 text-muted-foreground" />
          ) : (
            <Landmark className="w-4 h-4 mt-0.5 text-muted-foreground" />
          )}
          <div className="min-w-0">
            <div className="font-medium text-sm truncate">
              {acc.provider_marketing_name || acc.provider_name || (isCredit ? "Cartão" : "Conta")}
            </div>
            <div className="text-xs text-muted-foreground truncate">
              {acc.provider_number_masked ?? "—"}
              {acc.currency_code ? ` · ${acc.currency_code}` : ""}
            </div>
          </div>
        </div>
        <Badge variant={isCredit ? "secondary" : "outline"} className="shrink-0">
          {isCredit ? "Cartão" : "Conta"}
        </Badge>
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">
            {isCredit ? "Cartão de crédito local" : "Conta bancária local"}
          </label>
          <Select value={linked} onValueChange={setLinked}>
            <SelectTrigger>
              <SelectValue placeholder="Não vinculado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>
                <span className="inline-flex items-center gap-2 text-muted-foreground">
                  <Link2Off className="w-3 h-3" /> Não vinculado
                </span>
              </SelectItem>
              {(options ?? []).map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.name}
                  {isCredit && "last4" in o && o.last4 ? ` · •${o.last4}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2 pb-1.5">
          <Switch
            id={`auto-${acc.id}`}
            checked={auto}
            onCheckedChange={setAuto}
            disabled={linked === NONE}
          />
          <label htmlFor={`auto-${acc.id}`} className="text-xs">
            Importar automaticamente
          </label>
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          size="sm"
          disabled={!dirty || saving}
          onClick={() =>
            onSave({
              of_account_id: acc.id,
              local_account_id: !isCredit ? (linked === NONE ? null : linked) : undefined,
              local_credit_card_id: isCredit ? (linked === NONE ? null : linked) : undefined,
              auto_import: linked === NONE ? false : auto,
            })
          }
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar"}
        </Button>
      </div>
    </div>
  );
}

export function AccountMappingDialog({ open, onClose, connectionId, companyId, institutionName }: Props) {
  const { data: accounts, isLoading } = useOpenFinanceAccounts(open ? connectionId : null);
  const { data: bankOptions } = useLocalBankAccounts(open ? companyId : null);
  const { data: cardOptions } = useLocalCreditCards(open ? companyId : null);
  const linkMut = useLinkOpenFinanceAccount();

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Vincular contas — {institutionName ?? "Banco"}</DialogTitle>
          <DialogDescription>
            Associe cada conta ou cartão do banco a uma conta local do sistema. Apenas contas vinculadas
            terão lançamentos importados automaticamente.
          </DialogDescription>
        </DialogHeader>

        <Separator />

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando contas…
          </div>
        ) : !accounts || accounts.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">
            Nenhuma conta encontrada nesta conexão.
          </div>
        ) : (
          <div className="space-y-3">
            {accounts.map((a) => (
              <AccountRow
                key={a.id}
                acc={a}
                companyId={companyId}
                bankOptions={bankOptions}
                cardOptions={cardOptions}
                saving={linkMut.isPending}
                onSave={(input) => linkMut.mutate(input)}
              />
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
