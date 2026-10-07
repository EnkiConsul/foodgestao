import { diasDeAntecedencia, ehCompensacaoFeriado } from "@/lib/dp/termos-compensacao";
import { hojeIsoLocal } from "@/lib/dp/dataLocal";
import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Check, X, FileText, ClipboardList, AlertTriangle, Filter } from "lucide-react";
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
import { porIds, resolverPendencias } from "@/lib/dp/pendencias-resolver";
import { notifyError } from "@/lib/notifyError";
import { DpErrorState } from "@/components/dp/DpErrorState";
import { mensagemErro } from "@/lib/dp/mensagemErro";
import { registrarCienciaDsr } from "@/lib/dp/dsr-ciencia";
import { avisoDsrGestor } from "@/lib/dp/dsr-consecutivo";
import { Checkbox } from "@/components/ui/checkbox";

type Tipo = Database["public"]["Enums"]["dp_solicitacao_tipo"];
type Status = Database["public"]["Enums"]["dp_solicitacao_status"];
type Row = Database["public"]["Tables"]["dp_solicitacoes"]["Row"];
type RowWithColab = Row & { dp_colaboradores: { nome: string } | null };

const TIPOS: { value: Tipo; label: string }[] = [
  { value: "folga", label: "Folga" },
  { value: "ferias", label: "Férias" },
  { value: "atestado", label: "Atestado" },
  { value: "licenca_maternidade", label: "Licença-maternidade" },
  { value: "licenca_paternidade", label: "Licença-paternidade" },
  { value: "adiantamento", label: "Adiantamento" },
  { value: "outros", label: "Outros" },
];

const STATUS_META: Record<Status, { label: string; className: string }> = {
  pendente: { label: "Pendente", className: "bg-amber-500/20 text-amber-700 dark:text-amber-400" },
  aprovada: { label: "Aprovada", className: "bg-primary/20 text-primary" },
  recusada: { label: "Recusada", className: "bg-destructive/20 text-destructive" },
  cancelada: { label: "Cancelada", className: "bg-muted text-muted-foreground" },
};

const MESES_CURTOS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

