import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { podeConvocar } from "@/lib/dp/convocacoes";
import { aceitaIndisponibilidadeConvocacao } from "@/lib/dp/convocacoes-planejamento";
import { emitirNotificacaoDescumprimento, PERCENTUAL_MULTA_CONVOCACAO } from "@/lib/dp/termo-descumprimento-convocacao";
import { Switch } from "@/components/ui/switch";
import { isSocio } from "@/lib/dp/contrato-policy";
import { elegiveisParaAusencia } from "@/lib/dp/ausencia-elegibilidade";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useDpColaboradores } from "@/hooks/useDpColaboradores";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Database } from "@/integrations/supabase/types";
import { sugestaoDataFim, duracaoPadrao, TIPOS_LICENCA_CURTA, TIPO_AFASTAMENTO_LABEL } from "@/lib/dp/licencas";
import { FundamentoLegalCard } from "@/components/dp/licencas/FundamentoLegalCard";
import { DpFilePicker } from "@/components/dp/DpFilePicker";
import { AtribuirFolgaTriagemDialog } from "@/components/dp/AtribuirFolgaTriagemDialog";
import { SuspensaoNovoModal } from "@/components/dp/disciplinar/SuspensaoNovoModal";
import { FeriasNovoModal } from "@/components/dp/ferias/FeriasNovoModal";
import { OcorrenciaFormDialog } from "@/components/dp/ocorrencias/OcorrenciaFormDialog";
import { textoErroOcorrencia } from "@/lib/dp/ocorrencias";
import { prepararUpload } from "@/lib/storage/uploadPolicy";
import { sanitizeStorageFilename } from "@/lib/storage";

type Tipo = Database["public"]["Enums"]["dp_solicitacao_tipo"];

/** Motivos do roteador: cada um abre o fluxo oficial da sua área. */
export type Motivo = "folga" | "ferias" | "afastamento" | "falta" | "suspensao" | "indisponibilidade" | "liberacao" | "socio";

const MOTIVO_LABEL: Record<Motivo, string> = {
  folga: "Folga (compensatória, extra ou troca)",
  ferias: "Férias",
  afastamento: "Atestado médico ou licença",
  falta: "Falta",
  suspensao: "Suspensão disciplinar",
  indisponibilidade: "Indisponibilidade de Convocação",
  liberacao: "Liberação do Gestor",
  socio: "Ausência do Sócio",
};

/** Sócio não tem falta, suspensão nem férias celetistas. */
const MOTIVOS_SOCIO: Motivo[] = ["socio", "folga", "afastamento"];

/** Somente afastamentos reais (sem folga, adiantamento ou envio de documentos). */
const TIPO_AFAST_LABEL: Partial<Record<Tipo, string>> = {
  atestado: "Atestado médico",
  licenca_maternidade: "Licença-maternidade",
  licenca_paternidade: "Licença-paternidade",
  ...(Object.fromEntries(TIPOS_LICENCA_CURTA.map((t) => [t, TIPO_AFASTAMENTO_LABEL[t]])) as Partial<Record<Tipo, string>>),
  outros: "Outro afastamento",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Data inicial sugerida (AAAA-MM-DD), ex.: vinda do calendário. */
  dataInicial?: string | null;
  /** Motivo já escolhido (ex.: botão "Atribuir Folga"). */
  motivoInicial?: Motivo;
}

/**
 * Porta única de "Registrar Ausência" no calendário: o gestor escolhe
 * colaborador, data e motivo, e o sistema abre o formulário oficial já
 * preenchido. Só atestados/licenças e faltas são gravados aqui mesmo.
 */
