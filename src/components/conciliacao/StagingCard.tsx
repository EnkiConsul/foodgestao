import { memo, useState } from "react";
import { format, parseISO } from "date-fns";
import { AlertTriangle, Check, ChevronDown, Loader2, Pencil, UserPlus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ContactSelectContent } from "@/components/conciliacao/ContactSelectContent";
import { DescriptionEditor } from "@/components/conciliacao/DescriptionEditor";

import type { ReactNode } from "react";

interface AccountOpt {
  id: string;
  name: string;
}

export interface StagingCardRow {
  id: string;
  pluggy_account_id: string;
  date: string;
  description: string | null;
  amount: number;
  status: "pending" | "confirmed" | "ignored" | "duplicate";
  matched_transaction_id?: string | null;
}

interface ContactOpt {
  id: string;
  name: string;
  type: string | null;
  document: string | null;
}

interface StagingCardProps {
  row: StagingCardRow;
  accounts: AccountOpt[];
  accountValue: string;
  onAccountChange: (value: string) => void;
  kind: "auto" | "transfer";
  onKindChange: (value: "auto" | "transfer") => void;
  counterpart: string;
  onCounterpartChange: (value: string) => void;
  category: string;
  onCategoryChange: (value: string) => void;
  /** Itens de categoria já renderizados (mesma árvore de /categorias). */
  suggestedCategoryItems: ReactNode;
  oppositeCategoryItems: ReactNode;
  paymentMethods: AccountOpt[];
  paymentMethod: string;
  paymentMethodSuggested?: boolean;
  onPaymentMethodChange: (value: string) => void;
  contacts: ContactOpt[];
  contact: string;
  contactSuggested?: boolean;
  /** Origem da sugestão: "documento" | "histórico" | "nome". */
  suggestionLabel?: string | null;
  /** true quando o contato está cadastrado só no perfil Pessoal. */
  contactNotLinked?: boolean;
  /** Motivo de não haver sugestão (extrato sem CNPJ/nome não cadastrado). */
  noSuggestionReason?: string | null;
  onContactChange: (value: string) => void;
  /** "Nome • CNPJ 00.000.000/0001-00" extraído do extrato (null quando ausente). */
  counterpartyLabel?: string | null;
  counterpartyInternal?: boolean;
  canCreateContact?: boolean;
  creatingContact?: boolean;
  onCreateContact?: () => void;
  /** Abre o formulário completo de fornecedor/cliente sem sugestão do extrato. */
  onCreateNewContact?: () => void;
  /** Abre o formulário do contato já selecionado para edição, mantendo o vínculo. */
  onEditContact?: () => void;

  /** true quando a categoria escolhida é do tipo oposto ao valor (estorno). */
  isReversal: boolean;
  selected: boolean;
  onSelectedChange: (value: boolean) => void;
  busy: boolean;
  isTransferBadge: boolean;
  maskBRL: (value: number) => string;
  /** Salva a descrição editada do lançamento importado. */
  onDescriptionSave?: (value: string) => Promise<boolean | void>;
  onAction: (action: "confirm" | "ignore" | "split") => void;

}

