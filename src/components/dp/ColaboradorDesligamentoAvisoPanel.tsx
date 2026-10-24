import { CondicoesDesligamento as Condicoes, SEM_AVISO, SEM_AVISO_ASSISTIDO, type CondicoesValor } from "./CondicoesDesligamento";
export type { CondicoesValor } from "./CondicoesDesligamento";
import { BancoDesligamento, saldoDesligamento, simularBancoSobreCalendario } from "./BancoDesligamento";
import type { ResultadoDesligamento } from "@/lib/dp/compensacao/desligamentoMotor";
import { ehDispensaCumprimento } from "@/lib/dp/compensacao/desligamentoMotor";
import { useState, type ReactNode } from "react";
import type { DiagnosticoEscalaAviso } from "@/lib/dp/desligamento-escala-diagnostico";
import { formatarMinutos } from "@/lib/dp/compensacao/motor";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CalendarCheck, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MOTIVO_DESLIGAMENTO_OPTIONS } from "@/lib/dp/desligamento";
import { hojeIsoLocal } from "@/lib/dp/dataLocal";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { prepararUpload } from "@/lib/storage/uploadPolicy";
import { sanitizeStorageFilename } from "@/lib/storage";
import { DP_DOCUMENTOS_BUCKET } from "@/lib/documentoArquivo";
import { registrarDocumento } from "@/lib/dp/documentos-oficial";
import { Paperclip, X } from "lucide-react";

/**
 * Desligamento na ficha: Registrar → Aviso em andamento → Desligado + pendências.
 * Toda data vem do servidor (motor oficial); nada é gravado sem confirmação.
 */
type Resultado = {
  modalidade: string; reducao?: string | null; data_comunicacao: string; inicio_aviso: string;
  ultimo_comparecimento: string | null; dispensado_desde: string | null; data_efetiva: string;
  projecao_indenizada: string | null; base_quitacao: string; prazo_10_dias: string; sugestao_pagamento: string;
  dias_aviso: number; dias_indenizados: number; avisos?: string[];
  sem_aviso?: boolean; aviso_dispensado?: boolean; descontar_aviso?: boolean | null;
  simulacao?: ResultadoDesligamento; base_simulacao?: ResultadoDesligamento; saldo_banco_minutos?: number; folgas_compensatorias?: string[];
  termino_passado?: boolean; prazo_vencido?: boolean;
  diagnostico_escala?: DiagnosticoEscalaAviso | null; saldo_residual_minutos?: number;
  limite_sem_banco?: string | null;
};
type Processo = Resultado & {
  id: string; status: string; motivo: string; revisao_motivo: string | null; comunicacao_confirmada_em: string | null;
  pagamento_previsto: string | null; pagamento_status: string; pagamento_em: string | null; pagamento_ref: string | null;
  valor_informado: number | null; pos_checklist: Record<string, boolean>; encerrado_admin_em: string | null;
};
export type RascunhoDesligamento = {
  data_comunicacao?: string; modalidade?: "trabalhado" | "indenizado"; reducao?: "duas_horas" | "sete_dias" | null;
  motivo?: string; data_termino_acordada?: string | null; descontar_aviso?: boolean;
  saldo_banco_minutos?: number; folgas_compensatorias?: string[];
  /** Referência ilustrativa da simulação (com as folgas hipotéticas escolhidas); nunca vira aprovação. */
  simulado?: { ultimo: string | null; prazo: string; comFolgas?: boolean };
};

const br = (iso: string | null | undefined) => (iso ? iso.split("-").reverse().join("/") : "—");
const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const semana = (iso: string) => DIAS[new Date(`${iso}T00:00:00Z`).getUTCDay()];
const novaChave = () => crypto.randomUUID();
const PAUSA: Record<string, string> = {
  dispensa_cumprimento: "dispensa do cumprimento", novo_emprego: "novo emprego", afastamento: "afastamento",
  impedimento_legal: "impedimento legal", outro: "outra ocorrência", ferias_conflitantes: "férias em conflito",
  vinculo_ja_alterado: "cadastro já alterado",
};
const CHECK = [
  ["contabilidade", "Contabilidade informada"], ["acerto_recebido", "Dados do acerto recebidos"],
  ["itens_devolvidos", "Uniforme, chaves e itens devolvidos"], ["acessos_revogados", "Acessos internos revogados"],
] as const;

async function chamar(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("dp-desligamento-aviso", { body });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const corpo = ctx ? await ctx.json().catch(() => null) : null;
    return { ok: false as const, corpo: corpo ?? { error: "Não foi possível concluir. Tente de novo." } };
  }
  return { ok: true as const, corpo: data };
}

