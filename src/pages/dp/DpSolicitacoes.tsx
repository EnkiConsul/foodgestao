import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Check, X, FileText, ClipboardList, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useDpColaboradores } from "@/hooks/useDpColaboradores";
import { useAuth } from "@/hooks/useAuth";
import { DpPage, DpPageHeader, useDpEmbedded } from "@/components/dp/DpPage";
import { MobileDetailsSheet } from "@/components/dp/MobileCardKit";
import type { Database } from "@/integrations/supabase/types";

type Tipo = Database["public"]["Enums"]["dp_solicitacao_tipo"];
type Status = Database["public"]["Enums"]["dp_solicitacao_status"];
type Row = Database["public"]["Tables"]["dp_solicitacoes"]["Row"];
type RowWithColab = Row & { dp_colaboradores: { nome: string } | null };

const TIPOS: { value: Tipo; label: string }[] = [
  { value: "folga", label: "Folga" },
  { value: "ferias", label: "Férias" },
  { value: "atestado", label: "Atestado" },
  { value: "adiantamento", label: "Adiantamento" },
  { value: "outros", label: "Outros" },
];

const STATUS_META: Record<Status, { label: string; className: string }> = {
  pendente: { label: "Pendente", className: "bg-amber-500/20 text-amber-700 dark:text-amber-400" },
  aprovada: { label: "Aprovada", className: "bg-primary/20 text-primary" },
  recusada: { label: "Recusada", className: "bg-destructive/20 text-destructive" },
  cancelada: { label: "Cancelada", className: "bg-muted text-muted-foreground" },
};

