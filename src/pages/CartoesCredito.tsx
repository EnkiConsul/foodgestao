import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { usePrivacy } from "@/hooks/usePrivacy";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { CreditCard, Plus, Pencil, Trash2, Wallet, Calendar, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { CreditCardFormDialog } from "@/components/credit-cards/CreditCardFormDialog";
import { PluggyCreditCardReviewDialog } from "@/components/credit-cards/PluggyCreditCardReviewDialog";
import { usePluggyCreditReview } from "@/hooks/usePluggyCreditReview";
import { PayInvoiceDialog } from "@/components/credit-cards/PayInvoiceDialog";
import type { Database } from "@/integrations/supabase/types";

type CreditCardRow = Database["public"]["Tables"]["credit_cards"]["Row"];
type Invoice = Database["public"]["Tables"]["credit_card_invoices"]["Row"];
type InvoiceStatus = Database["public"]["Enums"]["invoice_cycle_status"];

const statusLabels: Record<InvoiceStatus, { label: string; className: string }> = {
  aberta: { label: "Aberta", className: "bg-primary/10 text-primary" },
  fechada: { label: "Fechada", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  paga: { label: "Paga", className: "bg-success/15 text-success" },
  parcial: { label: "Parcial", className: "bg-orange-500/15 text-orange-700 dark:text-orange-400" },
  vencida: { label: "Vencida", className: "bg-destructive/15 text-destructive" },
  atrasada: { label: "Atrasada", className: "bg-destructive/15 text-destructive" },
};

export default function CartoesCredito() {
  const { user } = useAuth();
  const { contextType, selectedCompanyId } = useCompanyContext();
  const { maskBRL } = usePrivacy();

  const [cards, setCards] = useState<CreditCardRow[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingByCard, setPendingByCard] = useState<Record<string, number>>({});

  const [selectedCardId, setSelectedCardId] = useState<string>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CreditCardRow | null>(null);
  const [payInvoice, setPayInvoice] = useState<Invoice | null>(null);
  const [deleteCard, setDeleteCard] = useState<CreditCardRow | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const { pending: pendingCredit, reload: reloadPendingCredit } = usePluggyCreditReview();


  const fetchAll = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    let q = supabase.from("credit_cards").select("*").order("created_at", { ascending: false });
    if (contextType === "pj") {
      if (!selectedCompanyId) { setCards([]); setInvoices([]); setLoading(false); return; }
      q = q.eq("context", "pj").eq("company_id", selectedCompanyId);
    } else {
      q = q.eq("context", "pf");
    }
    const { data: cardData, error: cardErr } = await q;
    if (cardErr) { toast.error("Erro ao carregar cartões"); setLoading(false); return; }
    setCards((cardData ?? []) as CreditCardRow[]);

    const ids = (cardData ?? []).map((c) => c.id);
    if (ids.length === 0) { setInvoices([]); setLoading(false); return; }
    const { data: invData, error: invErr } = await supabase
      .from("credit_card_invoices")
      .select("*")
      .in("credit_card_id", ids)
      .order("period_start", { ascending: false })
      .limit(60);
    if (invErr) toast.error("Erro ao carregar faturas");
    else setInvoices((invData ?? []) as Invoice[]);
    setLoading(false);
  }, [user, contextType, selectedCompanyId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Pendências de conciliação por cartão: contas de cartão do Open Finance são
  // vinculadas ao cartão (linked_credit_card_id), não a uma conta bancária,
  // por isso a fila do cartão só aparece com um atalho próprio.
  useEffect(() => {
    let active = true;
    (async () => {
      if (contextType !== "pj" || !selectedCompanyId) { setPendingByCard({}); return; }
      const { data: pa } = await supabase
        .from("pluggy_accounts")
        .select("pluggy_account_id, linked_credit_card_id")
        .eq("company_id", selectedCompanyId)
        .not("linked_credit_card_id", "is", null);
      const byPluggyAccount = new Map<string, string>();
      for (const row of (pa ?? []) as { pluggy_account_id: string; linked_credit_card_id: string | null }[]) {
        if (row.linked_credit_card_id) byPluggyAccount.set(row.pluggy_account_id, row.linked_credit_card_id);
      }
      if (byPluggyAccount.size === 0) { if (active) setPendingByCard({}); return; }
      const { data: staging } = await supabase
        .from("pluggy_staging_transactions")
        .select("pluggy_account_id")
        .eq("company_id", selectedCompanyId)
        .eq("status", "pending")
        .in("pluggy_account_id", Array.from(byPluggyAccount.keys()));
      const counts: Record<string, number> = {};
      for (const row of (staging ?? []) as { pluggy_account_id: string }[]) {
        const cardId = byPluggyAccount.get(row.pluggy_account_id);
        if (cardId) counts[cardId] = (counts[cardId] ?? 0) + 1;
      }
      if (active) setPendingByCard(counts);
    })();
    return () => { active = false; };
  }, [contextType, selectedCompanyId]);

  const filteredCards = useMemo(
    () => (selectedCardId === "all" ? cards : cards.filter((c) => c.id === selectedCardId)),
    [cards, selectedCardId]
  );

  const invoicesByCard = useMemo(() => {
    const m = new Map<string, Invoice[]>();
    invoices.forEach((inv) => {
      const arr = m.get(inv.credit_card_id) ?? [];
      arr.push(inv);
      m.set(inv.credit_card_id, arr);
    });
    return m;
  }, [invoices]);

  const handleDelete = async () => {
    if (!deleteCard) return;
    const { error } = await supabase.from("credit_cards").delete().eq("id", deleteCard.id);
    if (error) toast.error(error.message);
    else { toast.success("Cartão excluído"); fetchAll(); }
    setDeleteCard(null);
  };

  const totals = useMemo(() => {
    let openInvoices = 0;
    let toPay = 0;
    invoices.forEach((i) => {
      if (i.status === "aberta") openInvoices += Number(i.total_amount);
      if (i.status === "fechada" || i.status === "parcial" || i.status === "vencida" || i.status === "atrasada") {
        toPay += Number(i.total_amount) - Number(i.paid_amount);
      }
    });
    return { openInvoices, toPay };
  }, [invoices]);

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-foreground">Cartões de Crédito</h1>
          <p className="text-xs text-muted-foreground">Gerencie limites, faturas e pagamentos.</p>
        </div>
        <Button onClick={() => { setEditing(null); setFormOpen(true); }} className="gap-2 min-h-[40px]">
          <Plus className="h-4 w-4" /> Novo Cartão
        </Button>
      </div>

      {pendingCredit.length > 0 && (
        <Card className="border-warning/40 bg-warning/5 shadow-sm">
          <CardContent className="p-4 flex flex-wrap items-center gap-3">
            <AlertCircle className="h-4 w-4 text-warning shrink-0" />
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-semibold">
                {pendingCredit.length} cartão(ões) encontrado(s) no Open Finance
              </p>
              <p className="text-xs text-muted-foreground">
                Nada é cadastrado sem sua autorização. Revise os dados e confirme para criar ou vincular.
              </p>
            </div>
            <Button size="sm" onClick={() => setReviewOpen(true)}>Revisar cartões</Button>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <CreditCard className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Cartões ativos</p>
              <p className="text-lg font-bold">{cards.filter((c) => c.is_active).length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-amber-500/10 flex items-center justify-center">
              <Calendar className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Fatura aberta (competência)</p>
              <p className="text-lg font-bold">{maskBRL(totals.openInvoices)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center">
              <Wallet className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">A pagar</p>
              <p className="text-lg font-bold">{maskBRL(totals.toPay)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {cards.length > 1 && (
        <div className="flex gap-2">
          <Select value={selectedCardId} onValueChange={setSelectedCardId}>
            <SelectTrigger className="w-[240px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os cartões</SelectItem>
              {cards.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.brand ?? "Cartão"} •••• {c.last4 ?? "----"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : filteredCards.length === 0 ? (
        <Card className="shadow-sm">
          <CardContent className="flex flex-col items-center py-12 text-muted-foreground">
            <CreditCard className="h-10 w-10 mb-3 opacity-40" />
            <p className="text-sm">Nenhum cartão cadastrado</p>
            <Button variant="link" onClick={() => { setEditing(null); setFormOpen(true); }} className="mt-2">
              Cadastrar primeiro cartão
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredCards.map((card) => {
            const cardInvoices = invoicesByCard.get(card.id) ?? [];
            const openInv = cardInvoices.find((i) => i.status === "aberta");
            const used = Number(openInv?.total_amount ?? 0);
            const limit = Number(card.credit_limit);
            const usedPct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;

            return (
              <Card key={card.id} className="shadow-sm">
                <CardContent className="p-4 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="h-11 w-11 rounded-lg bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-primary-foreground">
                        <CreditCard className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-sm">
                            {card.brand ?? "Cartão"} •••• {card.last4 ?? "----"}
                          </p>
                          {!card.is_active && <Badge variant="outline" className="h-4 text-[10px]">Inativo</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {card.holder_name ? `${card.holder_name} · ` : ""}
                          Fecha dia {card.closing_day} · Vence dia {card.due_day}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant={pendingByCard[card.id] ? "default" : "outline"}
                        className="h-10 gap-2"
                        onClick={() => navigate(`/contas-bancarias/conciliacao?card=${card.id}`)}
                      >
                        <ListChecks className="h-4 w-4" />
                        Conciliar
                        {pendingByCard[card.id] ? (
                          <span className="rounded-full bg-primary-foreground/20 px-1.5 text-[10px] tabular-nums">
                            {pendingByCard[card.id]}
                          </span>
                        ) : null}
                      </Button>
                      <Button size="icon" variant="ghost" className="h-10 w-10" onClick={() => { setEditing(card); setFormOpen(true); }} aria-label="Editar cartão">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-10 w-10 hover:text-destructive" onClick={() => setDeleteCard(card)} aria-label="Excluir cartão">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">Limite utilizado (fatura aberta)</span>
                      <span className="font-medium">{maskBRL(used)} / {maskBRL(limit)}</span>
                    </div>
                    <Progress value={usedPct} />
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase">Faturas</p>
                    {cardInvoices.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-4 text-center">Sem faturas ainda. Lançamentos neste cartão criarão a primeira fatura.</p>
                    ) : (
                      cardInvoices.slice(0, 6).map((inv) => {
                        const s = statusLabels[inv.status];
                        const remaining = Number(inv.total_amount) - Number(inv.paid_amount);
                        const canPay = inv.status === "fechada" || inv.status === "parcial" || inv.status === "vencida" || inv.status === "atrasada";
                        return (
                          <div key={inv.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-card p-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-sm font-medium">
                                  {new Date(inv.reference_month + "T00:00:00").toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
                                </p>
                                <Badge className={`h-4 text-[10px] px-1.5 border-0 ${s.className}`}>{s.label}</Badge>
                              </div>
                              <p className="text-[11px] text-muted-foreground">
                                Fecha {new Date(inv.closing_date + "T00:00:00").toLocaleDateString("pt-BR")}
                                {" · "}Vence {new Date(inv.due_date + "T00:00:00").toLocaleDateString("pt-BR")}
                                {Number(inv.previous_balance) > 0 && (
                                  <span className="text-orange-600 dark:text-orange-400"> · Rotativo anterior: {maskBRL(Number(inv.previous_balance))}</span>
                                )}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-sm font-bold">{maskBRL(Number(inv.total_amount))}</p>
                              {canPay && remaining > 0 && (
                                <p className="text-[11px] text-muted-foreground">Restam {maskBRL(remaining)}</p>
                              )}
                            </div>
                            {canPay ? (
                              <Button size="sm" variant="default" className="min-h-[40px]" onClick={() => setPayInvoice(inv)}>Pagar</Button>
                            ) : inv.status === "aberta" ? (
                              <Badge variant="outline" className="text-[10px] gap-1">
                                <AlertCircle className="h-3 w-3" /> aguarda fechamento
                              </Badge>
                            ) : null}
                          </div>
                        );
                      })
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <CreditCardFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        onSaved={fetchAll}
        card={editing}
      />

      <PluggyCreditCardReviewDialog
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        accounts={pendingCredit}
        onDone={() => { reloadPendingCredit(); fetchAll(); }}
      />

      <PayInvoiceDialog
        open={!!payInvoice}
        onOpenChange={(o) => { if (!o) setPayInvoice(null); }}
        onPaid={fetchAll}
        invoice={payInvoice}
        defaultPaymentAccountId={payInvoice ? cards.find((c) => c.id === payInvoice.credit_card_id)?.default_payment_account_id : null}
      />

      <AlertDialog open={!!deleteCard} onOpenChange={(o) => { if (!o) setDeleteCard(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cartão</AlertDialogTitle>
            <AlertDialogDescription>
              Excluir <strong>{deleteCard?.brand} •••• {deleteCard?.last4}</strong>? As faturas e lançamentos vinculados serão desassociados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