export function DatasDesligamento({ r, gestor = true }: {
  r: Pick<Resultado, "ultimo_comparecimento" | "dispensado_desde" | "prazo_10_dias" | "base_quitacao"> & { sugestao_pagamento?: string | null; sem_aviso?: boolean; data_efetiva?: string };
  gestor?: boolean;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Card className="border-primary"><CardContent className="space-y-1 py-4">
        <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><CalendarCheck className="h-4 w-4" /> {r.sem_aviso ? "Término do vínculo" : "Último comparecimento previsto"}</p>
        {r.sem_aviso
          ? <p className="text-2xl font-bold" data-testid="aviso-ultimo">{br(r.data_efetiva ?? null)} <span className="text-sm font-normal">({r.data_efetiva ? semana(r.data_efetiva) : ""})</span></p>
          : r.ultimo_comparecimento
            ? <p className="text-2xl font-bold" data-testid="aviso-ultimo">{br(r.ultimo_comparecimento)} <span className="text-sm font-normal">({semana(r.ultimo_comparecimento)})</span></p>
            : <p className="text-lg font-semibold" data-testid="aviso-ultimo">Dispensado de comparecer a partir de {br(r.dispensado_desde)}</p>}
      </CardContent></Card>
      <Card className="border-primary"><CardContent className="space-y-1 py-4">
        <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Wallet className="h-4 w-4" /> Prazo para pagamento da rescisão</p>
        <p className="text-2xl font-bold" data-testid="aviso-prazo">{br(r.prazo_10_dias)} <span className="text-sm font-normal">({semana(r.prazo_10_dias)})</span></p>
        <p className="text-xs text-muted-foreground">10º dia corrido contado de {br(r.base_quitacao)}.</p>
        {gestor && r.prazo_10_dias < hojeIsoLocal() && (
          <p className="text-xs font-medium text-destructive" data-testid="aviso-prazo-vencido">Este prazo já passou.</p>)}
        {gestor && r.sugestao_pagamento && r.sugestao_pagamento !== r.prazo_10_dias && (
          <p className="text-xs text-muted-foreground" data-testid="aviso-sugestao">Sugestão para a empresa: pagar até {br(r.sugestao_pagamento)} ({semana(r.sugestao_pagamento)}), último dia útil antes do prazo.</p>)}
      </CardContent></Card>
    </div>
  );
}

function Detalhes({ r }: { r: Resultado }) {
  return (
    <div className="grid gap-1 text-sm sm:grid-cols-2">
      <div>Comunicação: <strong>{br(r.data_comunicacao)}</strong></div>
      {ehDispensaCumprimento(r) ? (
        <>
          <div>Aviso: <strong>cumprimento dispensado pela empresa</strong></div>
          <div>Desconto do aviso: <strong>{r.descontar_aviso ? "sim (confirmar com a contabilidade)" : "não"}</strong></div>
        </>
      ) : (
        <>
          <div>Aviso: <strong>{r.dias_aviso} dias</strong>{r.dias_indenizados > 0 && <> ({r.dias_indenizados} indenizados)</>}</div>
          {r.projecao_indenizada && <div>Término com projeção: <strong>{br(r.projecao_indenizada)}</strong></div>}
        </>
      )}
      <div>Término do vínculo: <strong>{br(r.data_efetiva)}</strong></div>
    </div>
  );
}

const AVISO_AUTO = "O desligamento é efetivado automaticamente logo depois do último dia do vínculo. Você recebe um aviso 2 dias antes. Até lá o colaborador segue ativo, com acesso ao portal.";