function formatBR(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

export default function DpSolicitacoes() {
  const embedded = useDpEmbedded();
  const { selectedCompanyId } = useCompanyContext();
  const { user } = useAuth();
  const qc = useQueryClient();
  const colabs = useDpColaboradores();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [respostas, setRespostas] = useState<Record<string, string>>({});
  const [confirmAdiantamento, setConfirmAdiantamento] = useState<RowWithColab | null>(null);
  const [form, setForm] = useState({ colaborador_id: "", tipo: "folga" as Tipo, data_alvo: "", data_fim: "", motivo: "" });
  const [detailsRow, setDetailsRow] = useState<RowWithColab | null>(null);

  const list = useQuery({
    queryKey: ["dp_solicitacoes", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_solicitacoes")
        .select("*, dp_colaboradores(nome)")
        .eq("company_id", selectedCompanyId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as RowWithColab[];
    },
  });

  const rows = list.data ?? [];
  const pendentes = useMemo(() => rows.filter((r) => r.status === "pendente"), [rows]);
  const historico = useMemo(() => rows.filter((r) => r.status !== "pendente"), [rows]);

  const create = useMutation({
    mutationFn: async () => {
      if (!selectedCompanyId) throw new Error("Sem empresa");
      if (!form.colaborador_id) throw new Error("Selecione um colaborador");
      const { error } = await supabase.from("dp_solicitacoes").insert({
        company_id: selectedCompanyId,
        colaborador_id: form.colaborador_id,
        tipo: form.tipo,
        data_alvo: form.data_alvo || null,
        data_fim: form.data_fim || null,
        motivo: form.motivo.trim() || null,
        criado_por: user?.id,
        status: "pendente",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Solicitação criada");
      qc.invalidateQueries({ queryKey: ["dp_solicitacoes"] });
      qc.invalidateQueries({ queryKey: ["dp_home_stats"] });
      qc.invalidateQueries({ queryKey: ["dp_pendencias"] });
      setDialogOpen(false);
      setForm({ colaborador_id: "", tipo: "folga", data_alvo: "", data_fim: "", motivo: "" });
    },
    onError: (e) => toast.error("Erro", { description: e instanceof Error ? e.message : String(e) }),
  });

  const respond = useMutation({
    mutationFn: async ({ id, status, resposta }: { id: string; status: Status; resposta?: string }) => {
      const { error } = await supabase.from("dp_solicitacoes").update({
        status,
        respondido_por: user?.id,
        respondido_em: new Date().toISOString(),
        resposta_admin: resposta ?? null,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      toast.success(vars.status === "aprovada" ? "Solicitação aprovada" : "Solicitação recusada");
      qc.invalidateQueries({ queryKey: ["dp_solicitacoes"] });
      qc.invalidateQueries({ queryKey: ["dp_home_stats"] });
      qc.invalidateQueries({ queryKey: ["dp_pendencias"] });
      setRespostas((prev) => {
        const n = { ...prev };
        delete n[vars.id];
        return n;
      });
      setConfirmAdiantamento(null);
    },
    onError: (e) => toast.error("Erro", { description: e instanceof Error ? e.message : String(e) }),
  });

  const openArquivo = async (path: string) => {
    const { data, error } = await supabase.storage.from("dp-documentos").createSignedUrl(path, 60);
    if (error) return toast.error(error.message);
    window.open(data.signedUrl, "_blank");
  };

  const decide = (r: RowWithColab, approve: boolean) => {
    const resposta = (respostas[r.id] ?? "").trim() || (approve ? "Aprovado" : "Recusado");
    if (approve && r.tipo === "adiantamento") {
      setConfirmAdiantamento(r);
      return;
    }
    respond.mutate({ id: r.id, status: approve ? "aprovada" : "recusada", resposta });
  };

  return (
    <DpPage>
      {!embedded && (
        <Helmet><title>Solicitações — Pessoas 360°</title></Helmet>
      )}

      <DpPageHeader
        icon={ClipboardList}
        title="Solicitações"
        description="Aprove ou recuse pedidos especiais."
      />

      {/* Pendentes */}
      <section className="space-y-3">
        <h2 className="font-semibold">Pendentes</h2>
        <div className="space-y-3">
          {list.isLoading && (
            <div className="bg-card border border-border rounded-xl p-6 text-center text-muted-foreground text-sm">
              Carregando...
            </div>
          )}
          {!list.isLoading && pendentes.length === 0 && (
            <div className="bg-card border border-border rounded-xl p-6 text-center text-muted-foreground text-sm">
              Nenhuma solicitação pendente.
            </div>
          )}
          {pendentes.map((s) => {
            const arquivo = (s as unknown as { arquivo_path?: string | null }).arquivo_path ?? null;
            return (
              <div
                key={s.id}
                role="button"
                tabIndex={0}
                onClick={() => setDetailsRow(s)}
                onKeyDown={(e) => { if (e.key === "Enter") setDetailsRow(s); }}
                className="bg-card border border-amber-500/30 rounded-xl p-4 space-y-3 cursor-pointer hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{s.dp_colaboradores?.nome ?? "Funcionário"}</div>
                    <div className="text-sm text-muted-foreground truncate">
                      <span className="capitalize mr-2">{s.tipo}</span>
                      <b>{formatBR(s.data_alvo)}{s.data_fim ? ` → ${formatBR(s.data_fim)}` : ""}</b>
                    </div>
                  </div>
                  <span className="hidden md:inline text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(s.created_at).toLocaleString("pt-BR")}
                  </span>
                </div>

                {s.motivo && (
                  <div className="text-sm bg-muted/40 rounded-lg p-3 line-clamp-2 md:line-clamp-none">{s.motivo}</div>
                )}

                <Textarea
                  placeholder="Resposta (opcional)"
                  value={respostas[s.id] ?? ""}
                  onChange={(e) => setRespostas({ ...respostas, [s.id]: e.target.value })}
                  onClick={(e) => e.stopPropagation()}
                  rows={2}
                />

                <div className="flex flex-wrap gap-2 justify-end" onClick={(e) => e.stopPropagation()}>
                  {arquivo && (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="Ver arquivo"
                      title="Ver arquivo"
                      className="min-h-11 h-11 w-11 md:w-auto md:px-3"
                      onClick={() => openArquivo(arquivo)}
                    >
                      <FileText className="size-4 md:mr-1" />
                      <span className="hidden md:inline">Ver arquivo</span>
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    aria-label="Recusar solicitação"
                    title="Recusar"
                    className="min-h-11 h-11 w-11 md:w-auto md:px-3"
                    onClick={() => decide(s, false)}
                    disabled={respond.isPending}
                  >
                    <X className="size-4 md:mr-1" />
                    <span className="hidden md:inline">Recusar</span>
                  </Button>
                  <Button
                    aria-label="Aprovar solicitação"
                    title="Aprovar"
                    className="min-h-11 h-11 w-11 md:w-auto md:px-3"
                    onClick={() => decide(s, true)}
                    disabled={respond.isPending}
                  >
                    <Check className="size-4 md:mr-1" />
                    <span className="hidden md:inline">Aprovar</span>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Histórico */}
      <section className="space-y-3">
        <h2 className="font-semibold">Histórico</h2>
        <div className="bg-card border border-border rounded-xl divide-y divide-border">
          {historico.length === 0 && (
            <div className="p-4 text-sm text-muted-foreground">Sem registros.</div>
          )}
          {historico.map((s) => {
            const meta = STATUS_META[s.status];
            return (
              <div
                key={s.id}
                role="button"
                tabIndex={0}
                onClick={() => setDetailsRow(s)}
                onKeyDown={(e) => { if (e.key === "Enter") setDetailsRow(s); }}
                className="p-4 text-sm flex items-start justify-between gap-3 cursor-pointer hover:bg-muted/30 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">
                    {s.dp_colaboradores?.nome ?? "—"} <span className="text-muted-foreground">• {formatBR(s.data_alvo)}</span>
                    <span className="capitalize text-muted-foreground"> • {s.tipo}</span>
                  </div>
                  {s.motivo && <div className="text-muted-foreground mt-0.5 line-clamp-1 md:line-clamp-none">{s.motivo}</div>}
                  {s.resposta_admin && (
                    <div className="text-xs text-muted-foreground mt-1 line-clamp-1 md:line-clamp-none">
                      <b>Resposta:</b> {s.resposta_admin}
                    </div>
                  )}
                </div>
                <span className={`text-xs px-2 py-1 rounded-md whitespace-nowrap shrink-0 ${meta.className}`}>
                  {meta.label}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Nova solicitação */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Nova solicitação</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <Label>Colaborador *</Label>
              <Select value={form.colaborador_id} onValueChange={(v) => setForm({ ...form, colaborador_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {(colabs.data ?? []).filter((c) => c.ativo).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Tipo *</Label>
              <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v as Tipo })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPOS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Data alvo</Label>
                <Input type="date" value={form.data_alvo} onChange={(e) => setForm({ ...form, data_alvo: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label>Data fim (opcional)</Label>
                <Input type="date" value={form.data_fim} onChange={(e) => setForm({ ...form, data_fim: e.target.value })} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Motivo</Label>
              <Textarea rows={3} value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={() => create.mutate()} disabled={create.isPending}>
              {create.isPending ? "Salvando..." : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação adiantamento */}
      <AlertDialog open={!!confirmAdiantamento} onOpenChange={(v) => !v && setConfirmAdiantamento(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" /> Aprovar adiantamento?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Você está aprovando um pedido de adiantamento para <b>{confirmAdiantamento?.dp_colaboradores?.nome}</b>.
              Esta ação pode gerar um lançamento financeiro. Confirma?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!confirmAdiantamento) return;
                const resposta = (respostas[confirmAdiantamento.id] ?? "").trim() || "Aprovado";
                respond.mutate({ id: confirmAdiantamento.id, status: "aprovada", resposta });
              }}
            >
              Sim, aprovar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <MobileDetailsSheet
        open={!!detailsRow}
        onOpenChange={(o) => !o && setDetailsRow(null)}
        title={detailsRow?.dp_colaboradores?.nome ?? "Solicitação"}
        description={detailsRow ? STATUS_META[detailsRow.status].label : undefined}
        meta={detailsRow ? [
          { label: "Tipo", value: <span className="capitalize">{detailsRow.tipo}</span> },
          { label: "Data alvo", value: formatBR(detailsRow.data_alvo) },
          ...(detailsRow.data_fim ? [{ label: "Data fim", value: formatBR(detailsRow.data_fim) }] : []),
          { label: "Criada em", value: new Date(detailsRow.created_at).toLocaleString("pt-BR") },
          ...(detailsRow.motivo ? [{ label: "Motivo", value: detailsRow.motivo }] : []),
          ...(detailsRow.resposta_admin ? [{ label: "Resposta", value: detailsRow.resposta_admin }] : []),
        ] : []}
        footer={detailsRow && detailsRow.status === "pendente" ? (
          <div className="flex gap-2 w-full">
            <Button variant="outline" className="flex-1" onClick={() => { decide(detailsRow, false); setDetailsRow(null); }}>
              <X className="size-4 mr-1" /> Recusar
            </Button>
            <Button className="flex-1" onClick={() => { decide(detailsRow, true); setDetailsRow(null); }}>
              <Check className="size-4 mr-1" /> Aprovar
            </Button>
          </div>
        ) : null}
      />
    </DpPage>
  );
}