export function DpRegistrarAusenciaDialog({ open, onOpenChange, dataInicial, motivoInicial }: Props) {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();
  const colabs = useDpColaboradores();
  const todos = (colabs.data ?? []).filter((c: any) => !c.deleted_at);

  const [etapa, setEtapa] = useState<"escolha" | "afastamento">("escolha");
  const [motivo, setMotivo] = useState<Motivo>("afastamento");
  const [folgaOpen, setFolgaOpen] = useState(false);
  const [faltaOpen, setFaltaOpen] = useState(false);
  const [feriasOpen, setFeriasOpen] = useState(false);
  const [suspOpen, setSuspOpen] = useState(false);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [form, setForm] = useState({
    colaborador_id: "",
    tipo: "atestado" as Tipo,
    data_alvo: "",
    data_fim: "",
    motivo: "",
  });

  useEffect(() => {
    if (!open) return;
    setEtapa("escolha");
    setMotivo(motivoInicial ?? "afastamento");
    setArquivo(null);
    const hoje = new Date().toISOString().slice(0, 10);
    setForm({
      colaborador_id: "",
      tipo: "atestado",
      data_alvo: dataInicial ?? hoje,
      data_fim: dataInicial ?? hoje,
      motivo: "",
    });
  }, [open, dataInicial, motivoInicial]);

  useEffect(() => {
    if (form.data_fim && form.data_alvo && form.data_fim < form.data_alvo)
      setForm((f) => ({ ...f, data_fim: f.data_alvo }));
  }, [form.data_alvo, form.data_fim]);

  // Quem já tem ausência na data não aparece de novo.
  const ausDia = useQuery({
    queryKey: ["dp_ausencias_do_dia", selectedCompanyId, form.data_alvo],
    enabled: open && !!selectedCompanyId && !!form.data_alvo,
    queryFn: async () => {
      const d = form.data_alvo, c = selectedCompanyId!;
      const sb = supabase as any;
      const ids = new Set<string>();
      const add = (r: { data: any[] | null }) => (r.data ?? []).forEach((x) => ids.add(x.colaborador_id));
      const [sol, oc, ind, fol, fer] = await Promise.all([
        sb.from("dp_solicitacoes").select("colaborador_id").eq("company_id", c).in("status", ["aprovada", "pendente"])
          .neq("tipo", "adiantamento").lte("data_alvo", d).or(`data_fim.gte.${d},and(data_fim.is.null,data_alvo.eq.${d})`),
        sb.from("dp_ocorrencias").select("colaborador_id").eq("company_id", c).eq("data_operacional", d)
          .in("tipo", ["falta", "atestado", "ausencia_justificada"]).is("cancelado_em", null),
        sb.from("dp_indisponibilidades").select("colaborador_id").eq("company_id", c).eq("data", d).is("cancelada_em", null),
        sb.from("dp_folgas").select("colaborador_id").eq("company_id", c).eq("data", d).neq("status", "cancelada"),
        sb.from("dp_ferias_gozos").select("colaborador_id").eq("company_id", c).lte("data_inicio", d).gte("data_fim", d).neq("status", "cancelado"),
      ]);
      [sol, oc, ind, fol, fer].forEach(add);
      return ids;
    },
  });
  const ativos = elegiveisParaAusencia(todos as any[], form.data_alvo, ausDia.data ?? new Set<string>()) as typeof todos;
  useEffect(() => {
    if (form.colaborador_id && ausDia.data && !ativos.some((c) => c.id === form.colaborador_id))
      setForm((f) => ({ ...f, colaborador_id: "" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.data_alvo, ausDia.data]);
  const nomeColab = todos.find((c) => c.id === form.colaborador_id)?.nome ?? "";
  const regimeColab = todos.find((c) => c.id === form.colaborador_id)?.regime ?? null;
  const colabSel = todos.find((c) => c.id === form.colaborador_id) as any;
  const convocavel = podeConvocar(regimeColab as any);
  const indispElegivel = aceitaIndisponibilidadeConvocacao({ regime: colabSel?.regime, forma_pagamento: colabSel?.forma_pagamento });
  const socio = !!colabSel && (isSocio(colabSel.vinculo_label) || colabSel.regime === "socio");
  useEffect(() => { if (motivo === "indisponibilidade" && !indispElegivel) setMotivo("afastamento"); }, [motivo, indispElegivel]);
  useEffect(() => {
    if (socio && !MOTIVOS_SOCIO.includes(motivo)) setMotivo("socio");
    if (!socio && motivo === "socio") setMotivo("afastamento");
  }, [socio, motivo]);
  const motivosDisponiveis = (Object.keys(MOTIVO_LABEL) as Motivo[]).filter((m) =>
    socio ? MOTIVOS_SOCIO.includes(m) : m !== "socio" && (m !== "indisponibilidade" || indispElegivel));

  // Intermitente com convocação aceita no dia: a ausência é falta.
  const convAceita = useQuery({
    queryKey: ["dp_convocacao_aceita_dia", selectedCompanyId, form.colaborador_id, form.data_alvo],
    enabled: open && !!selectedCompanyId && !!form.colaborador_id && !!form.data_alvo && convocavel,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("dp_convocacoes")
        .select("id, data, entrada, saida, status, respondida_em, updated_at")
        .eq("company_id", selectedCompanyId!)
        .eq("colaborador_id", form.colaborador_id)
        .eq("data", form.data_alvo)
        .eq("status", "aceita")
        .limit(1)
        .maybeSingle();
      if (error) return null;
      return data as { entrada: string | null; saida: string | null; respondida_em?: string | null } | null;
    },
  });
  const conv = convocavel ? convAceita.data ?? null : null;
  const [notificar, setNotificar] = useState(false);
  const [assinaturaNotif, setAssinaturaNotif] = useState<"digital" | "manual">("digital");
  useEffect(() => { if (conv) setMotivo("falta"); }, [conv]);
  useEffect(() => { if (open) { setNotificar(false); setAssinaturaNotif("digital"); } }, [open]);
  const pendenteNotif = useRef<{ data: string; entrada: string | null; saida: string | null; aceitaEm: string | null } | null>(null);

  const continuar = () => {
    if (!form.colaborador_id) return toast.error("Selecione o colaborador");
    if (!form.data_alvo) return toast.error("Informe a data");
    switch (motivo) {
      case "folga":
        onOpenChange(false);
        setFolgaOpen(true);
        break;
      case "falta":
        pendenteNotif.current = conv && notificar
          ? { data: form.data_alvo, entrada: conv.entrada, saida: conv.saida, aceitaEm: conv.respondida_em ?? null }
          : null;
        onOpenChange(false);
        setFaltaOpen(true);
        break;
      case "ferias":
        onOpenChange(false);
        setFeriasOpen(true);
        break;
      case "suspensao":
        onOpenChange(false);
        setSuspOpen(true);
        break;
      case "afastamento":
        setEtapa("afastamento");
        break;
      case "indisponibilidade":
        indisp.mutate();
        break;
      case "liberacao":
      case "socio":
        dispensa.mutate(motivo);
        break;
    }
  };

  const sugerirDuracao = (tipo: Tipo, dataInicio: string) => {
    const fim = sugestaoDataFim(tipo, dataInicio);
    if (fim) setForm((f) => ({ ...f, data_fim: fim }));
  };

  const salvar = useMutation({
    mutationFn: async () => {
      if (!selectedCompanyId) throw new Error("Empresa não selecionada");
      if (form.motivo.length > 500) throw new Error("Observações muito longas (máx. 500)");
      const licenca = form.tipo !== "atestado";
      if (!arquivo && !licenca) throw new Error("Anexe o arquivo do atestado");
      let path: string | null = null;
      if (arquivo) {
        const envio = await prepararUpload("dp-documentos", arquivo);
        path = `${selectedCompanyId}/${licenca ? "licenca" : "atestado"}/${form.colaborador_id}/${Date.now()}-${sanitizeStorageFilename(envio.name)}`;
        const up = await supabase.storage.from("dp-documentos").upload(path, envio, { upsert: false });
        if (up.error) throw up.error;
      }
      const { error } = await supabase.rpc("dp_solicitacao_criar_admin", {
        p_colaborador: form.colaborador_id,
        p_tipo: form.tipo,
        p_data_alvo: form.data_alvo,
        p_data_fim: (form.data_fim || null) as any,
        p_motivo: (form.motivo.trim() || null) as any,
        p_arquivo_path: path as any,
        p_aprovada: true,
      });
      if (error) {
        if (path) await supabase.storage.from("dp-documentos").remove([path]).catch(() => undefined);
        throw error;
      }
    },
    onSuccess: () => {
      toast.success("Ausência registrada", { description: "Já aparece no calendário e em Atestados." });
      qc.invalidateQueries({ queryKey: ["dp_solicitacoes"] });
      qc.invalidateQueries({ queryKey: ["dp_panorama_base"] });
      qc.invalidateQueries({ queryKey: ["dp_home_stats"] });
      onOpenChange(false);
    },
    onError: (e) => toast.error("Não foi possível registrar", { description: e instanceof Error ? e.message : String(e) }),
  });

  // Liberação do Gestor (dispensa remunerada) e Ausência do Sócio: gravadas aprovadas, sem anexo.
  const dispensa = useMutation({
    mutationFn: async (m: "liberacao" | "socio") => {
      if (form.motivo.length > 450) throw new Error("Observações muito longas (máx. 450)");
      const rotulo = MOTIVO_LABEL[m];
      const obs = form.motivo.trim();
      const { error } = await supabase.rpc("dp_solicitacao_criar_admin", {
        p_colaborador: form.colaborador_id,
        p_tipo: "outros",
        p_data_alvo: form.data_alvo,
        p_data_fim: (form.data_fim || null) as any,
        p_motivo: obs ? `${rotulo} · ${obs}` : rotulo,
        p_arquivo_path: null as any,
        p_aprovada: true,
      });
      if (error) throw error;
    },
    onSuccess: (_d, m) => {
      toast.success(`${MOTIVO_LABEL[m]} registrada`, { description: "Já aparece no calendário." });
      qc.invalidateQueries({ queryKey: ["dp_solicitacoes"] });
      qc.invalidateQueries({ queryKey: ["dp_panorama_base"] });
      qc.invalidateQueries({ queryKey: ["dp_ausencias_do_dia"] });
      onOpenChange(false);
    },
    onError: (e) => toast.error("Não foi possível registrar", { description: e instanceof Error ? e.message : String(e) }),
  });

  const indisp = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase.rpc as any)("dp_indisponibilidade_registrar_gestor", {
        p_colaborador: form.colaborador_id,
        p_inicio: form.data_alvo,
        p_fim: form.data_fim || form.data_alvo,
        p_motivo: form.motivo.trim() || null,
      });
      if (error) throw error;
      return data as { criadas: number; existentes: number };
    },
    onSuccess: (r) => {
      toast.success("Indisponibilidade registrada", {
        description: r?.existentes ? `${r.criadas} dia(s) novo(s); ${r.existentes} já estava(m) registrado(s).` : "Aparece no calendário e na tela de Convocações.",
      });
      qc.invalidateQueries({ predicate: (q) => /indisp|conv_prev|panorama|disponibilidade/.test(String(q.queryKey[0] ?? "")) });
      onOpenChange(false);
    },
    onError: (e: any) => {
      const m = String(e?.message ?? e);
      toast.error("Não foi possível registrar", {
        description: m.includes("CONVOCACAO_ACEITA") ? "Já há convocação aceita no período. Registre como falta."
          : m.includes("REGIME_NAO_CONVOCAVEL") ? "Esse vínculo segue a rotina de folgas."
          : m.includes("FORBIDDEN") ? "Você não tem permissão para isso." : m,
      });
    },
  });

  const falta = useMutation({
    mutationFn: async (input: Parameters<React.ComponentProps<typeof OcorrenciaFormDialog>["onSubmit"]>[0]) => {
      const { error } = await supabase.rpc("dp_ocorrencia_registrar", {
        _colaborador_id: input.colaboradorId,
        _data: input.data,
        _tipo: input.tipo,
        _justificativa: input.justificativa ?? null,
        _horario_estimado: input.horarioEstimado ?? null,
        _horario_real: input.horarioReal ?? null,
        _marcacao_alvo: input.marcacaoAlvo ?? null,
      });
      if (error) throw error;
    },
    onSuccess: async (_d, input) => {
      toast.success("Falta registrada", { description: "Também aparece nas ocorrências do colaborador." });
      qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0] ?? "").startsWith("dp_ocorrencia") });
      qc.invalidateQueries({ queryKey: ["dp_panorama_base"] });
      setFaltaOpen(false);
      const n = pendenteNotif.current;
      pendenteNotif.current = null;
      if (!n || !selectedCompanyId || input.colaboradorId !== form.colaborador_id || input.data !== n.data) return;
      try {
        const bytes = await emitirNotificacaoDescumprimento({
          companyId: selectedCompanyId, colaboradorId: form.colaborador_id, nome: nomeColab,
          data: n.data, entrada: n.entrada, saida: n.saida, aceitaEm: n.aceitaEm,
          observacao: input.justificativa ?? null, assinatura: assinaturaNotif,
        });
        qc.invalidateQueries({ queryKey: ["dp_documentos"] });
        if (assinaturaNotif === "manual") {
          const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
          window.open(url, "_blank");
          toast.success("Notificação gerada para impressão", { description: "Também foi guardada na ficha do colaborador." });
        } else {
          toast.success("Notificação enviada ao Portal", { description: "O colaborador dará ciência pelo Portal." });
        }
      } catch (e) {
        toast.error("Falta registrada, mas a notificação não foi gerada", { description: e instanceof Error ? e.message : String(e) });
      }
    },
    onError: (e: Error) => toast.error(textoErroOcorrencia(e.message)),
  });

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar Ausência</DialogTitle>
            <DialogDescription>
              {etapa === "escolha"
                ? "Escolha o colaborador e o motivo. Abrimos o formulário certo já preenchido."
                : `${nomeColab} — atestado ou licença com o comprovante.`}
            </DialogDescription>
          </DialogHeader>

          {etapa === "escolha" ? (
            <div className="grid gap-3 py-2">
              <div className="grid gap-1.5">
                <Label>Colaborador *</Label>
                <Select value={form.colaborador_id} onValueChange={(v) => setForm({ ...form, colaborador_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {ativos.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome}{c.data_desligamento ? ` · Desligado em ${c.data_desligamento.split("-").reverse().join("/")}` : ""}
                      </SelectItem>
                    ))}
                    {ativos.length === 0 && (
                      <div className="px-3 py-2 text-xs text-muted-foreground">
                        {todos.length ? "Todos os colaboradores disponíveis já possuem ausência registrada nesta data." : "Nenhum colaborador ativo. Cadastre em Colaboradores."}
                      </div>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Data *</Label>
                <Input type="date" value={form.data_alvo}
                  onChange={(e) => setForm({ ...form, data_alvo: e.target.value, data_fim: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label>Motivo *</Label>
                <Select value={motivo} onValueChange={(v) => setMotivo(v as Motivo)} disabled={!!conv}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {motivosDisponiveis.map((m) => (
                      <SelectItem key={m} value={m}>{MOTIVO_LABEL[m]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {(motivo === "liberacao" || motivo === "socio") && (
                <div className="grid gap-3 rounded-md border border-border bg-muted/40 p-3">
                  {motivo === "liberacao" ? (
                    <p className="text-xs text-muted-foreground">
                      <strong className="text-foreground">Dispensa remunerada:</strong> o colaborador é liberado sem desconto e sem falta.
                      Se for folga extra, folga compensatória ou troca de folga, use o motivo <strong>Folga</strong>, que tem os fluxos próprios.
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Ausência do sócio: não gera falta, desconto nem reflexo trabalhista.</p>
                  )}
                  <div className="grid gap-1.5">
                    <Label>Data final (opcional)</Label>
                    <Input type="date" min={form.data_alvo || undefined} value={form.data_fim}
                      onChange={(e) => setForm({ ...form, data_fim: e.target.value })} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Observação</Label>
                    <Textarea rows={2} maxLength={450} value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} />
                  </div>
                </div>
              )}
              {motivo === "indisponibilidade" && !conv && (
                <div className="grid gap-3 rounded-md border border-border bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">
                    Apenas informativo: não gera falta nem desconto. A pessoa continua podendo ser convocada; o gestor só verá o aviso de possível recusa.
                  </p>
                  <div className="grid gap-1.5">
                    <Label>Até (opcional)</Label>
                    <Input type="date" min={form.data_alvo || undefined} value={form.data_fim}
                      onChange={(e) => setForm({ ...form, data_fim: e.target.value })} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Observação</Label>
                    <Textarea rows={2} maxLength={500} placeholder="Ex.: prova na faculdade, viagem"
                      value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} />
                  </div>
                </div>
              )}
              {conv && (
                <div className="grid gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-3">
                  <div className="flex gap-2 text-sm">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                    <p>
                      <strong>Convocação aceita para este dia</strong> ({conv.entrada?.slice(0, 5)} às {conv.saida?.slice(0, 5)}).
                      Por isso a ausência será registrada como <strong>falta</strong>.
                    </p>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <Label htmlFor="notif-desc" className="text-sm font-normal leading-snug">
                      Notificar o colaborador sobre a multa de {PERCENTUAL_MULTA_CONVOCACAO}% por descumprir convocação aceita (CLT, art. 452-A, § 4º)
                    </Label>
                    <Switch id="notif-desc" checked={notificar} onCheckedChange={setNotificar} />
                  </div>
                  {notificar && (
                    <div className="grid gap-1.5">
                      <Label>Forma de ciência</Label>
                      <Select value={assinaturaNotif} onValueChange={(v) => setAssinaturaNotif(v as "digital" | "manual")}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="digital">Digital, pelo Portal do Colaborador</SelectItem>
                          <SelectItem value="manual">Impressa, com espaço para testemunhas</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-[11px] text-muted-foreground">
                        O termo informa só o percentual da lei. O valor é apurado pela contabilidade.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="grid gap-3 py-2">
              <div className="grid gap-1.5">
                <Label>Tipo *</Label>
                <Select value={form.tipo} onValueChange={(v) => {
                  const tipo = v as Tipo;
                  setForm({ ...form, tipo });
                  if (duracaoPadrao(tipo) && form.data_alvo) sugerirDuracao(tipo, form.data_alvo);
                }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(TIPO_AFAST_LABEL) as Tipo[]).map((t) => (
                      <SelectItem key={t} value={t}>{TIPO_AFAST_LABEL[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label>Data inicial *</Label>
                  <Input type="date" value={form.data_alvo} onChange={(e) => {
                    const inicio = e.target.value;
                    setForm({ ...form, data_alvo: inicio });
                    if (duracaoPadrao(form.tipo) && inicio) sugerirDuracao(form.tipo, inicio);
                  }} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Data final</Label>
                  <Input type="date" min={form.data_alvo || undefined} value={form.data_fim}
                    onChange={(e) => setForm({ ...form, data_fim: e.target.value })} />
                  {duracaoPadrao(form.tipo) && (
                    <p className="text-[10px] text-muted-foreground">
                      Padrão legal: {duracaoPadrao(form.tipo)} dia(s) — ajuste se necessário.
                    </p>
                  )}
                </div>
              </div>
              <FundamentoLegalCard tipo={form.tipo} inicio={form.data_alvo} fim={form.data_fim} />
              <div className="grid gap-1.5">
                <Label>Comprovante {form.tipo === "atestado" ? "*" : "(pode anexar depois)"}</Label>
                <DpFilePicker accept="application/pdf,image/*" file={arquivo} onFileChange={setArquivo} />
                <p className="text-[10px] text-muted-foreground">PDF ou foto, até 15 MB.</p>
              </div>
              <div className="grid gap-1.5">
                <Label>Observação</Label>
                <Textarea rows={3} maxLength={500} placeholder="Contexto ou observação (opcional)"
                  value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            {etapa === "afastamento" ? (
              <>
                <Button variant="ghost" onClick={() => setEtapa("escolha")} disabled={salvar.isPending}>Voltar</Button>
                <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>
                  {salvar.isPending ? "Salvando..." : "Registrar"}
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
                <Button onClick={continuar} disabled={indisp.isPending || dispensa.isPending}>
                  {["indisponibilidade", "liberacao", "socio"].includes(motivo) ? (indisp.isPending || dispensa.isPending ? "Salvando..." : "Registrar") : "Continuar"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {selectedCompanyId && form.colaborador_id && (
        <AtribuirFolgaTriagemDialog
          open={folgaOpen}
          onOpenChange={setFolgaOpen}
          companyId={selectedCompanyId}
          colaboradorId={form.colaborador_id}
          colaboradorNome={nomeColab}
          dataIso={form.data_alvo}
          onDone={() => setFolgaOpen(false)}
        />
      )}

      <FeriasNovoModal
        open={feriasOpen}
        onOpenChange={setFeriasOpen}
        colaboradorId={form.colaborador_id}
        dataInicio={form.data_alvo}
      />
      <SuspensaoNovoModal
        open={suspOpen}
        onOpenChange={setSuspOpen}
        colaboradorId={form.colaborador_id}
        colaboradorNome={nomeColab}
        regime={ativos.find((c) => c.id === form.colaborador_id)?.regime ?? null}
        data={form.data_alvo}
      />
      <OcorrenciaFormDialog
        open={faltaOpen}
        onOpenChange={setFaltaOpen}
        colaboradores={ativos.map((c) => ({ id: c.id, nome: c.nome }))}
        dataInicial={form.data_alvo}
        colaboradorInicial={form.colaborador_id}
        saving={falta.isPending}
        onSubmit={(input) => falta.mutate(input)}
      />
    </>
  );
}