export function ColaboradorDesligamentoAvisoPanel({ colaboradorId, ativo, rascunho }: { colaboradorId: string; ativo: boolean; rascunho?: RascunhoDesligamento | null }) {
  const qc = useQueryClient();
  const { selectedCompanyId } = useCompanyContext();
  const [anexos, setAnexos] = useState<File[]>([]);
  const proc = useQuery({
    queryKey: ["dp_desligamento_processo", colaboradorId],
    queryFn: async () => {
      const { data, error } = await supabase.from("dp_desligamento_processos").select("*")
        .eq("colaborador_id", colaboradorId).in("status", ["aviso_em_curso", "suspenso", "aguardando_revisao", "efetivado"])
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return data as unknown as Processo | null;
    },
  });
  const projecao = useQuery({
    queryKey: ["dp_desligamento_projecao", colaboradorId, proc.data?.id],
    enabled: proc.data?.status === "aviso_em_curso" && (proc.data?.saldo_banco_minutos ?? 0) > 0,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const id = proc.data?.id;
      if (!id) return null;
      const r = await chamar({ acao: "projecao", processo_id: id });
      if (!r.ok) throw new Error("Não foi possível atualizar a previsão. Confira o calendário e recalcule com o gestor.");
      return r.corpo.resultado as Resultado;
    },
  });
  const recarregar = () => { void qc.invalidateQueries({ queryKey: ["dp_desligamento_processo", colaboradorId] }); void qc.invalidateQueries({ queryKey: ["dp_desligamento_projecao", colaboradorId] }); };

  const [cond, setCondState] = useState<CondicoesValor>({
    motivo: rascunho?.motivo ?? "dispensa_sem_justa_causa",
    modalidade: (rascunho?.modalidade ?? "trabalhado") as "trabalhado" | "indenizado",
    reducao: (rascunho?.reducao ?? "duas_horas") as "duas_horas" | "sete_dias",
    comunicacao: rascunho?.data_comunicacao ?? hojeIsoLocal(),
    terminoAcordado: rascunho?.data_termino_acordada ?? "",
    descontar: rascunho?.descontar_aviso ?? false,
    pedidoEscrito: false,
    aceiteEmpresa: false,
    confirmacaoSemAviso: false,
  });
  const [saldoTxt, setSaldoTxt] = useState(rascunho?.saldo_banco_minutos ? String(rascunho.saldo_banco_minutos / 60) : "");
  const [saldoUnidade, setSaldoUnidade] = useState<"horas" | "dias">("horas");
  const [horasDia, setHorasDia] = useState("");
  const [folgas, setFolgas] = useState<string[]>(rascunho?.folgas_compensatorias ?? []);
  const [calendario, setCalendario] = useState<ResultadoDesligamento | null>(null);
  const [baseCalendario, setBaseCalendario] = useState<ResultadoDesligamento | null>(null);
  const saldo = saldoDesligamento(saldoTxt, saldoUnidade, horasDia);
  const [previa, setPrevia] = useState<Resultado | null>(null);
  const [mensagem, setMensagem] = useState<{ texto: string; erro: boolean } | null>(null);
  const [formal, setFormal] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [chave, setChave] = useState(novaChave);
  const [acao, setAcao] = useState<null | "alterar" | "reconsideracao" | "ocorrencia" | "cancelar" | "retomar">(null);
  const [nota, setNota] = useState("");
  const [ocTipo, setOcTipo] = useState("dispensa_cumprimento");
  const [ocData, setOcData] = useState(hojeIsoLocal());
  const [ocComprovado, setOcComprovado] = useState(false);
  const [ocPedido, setOcPedido] = useState(false);
  const [fimImped, setFimImped] = useState(hojeIsoLocal());
  const [retConf, setRetConf] = useState(false);

  const limpar = () => { setPrevia(null); setMensagem(null); setFormal(false); };
  const setCond = (p: Partial<CondicoesValor>) => { setCondState((c) => ({ ...c, ...p })); setCalendario(null); setBaseCalendario(null); setFolgas([]); limpar(); };
  const condBody = () => ({
    motivo: cond.motivo, modalidade: cond.modalidade,
    reducao: cond.modalidade === "trabalhado" && cond.motivo === "dispensa_sem_justa_causa" ? cond.reducao : null,
    data_comunicacao: cond.comunicacao,
    data_termino_acordada: cond.motivo === "pedido_demissao" && cond.modalidade === "indenizado" && cond.terminoAcordado ? cond.terminoAcordado : null,
    descontar_aviso: cond.motivo === "pedido_demissao" && cond.modalidade === "indenizado" ? cond.descontar : undefined,
    saldo_banco_minutos: !SEM_AVISO.has(cond.motivo) && cond.modalidade === "trabalhado" ? saldo.minutos ?? 0 : 0,
    folgas_compensatorias: !SEM_AVISO.has(cond.motivo) && cond.modalidade === "trabalhado" ? folgas : [],
    concentrar_final: folgas.length === 0,
    pedido_escrito: cond.pedidoEscrito, aceite_empresa: cond.aceiteEmpresa,
    confirmacao_sem_aviso: SEM_AVISO_ASSISTIDO.has(cond.motivo) ? cond.confirmacaoSemAviso : undefined,
  });
  const pedidoDispensadoPendente = cond.motivo === "pedido_demissao" && cond.modalidade === "indenizado" && (!cond.pedidoEscrito || !cond.aceiteEmpresa);
  const semAvisoPendente = SEM_AVISO_ASSISTIDO.has(cond.motivo) && !cond.confirmacaoSemAviso;
  const fechar = () => { setAcao(null); limpar(); setNota(""); setChave(novaChave()); };

  const executar = async (body: Record<string, unknown>, sucesso: string) => {
    setCarregando(true);
    const r = await chamar(body);
    setCarregando(false);
    if (r.ok) { toast.success(sucesso); fechar(); recarregar(); return true; }
    if (r.corpo?.divergente) { setPrevia(r.corpo.resultado); setFormal(false); setMensagem({ texto: "As datas oficiais mudaram. Confira e confirme de novo.", erro: false }); }
    else setMensagem({ texto: r.corpo?.error ?? "Não foi possível concluir.", erro: true });
    return false;
  };
  /** Registra e, depois, guarda os anexos em Documentos (tipo Aviso Prévio). */
  const confirmarRegistro = async () => {
    setCarregando(true);
    const r = await chamar({ acao: "confirmar", colaborador_id: colaboradorId, ...condBody(), comunicacao_formal: formal, idempotency_key: chave, esperado });
    if (!r.ok) {
      setCarregando(false);
      if (r.corpo?.divergente) { setPrevia(r.corpo.resultado); setFormal(false); setMensagem({ texto: "As datas oficiais mudaram. Confira e confirme de novo.", erro: false }); }
      else setMensagem({ texto: r.corpo?.error ?? "Não foi possível concluir.", erro: true });
      return;
    }
    let falhas = 0;
    for (const escolhido of anexos) {
      try {
        if (!selectedCompanyId) throw new Error("Empresa não selecionada");
        const file = await prepararUpload(DP_DOCUMENTOS_BUCKET, escolhido);
        const path = `${selectedCompanyId}/${colaboradorId}/${Date.now()}-${sanitizeStorageFilename(file.name)}`;
        const up = await supabase.storage.from(DP_DOCUMENTOS_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
        if (up.error) throw up.error;
        await registrarDocumento({
          company_id: selectedCompanyId, colaborador_id: colaboradorId, tipo: "aviso_previo",
          titulo: anexos.length > 1 ? file.name.replace(/\.[^.]+$/, "") : "Comprovante do desligamento",
          descricao: "Anexado no registro do desligamento", file_path: path, file_name: file.name,
          file_size: file.size, mime_type: file.type, referencia_data: cond.comunicacao,
        });
      } catch { falhas++; }
    }
    setCarregando(false);
    const base = r.corpo?.efetivado ? "Desligamento registrado e efetivado." : "Desligamento registrado.";
    if (falhas) toast.warning(`${base} ${falhas} anexo(s) não foram enviados: anexe pela aba Documentos.`);
    else toast.success(anexos.length ? `${base} ${anexos.length} anexo(s) guardado(s) em Documentos.` : base);
    setAnexos([]);
    qc.invalidateQueries({ queryKey: ["dp_documentos"] });
    qc.invalidateQueries({ queryKey: ["dp_colaboradores"] });
    qc.invalidateQueries({ queryKey: ["dp_folgas"] });
    qc.invalidateQueries({ queryKey: ["dp_operacao"] });
    fechar(); recarregar();
  };
  const calcular = async (extra: Record<string, unknown>) => {
    setCarregando(true); limpar();
    const r = await chamar({ ...extra, ...condBody() });
    setCarregando(false);
    if (r.ok) { setPrevia(r.corpo.resultado); setCalendario(r.corpo.resultado.simulacao ?? null); setBaseCalendario(r.corpo.resultado.base_simulacao ?? null); setFolgas(r.corpo.resultado.folgas_compensatorias ?? []); }
    else setMensagem({ texto: r.corpo?.error ?? "Não foi possível calcular.", erro: true });
  };
  const esperado = previa ? { ultimo: previa.ultimo_comparecimento, prazo: previa.prazo_10_dias, efetiva: previa.data_efetiva } : undefined;

  const Msg = mensagem && <Alert variant={mensagem.erro ? "destructive" : "default"} role="status"><AlertDescription>{mensagem.texto}</AlertDescription></Alert>;
  const Comparacao = previa && rascunho?.simulado && (rascunho.simulado.ultimo !== previa.ultimo_comparecimento || rascunho.simulado.prazo !== previa.prazo_10_dias) && (
    <Alert><AlertTriangle className="h-4 w-4" /><AlertDescription>
      As datas oficiais (jornada, escala e feriados cadastrados) diferem da simulação: na calculadora o último dia era {br(rascunho.simulado.ultimo)} e o prazo {br(rascunho.simulado.prazo)}. Valem as datas acima.
      {rascunho.simulado.comFolgas && " A simulação usava folgas compensatórias hipotéticas: elas serão conferidas e lançadas somente ao confirmar este registro."}
    </AlertDescription></Alert>
  );
  const Diagnostico = previa?.diagnostico_escala && <RevisaoCalendario r={previa} />;

  const Banco = !SEM_AVISO.has(cond.motivo) && cond.modalidade === "trabalhado" && <BancoDesligamento
    texto={saldoTxt} unidade={saldoUnidade} horasDia={horasDia} folgas={folgas} base={baseCalendario} bloqueado={previa?.diagnostico_escala?.apto === false} resultado={baseCalendario && saldo.minutos !== null ? simularBancoSobreCalendario(baseCalendario, saldo.minutos, folgas) : calendario}
    set={(v) => { if (v.texto !== undefined) setSaldoTxt(v.texto); if (v.unidade) setSaldoUnidade(v.unidade); if (v.horasDia !== undefined) setHorasDia(v.horasDia); setFolgas([]); setCalendario(null); setBaseCalendario(null); limpar(); }}
    onFolgas={(datas) => { setFolgas(datas); setFormal(false); setPrevia(null); }} />;

  if (proc.isLoading) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (proc.isError) return <Alert variant="destructive"><AlertDescription>Não foi possível carregar o desligamento.</AlertDescription></Alert>;

  const p = proc.data;
  const secao = (titulo: string, selo: ReactNode, corpo: ReactNode) => (
    <section className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{titulo}</h3>{selo}</div>
      {corpo}
    </section>
  );

  // ---------- Desligado + pendências
  if (p?.status === "efetivado") {
    return secao("Desligado", <span className="rounded-full bg-muted px-2 py-0.5 text-xs">Vínculo encerrado em {br(p.data_efetiva)}</span>, <>
      <DatasDesligamento r={p} />
      <PosDesligamento p={p} carregando={carregando} executar={executar} />
    </>);
  }

  // ---------- Aviso em andamento
  if (p) {
    const pausado = p.status !== "aviso_em_curso";
    // Antecipação só com as duas declarações; sem elas vira ocorrência pausada para revisão.
    const termino = ocTipo === "novo_emprego" && ocPedido && ocComprovado && p.modalidade === "trabalhado";
    return secao("Aviso prévio em andamento",
      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs">{pausado ? `Pausado: ${PAUSA[p.revisao_motivo ?? ""] ?? "em revisão"}` : `Colaborador ativo até ${br(p.data_efetiva)}`}</span>, <>
      <DatasDesligamento r={p} />
      <Detalhes r={p} />
      {projecao.data && <>
        <RevisaoCalendario r={projecao.data} />
        <BancoResumo r={projecao.data} />
        <p className="text-sm">Simulação atual de concentração no final: <strong>{br(projecao.data.ultimo_comparecimento)}</strong> · limite original sem banco: <strong>{br(projecao.data.limite_sem_banco)}</strong>.</p>
        {!projecao.data.limite_sem_banco && <p className="text-xs text-muted-foreground">Registro anterior: a referência original sem banco não foi guardada. Confira a comunicação do aviso; o sistema não inventa essa data.</p>}
        {projecao.data.ultimo_comparecimento !== p.ultimo_comparecimento && <Alert><AlertDescription>A previsão mudou com o calendário. As folgas compensatórias registradas continuam como estavam; confira e confirme o ajuste em Alterar condições antes de mudar o comparecimento combinado.</AlertDescription></Alert>}
      </>}
      {projecao.isError && <Alert><AlertDescription>Não foi possível atualizar a simulação do banco. A data acima é a última registrada; revise o calendário antes de combinar o comparecimento.</AlertDescription></Alert>}
      {pausado
        ? <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>
            A efetivação automática está pausada até a revisão.
            {p.status === "suspenso"
              ? " Afastamento ou impedimento: só retome depois que ele terminar, com a evidência registrada. As datas não são prorrogadas sozinhas — se o término mudou, cancele e registre de novo com orientação da contabilidade."
              : p.revisao_motivo === "dispensa_cumprimento"
                ? " Dispensa do restante do cumprimento pela empresa: o efeito sobre o término e o prazo depende de análise jurídica. Faça o término pelo registro manual com orientação da contabilidade."
                : " Altere as condições (o sistema recalcula) ou retome o aviso com justificativa."}
          </AlertDescription></Alert>
        : <Alert><AlertDescription>{AVISO_AUTO}</AlertDescription></Alert>}

      {!acao && (
        <div className="flex flex-wrap gap-2">
          {p.status !== "suspenso" && <Button size="sm" variant="outline" onClick={() => { setCondState({ motivo: p.motivo, modalidade: p.modalidade === "indenizado" || p.modalidade === "dispensado_cumprimento" ? "indenizado" : "trabalhado", reducao: (p.reducao as "duas_horas" | "sete_dias") ?? "duas_horas", comunicacao: p.data_comunicacao, terminoAcordado: "", descontar: p.descontar_aviso === true, pedidoEscrito: false, aceiteEmpresa: false, confirmacaoSemAviso: false }); setSaldoTxt(p.saldo_banco_minutos ? String(p.saldo_banco_minutos / 60) : ""); setSaldoUnidade("horas"); setFolgas(p.folgas_compensatorias ?? []); setCalendario(null); setBaseCalendario(null); setAcao("alterar"); }}>Alterar condições</Button>}
          <Button size="sm" variant="outline" onClick={() => setAcao("reconsideracao")}>Reconsideração</Button>
          <Button size="sm" variant="outline" onClick={() => setAcao("ocorrencia")}>Registrar ocorrência</Button>
          {pausado && <Button size="sm" onClick={() => setAcao("retomar")}>Retomar aviso…</Button>}
          {p.status === "aviso_em_curso" && <Button size="sm" variant="ghost" onClick={() => setAcao("cancelar")}>Cancelar registro lançado por engano</Button>}
        </div>
      )}

      {acao === "retomar" && (
        <div className="space-y-2 rounded-md border p-3">
          <p className="text-sm">Retomar volta a contar para a efetivação automática em {br(p.data_efetiva)}. O sistema confere férias, atestados e licenças registrados; o restante depende da sua verificação.</p>
          {p.status === "suspenso" && <div className="space-y-1"><Label htmlFor="desl-fim-imp">O afastamento/impedimento terminou em</Label>
            <Input id="desl-fim-imp" type="date" value={fimImped} onChange={(e) => setFimImped(e.target.value)} /></div>}
          <Label htmlFor="desl-ret-just">Justificativa e evidência (o que resolveu a pausa)</Label>
          <Textarea id="desl-ret-just" value={nota} onChange={(e) => setNota(e.target.value)} />
          <label className="flex items-start gap-2 text-sm"><Checkbox checked={retConf} onCheckedChange={(v) => setRetConf(v === true)} />
            <span>Conferi que não há afastamento, estabilidade ou outro impedimento em curso e que as datas acima continuam válidas.</span></label>
          <div className="flex gap-2">
            <Button size="sm" disabled={carregando || !retConf || nota.trim().length < 20}
              onClick={() => executar({ acao: "retomar", processo_id: p.id, idempotency_key: chave, justificativa: nota, confirmado: true, ...(p.status === "suspenso" ? { fim_impedimento: fimImped } : {}) }, "Aviso retomado.")}>Confirmar retomada</Button>
            <Button size="sm" variant="ghost" onClick={() => { fechar(); setRetConf(false); }}>Voltar</Button>
          </div>
          <p className="text-xs text-muted-foreground">Mínimo de 20 caracteres. A retomada fica registrada no histórico com seu usuário.</p>
          {Msg}
        </div>
      )}

      {acao === "alterar" && (
        <div className="space-y-3 rounded-md border p-3">
          <Condicoes v={cond} set={setCond} comMotivo={false} />
          {Banco}
          <Button size="sm" disabled={carregando || saldo.minutos === null} onClick={() => calcular({ acao: "alterar", processo_id: p.id, idempotency_key: chave, previa: true })}>Calcular novas datas</Button>
          {Diagnostico}
          {Msg}
          {previa && <>
            <DatasDesligamento r={previa} />
            <p className="text-xs text-muted-foreground">O colaborador será avisado no portal das novas datas.</p>
            <Button size="sm" disabled={carregando || ((saldo.minutos ?? 0) > 0 && previa.diagnostico_escala?.apto === false)} onClick={() => executar({ acao: "alterar", processo_id: p.id, idempotency_key: chave, ...condBody(), esperado }, "Condições atualizadas.")}>Confirmar alteração</Button>
          </>}
          <Button size="sm" variant="ghost" onClick={fechar}>Voltar</Button>
        </div>
      )}

      {acao === "reconsideracao" && (
        <div className="space-y-2 rounded-md border p-3">
          <p className="text-sm">Reconsideração (art. 489 da CLT): só encerra o aviso se a outra parte <strong>aceitou</strong>. O vínculo continua o mesmo, sem nova admissão.</p>
          <Label htmlFor="desl-nota">Evidência (como e quando foi aceita ou recusada)</Label>
          <Textarea id="desl-nota" value={nota} onChange={(e) => setNota(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={carregando || nota.trim().length < 5} onClick={() => executar({ acao: "reconsideracao", processo_id: p.id, idempotency_key: chave, resultado: "aceita", nota }, "Reconsideração aceita: aviso encerrado, colaborador segue ativo.")}>Foi aceita</Button>
            <Button size="sm" variant="outline" disabled={carregando || nota.trim().length < 5} onClick={() => executar({ acao: "reconsideracao", processo_id: p.id, idempotency_key: chave, resultado: "recusada", nota }, "Recusa registrada: o aviso continua.")}>Foi recusada</Button>
            <Button size="sm" variant="ghost" onClick={fechar}>Voltar</Button>
          </div>
          <p className="text-xs text-muted-foreground">Folgas e escalas não são refeitas sozinhas: revise a agenda do colaborador depois de aceitar.</p>
          {Msg}
        </div>
      )}

      {acao === "ocorrencia" && (
        <div className="space-y-2 rounded-md border p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>O que aconteceu</Label>
              <Select value={ocTipo} onValueChange={setOcTipo}>
                <SelectTrigger aria-label="Tipo de ocorrência"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="dispensa_cumprimento">Empresa dispensou o restante do cumprimento</SelectItem>
                  <SelectItem value="novo_emprego">Colaborador conseguiu novo emprego</SelectItem>
                  <SelectItem value="afastamento">Afastamento (atestado, INSS)</SelectItem>
                  <SelectItem value="impedimento_legal">Impedimento legal (ex.: estabilidade)</SelectItem>
                  <SelectItem value="outro">Outra situação</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label htmlFor="desl-oc-data">{ocTipo === "novo_emprego" ? "Último dia trabalhado" : "A partir de"}</Label><Input id="desl-oc-data" type="date" value={ocData} onChange={(e) => setOcData(e.target.value)} /></div>
          </div>
          {ocTipo === "novo_emprego" && p.modalidade === "trabalhado" && (
            <div className="space-y-2 rounded-md bg-muted/40 p-2">
              <label className="flex items-start gap-2 text-sm"><Checkbox checked={ocPedido} onCheckedChange={(v) => setOcPedido(v === true)} />
                <span>O colaborador pediu por escrito a dispensa do restante do aviso.</span></label>
              <label className="flex items-start gap-2 text-sm"><Checkbox checked={ocComprovado} onCheckedChange={(v) => setOcComprovado(v === true)} />
                <span>O novo emprego foi comprovado.</span></label>
              <p className="text-xs text-muted-foreground">Guarde o pedido e o comprovante no GED ou com a contabilidade; esta declaração não substitui a prova. O vínculo termina no último dia trabalhado (já ocorrido) e o prazo de 10 dias conta dessa data. O tratamento das verbas depende de conferência da contabilidade; a AVETO calcula datas do processo.</p>
            </div>
          )}
          {ocTipo === "novo_emprego" && p.modalidade !== "trabalhado" && (
            <p className="text-xs text-muted-foreground">Em aviso indenizado ou misto o efeito do novo emprego depende de análise: fica pausado para revisão manual.</p>
          )}
          <Label htmlFor="desl-oc-nota">{termino ? "Evidência: como e quando houve o pedido e a comprovação (mín. 20 caracteres)" : "Observação interna"}</Label>
          <Textarea id="desl-oc-nota" value={nota} onChange={(e) => setNota(e.target.value)} />
          <p className="text-xs text-muted-foreground">{termino
            ? "As novas datas são calculadas no servidor e publicadas ao colaborador."
            : "A efetivação automática fica pausada. Nenhuma data é alterada: os efeitos dependem de análise e da sua decisão registrada."}</p>
          <div className="flex gap-2">
            <Button size="sm" disabled={carregando || (termino && nota.trim().length < 20)} onClick={() => executar({ acao: "ocorrencia", processo_id: p.id, idempotency_key: chave, tipo: ocTipo, data: ocData, nota, ...(termino ? { aplicar_termino: true, pedido_dispensado_pelo_empregado: true, novo_emprego_comprovado: true } : {}) },
              termino ? "Término antecipado registrado com as novas datas." : "Ocorrência registrada. Aviso pausado para revisão.")}>Registrar</Button>
            <Button size="sm" variant="ghost" onClick={fechar}>Voltar</Button>
          </div>
          {Msg}
        </div>
      )}

      {acao === "cancelar" && (
        <div className="space-y-2 rounded-md border p-3">
          <Label htmlFor="desl-just">Justificativa</Label>
          <Textarea id="desl-just" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Por que o registro foi lançado por engano" />
          <p className="text-xs text-muted-foreground">Use só para erro de lançamento. Desistência combinada entre as partes é "Reconsideração".</p>
          <div className="flex gap-2">
            <Button size="sm" variant="destructive" disabled={carregando || nota.trim().length < 5} onClick={() => executar({ acao: "cancelar", processo_id: p.id, justificativa: nota }, "Registro cancelado.")}>Confirmar cancelamento</Button>
            <Button size="sm" variant="ghost" onClick={fechar}>Voltar</Button>
          </div>
          {Msg}
        </div>
      )}

      {!acao && <PosDesligamento p={p} carregando={carregando} executar={executar} />}
    </>);
  }

  if (!ativo) return null;

  // ---------- Registrar
  return secao("Registrar desligamento", null, <>
    <p className="text-sm text-muted-foreground">Informe o motivo e a data, mesmo que já tenham passado. O sistema mostra o último dia de trabalho e o prazo final do pagamento, com a jornada, a escala publicada e os feriados cadastrados.</p>
    {rascunho && <p className="text-xs text-muted-foreground">Dados trazidos da calculadora para conferência. Nada foi gravado.</p>}
    <Condicoes v={cond} set={setCond} comMotivo />
    {Banco}
    <Button onClick={() => calcular({ acao: "previa", colaborador_id: colaboradorId })} disabled={carregando || !cond.comunicacao || saldo.minutos === null}>{carregando ? "Calculando…" : "Calcular datas oficiais"}</Button>
    {Msg}
    {Diagnostico}
    {previa && (
      <div className="space-y-3">
        <DatasDesligamento r={previa} />
        <Detalhes r={previa} />
        {Comparacao}
        {previa.avisos?.map((a) => <p key={a} className="text-xs text-muted-foreground">{a}</p>)}
        {previa.termino_passado
          ? <Alert><AlertDescription>O término já passou. Ao confirmar, o desligamento é efetivado na hora e as folgas e pedidos pendentes depois do término são cancelados.</AlertDescription></Alert>
          : <Alert><AlertDescription>{AVISO_AUTO}</AlertDescription></Alert>}
        <div className="space-y-2">
          <Label htmlFor="desl-anexos">Anexos (opcional): carta do pedido, comunicação assinada, e-mail</Label>
          <Input id="desl-anexos" type="file" multiple accept="application/pdf,image/*"
            onChange={(e) => { const fs = Array.from(e.target.files ?? []); setAnexos((a) => [...a, ...fs]); e.currentTarget.value = ""; }} />
          {anexos.length > 0 && (
            <ul className="space-y-1">
              {anexos.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center gap-2 text-sm">
                  <Paperclip className="h-4 w-4 shrink-0" /><span className="truncate">{f.name}</span>
                  <Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label={`Remover ${f.name}`} onClick={() => setAnexos((a) => a.filter((_, j) => j !== i))}><X className="h-4 w-4" /></Button>
                </li>))}
            </ul>)}
          <p className="text-xs text-muted-foreground">Os arquivos ficam na aba Documentos do colaborador, como Aviso Prévio.</p>
        </div>
        <label className="flex items-start gap-2 text-sm">
          <Checkbox checked={formal} onCheckedChange={(v) => setFormal(v === true)} aria-label="Comunicação formal entregue" />
          A comunicação formal do aviso foi entregue ao colaborador em {br(previa.data_comunicacao)}. As datas passam a aparecer no portal dele.
        </label>
        {pedidoDispensadoPendente && <p className="text-xs text-destructive">Marque as duas declarações (pedido escrito e aceite da empresa) para confirmar.</p>}
        {semAvisoPendente && <p className="text-xs text-destructive">Confirme a validação da data de término para este motivo.</p>}
        <Button onClick={() => void confirmarRegistro()} disabled={carregando || !formal || pedidoDispensadoPendente || semAvisoPendente || ((saldo.minutos ?? 0) > 0 && previa.diagnostico_escala?.apto === false)}>{carregando ? "Registrando…" : "Confirmar registro"}</Button>
      </div>
    )}
  </>);
}