/** Tipo em português legível, mesmo para valores fora da lista (ex.: mudanca_de_folga). */
function tipoLabel(tipo: string): string {
  const conhecido = TIPOS.find((t) => t.value === tipo)?.label;
  if (conhecido) return conhecido;
  const t = tipo.toLowerCase().replace(/_/g, " ").replace(/\bmudanca\b/, "mudança").replace(/\blicenca\b/, "licença");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Data de referência para ordenar/filtrar: dia do evento ou, sem ele, a criação. */
function dataRef(r: { data_alvo: string | null; created_at: string }): string {
  return r.data_alvo ?? r.created_at.slice(0, 10);
}

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
        .is("removido_em", null)
        .eq("company_id", selectedCompanyId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as RowWithColab[];
    },
  });

  /** Prazo mínimo de antecedência para compensação de feriado, por unidade. */
  const unidadesPrazo = useQuery({
    queryKey: ["dp_unidades_prazo_compensacao", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("dp_unidades")
        .select("id, compensacao_feriado_antecedencia_dias")
        .eq("company_id", selectedCompanyId!);
      if (error) throw error;
      return new Map<string, number>(
        ((data ?? []) as { id: string; compensacao_feriado_antecedencia_dias: number | null }[]).map(
          (u) => [u.id, u.compensacao_feriado_antecedencia_dias ?? 2],
        ),
      );
    },
  });

  /**
   * Compensação de feriado pedida com prazo menor que o mínimo da unidade:
   * o colaborador não é barrado, mas o gestor é avisado (pode recusar).
   */
  const prazoCompensacao = (s: Row): { dias: number; minimo: number } | null => {
    if (s.tipo !== "folga" || !s.data_alvo || !ehCompensacaoFeriado(s.motivo)) return null;
    const unidadeId = colabs.data?.find((c) => c.id === s.colaborador_id)?.unidade_id ?? null;
    const minimo = (unidadeId && unidadesPrazo.data?.get(unidadeId)) ?? 2;
    const dias = diasDeAntecedencia(s.data_alvo, hojeIsoLocal());
    return dias < minimo ? { dias, minimo } : null;
  };

  /** Ciências de DSR dadas pelo colaborador (mais de 6 dias seguidos sem descanso). */
  const ciencias = useQuery({
    queryKey: ["dp_dsr_ciencias", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("dp_dsr_ciencias")
        .select("colaborador_id, papel, referencia_tabela, dias_seguidos, created_at")
        .eq("company_id", selectedCompanyId!)
        .eq("referencia_tabela", "dp_solicitacoes")
        .eq("papel", "colaborador");
      if (error) throw error;
      return (data ?? []) as { colaborador_id: string; dias_seguidos: number; created_at: string }[];
    },
  });
  /** Risco de DSR do pedido: ciência do colaborador registrada junto com o envio. */
  const riscoDsr = (r: Row): number | null => {
    const t = new Date(r.created_at).getTime();
    const c = (ciencias.data ?? []).find(
      (x) => x.colaborador_id === r.colaborador_id && Math.abs(new Date(x.created_at).getTime() - t) < 10 * 60 * 1000,
    );
    return c ? c.dias_seguidos : null;
  };
  const [confirmDsr, setConfirmDsr] = useState<{ row: RowWithColab; dias: number } | null>(null);
  const [gestorCiente, setGestorCiente] = useState(false);

  const rows = list.data ?? [];
  const pendentes = useMemo(() => rows.filter((r) => r.status === "pendente"), [rows]);
  const [fMes, setFMes] = useState("todos");
  const [fColab, setFColab] = useState("todos");
  const [fTipo, setFTipo] = useState("todos");
  const [fStatus, setFStatus] = useState("todos");
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const historicoBase = useMemo(
    () =>
      rows
        .filter((r) => r.status !== "pendente")
        .sort((a, b) => dataRef(b).localeCompare(dataRef(a)) || b.created_at.localeCompare(a.created_at)),
    [rows],
  );
  const mesesDisponiveis = useMemo(
    () => Array.from(new Set(historicoBase.map((r) => dataRef(r).slice(0, 7)))),
    [historicoBase],
  );
  const colabsHistorico = useMemo(() => {
    const m = new Map<string, string>();
    historicoBase.forEach((r) => m.set(r.colaborador_id, r.dp_colaboradores?.nome ?? "—"));
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [historicoBase]);
  const tiposHistorico = useMemo(() => Array.from(new Set(historicoBase.map((r) => r.tipo as string))), [historicoBase]);
  const historico = useMemo(
    () =>
      historicoBase.filter(
        (r) =>
          (fMes === "todos" || dataRef(r).startsWith(fMes)) &&
          (fColab === "todos" || r.colaborador_id === fColab) &&
          (fTipo === "todos" || r.tipo === fTipo) &&
          (fStatus === "todos" || r.status === fStatus),
      ),
    [historicoBase, fMes, fColab, fTipo, fStatus],
  );
  const filtrosAtivos = [fMes, fColab, fTipo, fStatus].filter((v) => v !== "todos").length;

  const create = useMutation({
    mutationFn: async () => {
      if (!selectedCompanyId) throw new Error("Sem empresa");
      if (!form.colaborador_id) throw new Error("Selecione um colaborador");
      const { error } = await supabase.rpc("dp_solicitacao_criar_admin", {
        p_colaborador: form.colaborador_id,
        p_tipo: form.tipo,
        p_data_alvo: form.data_alvo,
        p_data_fim: (form.data_fim || null) as any,
        p_motivo: (form.motivo.trim() || null) as any,
        p_arquivo_path: null as any,
        p_aprovada: false,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Solicitação criada");
      qc.invalidateQueries({ queryKey: ["dp_solicitacoes"] });
      qc.invalidateQueries({ queryKey: ["dp_home_stats"] });
      void resolverPendencias(qc, { companyId: selectedCompanyId });
      setDialogOpen(false);
      setForm({ colaborador_id: "", tipo: "folga", data_alvo: "", data_fim: "", motivo: "" });
    },
    onError: (e) => toast.error("Erro", { description: e instanceof Error ? e.message : String(e) }),
  });

  const respond = useMutation({
    mutationFn: async ({ id, status, resposta }: { id: string; status: Status; resposta?: string }) => {
      const { error } = await supabase.rpc("dp_solicitacao_responder", {
        p_id: id,
        p_status: status as "aprovada" | "recusada",
        p_resposta: (resposta ?? null) as any,
      });
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      toast.success(vars.status === "aprovada" ? "Solicitação aprovada" : "Solicitação recusada");
      qc.invalidateQueries({ queryKey: ["dp_solicitacoes"] });
      qc.invalidateQueries({ queryKey: ["dp_home_stats"] });
      void resolverPendencias(qc, { companyId: selectedCompanyId, match: porIds([`sol-${vars.id}`]) });
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
    if (error) return notifyError(error, { surface: "Pessoas 360°", action: "concluir a ação" });
    window.open(data.signedUrl, "_blank");
  };

  const decide = (r: RowWithColab, approve: boolean) => {
    const resposta = (respostas[r.id] ?? "").trim() || (approve ? "Aprovado" : "Recusado");
    const dias = approve ? riscoDsr(r) : null;
    if (dias) {
      setGestorCiente(false);
      setConfirmDsr({ row: r, dias });
      return;
    }
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
          {!list.isLoading && list.isError && (
            <DpErrorState message={mensagemErro(list.error)} onRetry={() => void list.refetch()} />
          )}
          {!list.isLoading && !list.isError && pendentes.length === 0 && (
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
                      {s.tipo === "folga" && s.data_fim ? (
                        <>
                          <span className="mr-2">Troca de folga</span>
                          <b>
                            folga em {formatBR(s.data_alvo)} · trabalha em {formatBR(s.data_fim)}
                          </b>
                        </>
                      ) : (
                        <>
                          <span className="capitalize mr-2">
                            {s.tipo === "folga" && ehCompensacaoFeriado(s.motivo) ? "Compensação de Feriado" : s.tipo === "folga" && s.fora_da_janela ? "Folga extra (exceção)" : s.tipo}
                          </span>
                          <b>{formatBR(s.data_alvo)}{s.data_fim ? ` → ${formatBR(s.data_fim)}` : ""}</b>
                        </>
                      )}
                    </div>
                  </div>
                  <span className="hidden md:inline text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(s.created_at).toLocaleString("pt-BR")}
                  </span>
                </div>

                {s.tipo === "folga" && !s.data_fim && s.fora_da_janela && (
                  <div className="rounded-lg border border-border bg-muted/40 p-2 text-xs text-muted-foreground">
                    Folga adicional: não conta como folga de fim de semana nem substitui a folga semanal fixa.
                  </div>
                )}

                {riscoDsr(s) && (
                  <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-2 text-xs font-medium text-destructive">
                    <AlertTriangle className="size-4 shrink-0" />
                    Alerta de DSR: {riscoDsr(s)} dias seguidos sem descanso. O colaborador deu ciência.
                  </div>
                )}
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
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">Histórico</h2>
          <Button variant="outline" size="sm" className="md:hidden" onClick={() => setFiltrosAbertos((v) => !v)}>
            <Filter className="mr-1 h-4 w-4" /> Filtros{filtrosAtivos > 0 ? ` (${filtrosAtivos})` : ""}
          </Button>
        </div>
        <div className={`${filtrosAbertos ? "grid" : "hidden"} grid-cols-2 gap-2 md:grid md:grid-cols-5`}>
          <Select value={fMes} onValueChange={setFMes}>
            <SelectTrigger aria-label="Mês"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os meses</SelectItem>
              {mesesDisponiveis.map((m) => (
                <SelectItem key={m} value={m}>{MESES_CURTOS[Number(m.slice(5, 7)) - 1]}/{m.slice(0, 4)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={fColab} onValueChange={setFColab}>
            <SelectTrigger aria-label="Colaborador"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os colaboradores</SelectItem>
              {colabsHistorico.map(([id, nome]) => <SelectItem key={id} value={id}>{nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fTipo} onValueChange={setFTipo}>
            <SelectTrigger aria-label="Tipo"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os tipos</SelectItem>
              {tiposHistorico.map((t) => <SelectItem key={t} value={t}>{tipoLabel(t)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fStatus} onValueChange={setFStatus}>
            <SelectTrigger aria-label="Status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os status</SelectItem>
              <SelectItem value="aprovada">Aprovada</SelectItem>
              <SelectItem value="recusada">Recusada</SelectItem>
              <SelectItem value="cancelada">Cancelada</SelectItem>
            </SelectContent>
          </Select>
          {filtrosAtivos > 0 && (
            <Button variant="ghost" size="sm" onClick={() => { setFMes("todos"); setFColab("todos"); setFTipo("todos"); setFStatus("todos"); }}>
              Limpar filtros
            </Button>
          )}
        </div>
        <div className="bg-card border border-border rounded-xl divide-y divide-border">
          {list.isLoading && (
            <div className="p-4 text-sm text-muted-foreground">Carregando...</div>
          )}
          {!list.isLoading && list.isError && (
            <div className="p-4">
              <DpErrorState message={mensagemErro(list.error)} onRetry={() => void list.refetch()} />
            </div>
          )}
          {!list.isLoading && !list.isError && historico.length === 0 && (
            <div className="p-4 text-sm text-muted-foreground">{filtrosAtivos > 0 ? "Nenhum registro com esses filtros." : "Sem registros."}</div>
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
                  <div className="font-bold">
                    {formatBR(dataRef(s))}
                    <span className="ml-2 text-xs font-medium text-muted-foreground">{tipoLabel(s.tipo)}</span>
                  </div>
                  <div className="truncate text-muted-foreground">{s.dp_colaboradores?.nome ?? "—"}</div>
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

      {/* Ciência do gestor: mais de 6 dias seguidos sem descanso */}
      <AlertDialog open={!!confirmDsr} onOpenChange={(v) => !v && setConfirmDsr(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" /> Atenção trabalhista
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDsr && avisoDsrGestor(confirmDsr.dias)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label className="flex items-start gap-2 text-sm font-medium">
            <Checkbox checked={gestorCiente} onCheckedChange={(v) => setGestorCiente(v === true)} className="mt-0.5" />
            <span>Ciente do trabalho por mais de 6 dias consecutivos autorizado pela gestão.</span>
          </label>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={!gestorCiente}
              onClick={() => {
                if (!confirmDsr) return;
                const r = confirmDsr.row;
                const resposta = (respostas[r.id] ?? "").trim() || "Aprovado";
                respond.mutate(
                  { id: r.id, status: "aprovada", resposta },
                  {
                    onSuccess: () =>
                      void registrarCienciaDsr({
                        papel: "gestor",
                        tabela: "dp_solicitacoes",
                        referenciaId: r.id,
                        data: r.data_alvo ?? new Date().toISOString().slice(0, 10),
                        dias: confirmDsr.dias,
                        colaboradorId: r.colaborador_id,
                      }),
                  },
                );
                setConfirmDsr(null);
              }}
            >
              Aprovar com ciência
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