/** Versão mobile de uma linha da fila de conciliação (mesma lógica da tabela). */
function StagingCardBase({
  row,
  accounts,
  accountValue,
  onAccountChange,
  kind,
  onKindChange,
  counterpart,
  onCounterpartChange,
  category,
  onCategoryChange,
  suggestedCategoryItems,
  oppositeCategoryItems,
  paymentMethods,
  paymentMethod,
  paymentMethodSuggested,
  onPaymentMethodChange,
  contacts,
  contact,
  contactSuggested,
  suggestionLabel,
  contactNotLinked,
  noSuggestionReason,
  onContactChange,
  counterpartyLabel,
  counterpartyInternal,
  canCreateContact,
  creatingContact,
  onCreateContact,
  onCreateNewContact,
  onEditContact,
  isReversal,
  selected,
  onSelectedChange,
  busy,
  isTransferBadge,
  maskBRL,
  onDescriptionSave,
  onAction,

}: StagingCardProps) {

  const isEntrada = row.amount >= 0;
  const disabled = row.status !== "pending";
  const [open, setOpen] = useState(false);

  const accountName = accounts.find((a) => a.id === accountValue)?.name ?? null;
  const counterpartName = accounts.find((a) => a.id === counterpart)?.name ?? null;
  const contactName = contacts.find((c) => c.id === contact)?.name ?? null;
  const paymentName = paymentMethods.find((p) => p.id === paymentMethod)?.name ?? null;

  const ready =
    kind === "transfer" ? !!accountValue && !!counterpart : !!accountValue && !!category;

  const summary: string[] = [];
  if (kind === "transfer") {
    summary.push("Transferência");
    if (counterpartName) summary.push(counterpartName);
  } else {
    summary.push(isEntrada ? "Entrada" : "Saída");
    if (contactName) summary.push(contactName);
    if (paymentName) summary.push(paymentName);
  }

  return (
    <Card className={cn("overflow-hidden", selected && "ring-2 ring-primary/50")}>
      <CardContent className="p-0">
        <div className="flex items-start gap-2 p-3">
          <Checkbox
            className="mt-1 h-5 w-5"
            checked={selected}
            disabled={disabled}
            onCheckedChange={(v) => onSelectedChange(Boolean(v))}
            aria-label="Selecionar lançamento"
          />
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="min-w-0 flex-1 text-left"
            aria-expanded={open}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="line-clamp-2 break-words text-sm font-medium leading-snug">{row.description ?? "-"}</p>
              <span
                className={cn(
                  "shrink-0 text-sm font-bold tabular-nums",
                  isEntrada ? "text-success" : "text-destructive",
                )}
              >
                {maskBRL(row.amount)}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
              <span>{format(parseISO(row.date), "dd/MM/yyyy")}</span>
              {counterpartyLabel && (
                <span className="line-clamp-1 break-all">
                  {counterpartyInternal ? "Banco: " : ""}
                  {counterpartyLabel}
                </span>
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1">
              {row.status === "pending" && (
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px]",
                    ready
                      ? "border-success/40 bg-success/10 text-success"
                      : "border-warning/40 bg-warning/10 text-warning",
                  )}
                >
                  {ready ? "Pronto" : "Falta classificar"}
                </Badge>
              )}
              {row.status === "confirmed" && (
                <Badge className="bg-success/15 text-success border-success/30 text-[10px]">Confirmado</Badge>
              )}
              {row.status === "ignored" && <Badge variant="secondary" className="text-[10px]">Ignorado</Badge>}
              {row.status === "duplicate" && (
                <Badge className="bg-warning/15 text-warning border-warning/30 text-[10px]">
                  <AlertTriangle className="mr-1 h-3 w-3" />
                  Duplicado
                </Badge>
              )}
              {isTransferBadge && (
                <Badge variant="secondary" className="text-[10px]">Transferência</Badge>
              )}
              {summary.map((s) => (
                <span key={s} className="max-w-[45%] truncate text-[10px] text-muted-foreground">
                  • {s}
                </span>
              ))}
              <ChevronDown
                className={cn(
                  "ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                  open && "rotate-180",
                )}
              />
            </div>
            {!open && (
              <p className="mt-1 text-[10px] text-muted-foreground">
                <span className="line-clamp-1">{accountName ? `Conta: ${accountName}` : "Toque para classificar"}</span>
              </p>
            )}
          </button>
        </div>

        {open && (
          <div className="space-y-3 border-t bg-muted/20 p-3">
            {onDescriptionSave && (
              <div>
                <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Descrição</label>
                <DescriptionEditor
                  value={row.description}
                  disabled={disabled}
                  onSave={onDescriptionSave}
                />
              </div>
            )}

            <div>
              <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Conta destino</label>
              <Select value={accountValue} onValueChange={onAccountChange} disabled={disabled}>
                <SelectTrigger className="h-10 w-full max-w-full text-sm [&>span]:block [&>span]:truncate [&>span]:text-left">
                  <SelectValue placeholder="Selecionar…" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Tipo</label>
              <Select
                value={kind}
                onValueChange={(v) => onKindChange(v as "auto" | "transfer")}
                disabled={disabled}
              >
                <SelectTrigger className="h-10 w-full max-w-full text-sm [&>span]:block [&>span]:truncate [&>span]:text-left" aria-label="Tipo do lançamento">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">{isEntrada ? "Entrada" : "Saída"}</SelectItem>
                  <SelectItem value="transfer">Transferência entre contas</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {kind === "transfer" ? (
              <div>
                <label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {isEntrada ? "Conta de origem" : "Conta de destino"}
                </label>
                <Select value={counterpart} onValueChange={onCounterpartChange} disabled={disabled}>
                  <SelectTrigger className="h-10 w-full max-w-full text-sm [&>span]:block [&>span]:truncate [&>span]:text-left">
                    <SelectValue placeholder={isEntrada ? "Conta de origem…" : "Conta de destino…"} />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts
                      .filter((a) => a.id !== accountValue)
                      .map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {isEntrada ? "Dinheiro recebido desta conta" : "Dinheiro enviado para esta conta"} — sem
                  receita/despesa
                </p>
              </div>
            ) : (
              <div>
                <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Categoria</label>
                <Select value={category} onValueChange={onCategoryChange} disabled={disabled}>
                  <SelectTrigger className="h-10 w-full max-w-full text-sm [&>span]:block [&>span]:truncate [&>span]:text-left">
                    <SelectValue placeholder="Sem categoria" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[60vh]">
                    <SelectGroup>
                      <SelectLabel className="sticky top-0 z-10 border-b bg-popover text-[10px] uppercase tracking-wide text-muted-foreground">
                        Sugeridas ({isEntrada ? "entradas" : "saídas"})
                      </SelectLabel>
                      {suggestedCategoryItems}
                    </SelectGroup>
                    <SelectGroup>
                      <SelectLabel className="sticky top-0 z-10 border-y bg-popover text-[10px] uppercase tracking-wide text-warning">
                        Outras categorias — {isEntrada ? "saídas" : "entradas"} (estorno)
                      </SelectLabel>
                      {oppositeCategoryItems}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                {isReversal && (
                  <p className="mt-1 flex items-center gap-1 text-[10px] text-warning">
                    <AlertTriangle className="h-3 w-3" /> Estorno: categoria de tipo oposto ao valor
                  </p>
                )}
              </div>
            )}

            {kind !== "transfer" && (
              <>
                <div>
                  <label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Forma de pagamento
                  </label>
                  {paymentMethodSuggested && (
                    <span className="ml-1 text-[10px] text-muted-foreground">(sugerido)</span>
                  )}
                  <Select value={paymentMethod} onValueChange={onPaymentMethodChange} disabled={disabled}>
                    <SelectTrigger className="h-10 w-full max-w-full text-sm [&>span]:block [&>span]:truncate [&>span]:text-left">
                      <SelectValue placeholder="Não informada" />
                    </SelectTrigger>
                    <SelectContent>
                      {paymentMethods.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {isEntrada ? "Cliente" : "Fornecedor"}
                  </label>
                  <Select value={contact} onValueChange={onContactChange} disabled={disabled}>
                    <SelectTrigger className="h-10 w-full text-sm [&>span]:block [&>span]:truncate [&>span]:text-left">
                      <SelectValue placeholder="Não informado" />
                    </SelectTrigger>
                    <ContactSelectContent
                      contacts={contacts}
                      className="max-h-[50vh]"
                      onCreateNew={!disabled && onCreateNewContact ? onCreateNewContact : undefined}
                    />
                  </Select>
                  {contact && contactSuggested && (
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      sugerido por {suggestionLabel ?? "extrato"}
                    </p>
                  )}
                  {contact && contactNotLinked && (
                    <p className="mt-1 text-[10px] text-amber-600">cadastrado no Pessoal — será vinculado à empresa</p>
                  )}
                  {!contact && noSuggestionReason && (
                    <p className="mt-1 text-[10px] text-muted-foreground">{noSuggestionReason}</p>
                  )}
                  {!disabled && contact && onEditContact && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="mt-1 h-8 w-full text-xs"
                      onClick={onEditContact}
                    >
                      <Pencil className="mr-1 h-3 w-3" />
                      Editar cadastro
                    </Button>
                  )}
                  {!disabled && canCreateContact && onCreateContact && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2 h-9 w-full text-xs"
                      disabled={creatingContact}
                      onClick={onCreateContact}
                    >
                      {creatingContact
                        ? <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        : <UserPlus className="mr-1 h-3 w-3" />}
                      Cadastrar fornecedor/cliente
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {row.status === "pending" && (
          <div className="grid grid-cols-2 gap-2 border-t p-3">
            <Button variant="ghost" className="h-10" disabled={busy} onClick={() => onAction("split")}>
              Dividir
            </Button>
            <Button variant="outline" className="h-10" disabled={busy} onClick={() => onAction("ignore")}>
              <X className="mr-1 h-4 w-4" /> Ignorar
            </Button>
            <Button className="h-10" disabled={busy} onClick={() => onAction("confirm")}>
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Check className="mr-1 h-4 w-4" /> Confirmar
                </>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export const StagingCard = memo(StagingCardBase);