/** Acompanhamento pós: pagamento informado, checklist e fechamento administrativo. */
function PosDesligamento({ p, carregando, executar }: { p: Processo; carregando: boolean; executar: (b: Record<string, unknown>, s: string) => Promise<boolean> }) {
  const [prev, setPrev] = useState(p.pagamento_previsto ?? "");
  const [status, setStatus] = useState(p.pagamento_status);
  const [pagoEm, setPagoEm] = useState(p.pagamento_em ?? "");
  const [ref, setRef] = useState(p.pagamento_ref ?? "");
  const [valor, setValor] = useState(p.valor_informado != null ? String(p.valor_informado) : "");
  const [lista, setLista] = useState<Record<string, boolean>>(p.pos_checklist ?? {});
  const encerrado = !!p.encerrado_admin_em;
  const salvar = () => executar({
    acao: "pos", processo_id: p.id, idempotency_key: crypto.randomUUID(),
    pagamento_previsto: prev || null, pagamento_status: status, pagamento_em: pagoEm || null, pagamento_ref: ref || null,
    valor_informado: valor.trim() ? Number(valor.replace(",", ".")) : null, checklist: lista,
  }, "Acompanhamento salvo.");
  const tudo = CHECK.every(([k]) => lista[k]) && p.pagamento_status === "pago";
  return (
    <div className="space-y-3 rounded-md border p-3">
      <h4 className="text-sm font-semibold">Pagamento e pendências</h4>
      <BancoResumo r={p} />
      {encerrado && <p className="text-xs text-muted-foreground">Fechado administrativamente em {new Date(p.encerrado_admin_em!).toLocaleDateString("pt-BR")}.</p>}
      <fieldset disabled={encerrado || carregando} className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1"><Label htmlFor="pos-prev">Pagamento previsto</Label><Input id="pos-prev" type="date" value={prev} onChange={(e) => setPrev(e.target.value)} /></div>
          <div className="space-y-1">
            <Label>Situação</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger aria-label="Situação do pagamento"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="pendente">Pendente</SelectItem><SelectItem value="programado">Programado</SelectItem><SelectItem value="pago">Pago</SelectItem></SelectContent>
            </Select>
          </div>
          {status === "pago" && <>
            <div className="space-y-1"><Label htmlFor="pos-pago">Pago em</Label><Input id="pos-pago" type="date" value={pagoEm} onChange={(e) => setPagoEm(e.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="pos-ref">Referência (comprovante, banco)</Label><Input id="pos-ref" value={ref} onChange={(e) => setRef(e.target.value)} /></div>
          </>}
          <div className="space-y-1"><Label htmlFor="pos-valor">Valor informado pela contabilidade (opcional)</Label><Input id="pos-valor" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} /></div>
        </div>
        <div className="grid gap-1">
          {CHECK.map(([k, rotulo]) => (
            <label key={k} className="flex items-center gap-2 text-sm">
              <Checkbox checked={!!lista[k]} onCheckedChange={(v) => setLista((l) => ({ ...l, [k]: v === true }))} aria-label={rotulo} /> {rotulo}
            </label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">O sistema não calcula verbas nem encargos: esses dados vêm da contabilidade. O valor fica visível só para a gestão.</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={salvar} disabled={status === "pago" && !pagoEm}>Salvar acompanhamento</Button>
          {p.status === "efetivado" && (
            <Button size="sm" variant="outline" disabled={!tudo} title={tudo ? undefined : "Marque o pagamento como pago e conclua as pendências"}
              onClick={() => executar({ acao: "encerrar_admin", processo_id: p.id, idempotency_key: crypto.randomUUID() }, "Desligamento fechado.")}>Fechar desligamento</Button>
          )}
        </div>
      </fieldset>
    </div>
  );
}

function BancoResumo({ r }: { r: Resultado }) {
  const saldo = r.saldo_banco_minutos ?? 0;
  const residual = r.saldo_residual_minutos ?? r.simulacao?.saldoResidualMinutos ?? saldo;
  if (!saldo) return null;
  return <p className="rounded-md bg-muted p-3 text-sm">Banco de horas simulado: <strong>{formatarMinutos(saldo - residual)}</strong> compensadas no aviso · <strong>{formatarMinutos(residual)}</strong> residuais para conferir e quitar na rescisão. Confirme o saldo final com a contabilidade; este registro não comprova pagamento.</p>;
}

function RevisaoCalendario({ r }: { r: Resultado }) {
  const d = r.diagnostico_escala;
  if (!d) return null;
  return <Alert><AlertTriangle className="h-4 w-4" /><AlertDescription className="space-y-2">
    <p className="font-medium">Conferência das folgas antes da compensação</p>
    <p>Defina as folgas semanais e dominicais até {br(d.limiteSemBanco)} (limite sem banco). Regra aplicada: {d.origem}.</p>
    {d.pendencias.map((p) => <p key={p}>{p}</p>)}
    {d.apto && <p>Os descansos cadastrados cobrem a regra neste intervalo. A análise não substitui a conferência de períodos anteriores à comunicação.</p>}
    <Button asChild size="sm" variant="outline"><Link to={`/dp/calendario?mes=${r.inicio_aviso.slice(0, 7)}`}>Revisar calendário do mês</Link></Button>
    <p className="text-xs">O atalho não marca nem remarca folgas. Volte e calcule novamente depois de ajustar.</p>
  </AlertDescription></Alert>;
}
