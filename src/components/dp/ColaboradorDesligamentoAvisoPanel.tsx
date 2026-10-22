import { useState, type ReactNode } from "react";
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

/**
 * Desligamento na ficha: Registrar → Aviso em andamento → Desligado + pendências.
 * Toda data vem do servidor (motor oficial); nada é gravado sem confirmação.
 */
type Resultado = {
  modalidade: string; reducao?: string | null; data_comunicacao: string; inicio_aviso: string;
  ultimo_comparecimento: string | null; dispensado_desde: string | null; data_efetiva: string;
  projecao_indenizada: string; base_quitacao: string; prazo_10_dias: string; sugestao_pagamento: string;
  dias_aviso: number; dias_indenizados: number; avisos?: string[];
};
type Processo = Resultado & {
  id: string; status: string; motivo: string; revisao_motivo: string | null; comunicacao_confirmada_em: string | null;
  pagamento_previsto: string | null; pagamento_status: string; pagamento_em: string | null; pagamento_ref: string | null;
  valor_informado: number | null; pos_checklist: Record<string, boolean>; encerrado_admin_em: string | null;
};
export type RascunhoDesligamento = {
  data_comunicacao?: string; modalidade?: "trabalhado" | "indenizado"; reducao?: "duas_horas" | "sete_dias";
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
  r: Pick<Resultado, "ultimo_comparecimento" | "dispensado_desde" | "prazo_10_dias" | "base_quitacao"> & { sugestao_pagamento?: string | null };
  gestor?: boolean;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Card className="border-primary"><CardContent className="space-y-1 py-4">
        <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><CalendarCheck className="h-4 w-4" /> Último dia de trabalho</p>
        {r.ultimo_comparecimento
          ? <p className="text-2xl font-bold" data-testid="aviso-ultimo">{br(r.ultimo_comparecimento)} <span className="text-sm font-normal">({semana(r.ultimo_comparecimento)})</span></p>
          : <p className="text-lg font-semibold" data-testid="aviso-ultimo">Dispensado de comparecer a partir de {br(r.dispensado_desde)}</p>}
      </CardContent></Card>
      <Card className="border-primary"><CardContent className="space-y-1 py-4">
        <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Wallet className="h-4 w-4" /> Prazo para pagamento da rescisão</p>
        <p className="text-2xl font-bold" data-testid="aviso-prazo">{br(r.prazo_10_dias)} <span className="text-sm font-normal">({semana(r.prazo_10_dias)})</span></p>
        <p className="text-xs text-muted-foreground">10º dia corrido contado de {br(r.base_quitacao)}.</p>
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
      <div>Aviso: <strong>{r.dias_aviso} dias</strong>{r.dias_indenizados > 0 && <> ({r.dias_indenizados} indenizados)</>}</div>
      <div>Término do vínculo: <strong>{br(r.data_efetiva)}</strong></div>
      <div>Término com projeção: <strong>{br(r.projecao_indenizada)}</strong></div>
    </div>
  );
}

/** Formulário de condições (registrar e alterar compartilham). */
function Condicoes({ v, set, comMotivo }: {
  v: { motivo: string; modalidade: "trabalhado" | "indenizado"; reducao: "duas_horas" | "sete_dias"; comunicacao: string };
  set: (p: Partial<typeof v>) => void; comMotivo: boolean;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {comMotivo && (
        <div className="space-y-1">
          <Label>Motivo</Label>
          <Select value={v.motivo} onValueChange={(m) => set({ motivo: m })}>
            <SelectTrigger aria-label="Motivo"><SelectValue /></SelectTrigger>
            <SelectContent>{MOTIVO_DESLIGAMENTO_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      )}
      <div className="space-y-1">
        <Label htmlFor="desl-com">Data da comunicação</Label>
        <Input id="desl-com" type="date" value={v.comunicacao} max={hojeIsoLocal()} onChange={(e) => set({ comunicacao: e.target.value })} />
      </div>
      <div className="space-y-1">
        <Label>Aviso</Label>
        <RadioGroup value={v.modalidade} onValueChange={(m) => set({ modalidade: m as "trabalhado" | "indenizado" })} className="flex gap-4">
          <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="trabalhado" /> Trabalhado</label>
          <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="indenizado" /> Indenizado</label>
        </RadioGroup>
      </div>
      {v.modalidade === "trabalhado" && (
        <div className="space-y-1">
          <Label>Redução escolhida pelo colaborador</Label>
          <RadioGroup value={v.reducao} onValueChange={(m) => set({ reducao: m as "duas_horas" | "sete_dias" })} className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="duas_horas" /> 2 horas por dia</label>
            <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="sete_dias" /> 7 dias corridos no final</label>
          </RadioGroup>
        </div>
      )}
    </div>
  );
}

const AVISO_AUTO = "O desligamento é efetivado automaticamente logo depois do último dia do vínculo. Você recebe um aviso 2 dias antes. Até lá o colaborador segue ativo, com acesso ao portal.";

export function ColaboradorDesligamentoAvisoPanel({ colaboradorId, ativo, rascunho }: { colaboradorId: string; ativo: boolean; rascunho?: RascunhoDesligamento | null }) {
  const qc = useQueryClient();
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
  const recarregar = () => qc.invalidateQueries({ queryKey: ["dp_desligamento_processo", colaboradorId] });

  const [cond, setCondState] = useState({
    motivo: "dispensa_sem_justa_causa",
    modalidade: (rascunho?.modalidade ?? "trabalhado") as "trabalhado" | "indenizado",
    reducao: (rascunho?.reducao ?? "duas_horas") as "duas_horas" | "sete_dias",
    comunicacao: rascunho?.data_comunicacao ?? hojeIsoLocal(),
  });
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
  const [fimImped, setFimImped] = useState(hojeIsoLocal());
  const [retConf, setRetConf] = useState(false);

  const limpar = () => { setPrevia(null); setMensagem(null); setFormal(false); };
  const setCond = (p: Partial<typeof cond>) => { setCondState((c) => ({ ...c, ...p })); limpar(); };
  const condBody = () => ({ motivo: cond.motivo, modalidade: cond.modalidade, reducao: cond.modalidade === "trabalhado" ? cond.reducao : null, data_comunicacao: cond.comunicacao });
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
  const calcular = async (extra: Record<string, unknown>) => {
    setCarregando(true); limpar();
    const r = await chamar({ ...extra, ...condBody() });
    setCarregando(false);
    if (r.ok) setPrevia(r.corpo.resultado);
    else setMensagem({ texto: r.corpo?.error ?? "Não foi possível calcular.", erro: true });
  };
  const esperado = previa ? { ultimo: previa.ultimo_comparecimento, prazo: previa.prazo_10_dias, efetiva: previa.data_efetiva } : undefined;

  const Msg = mensagem && <Alert variant={mensagem.erro ? "destructive" : "default"} role="status"><AlertDescription>{mensagem.texto}</AlertDescription></Alert>;
  const Comparacao = previa && rascunho?.simulado && (rascunho.simulado.ultimo !== previa.ultimo_comparecimento || rascunho.simulado.prazo !== previa.prazo_10_dias) && (
    <Alert><AlertTriangle className="h-4 w-4" /><AlertDescription>
      As datas oficiais (jornada, escala e feriados cadastrados) diferem da simulação: na calculadora o último dia era {br(rascunho.simulado.ultimo)} e o prazo {br(rascunho.simulado.prazo)}. Valem as datas acima.
      {rascunho.simulado.comFolgas && " A simulação usava folgas compensatórias hipotéticas: elas não foram aprovadas nem lançadas. Para usá-las, lance as folgas na agenda e recalcule."}
    </AlertDescription></Alert>
  );

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
    return secao("Aviso prévio em andamento",
      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs">{pausado ? `Pausado: ${PAUSA[p.revisao_motivo ?? ""] ?? "em revisão"}` : `Colaborador ativo até ${br(p.data_efetiva)}`}</span>, <>
      <DatasDesligamento r={p} />
      <Detalhes r={p} />
      {pausado
        ? <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>A efetivação automática está pausada até a revisão. Altere as condições ou retome o aviso.</AlertDescription></Alert>
        : <Alert><AlertDescription>{AVISO_AUTO}</AlertDescription></Alert>}

      {!acao && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => { setCondState({ motivo: p.motivo, modalidade: p.modalidade === "indenizado" ? "indenizado" : "trabalhado", reducao: (p.reducao as "duas_horas" | "sete_dias") ?? "duas_horas", comunicacao: p.data_comunicacao }); setAcao("alterar"); }}>Alterar condições</Button>
          <Button size="sm" variant="outline" onClick={() => setAcao("reconsideracao")}>Reconsideração</Button>
          <Button size="sm" variant="outline" onClick={() => setAcao("ocorrencia")}>Registrar ocorrência</Button>
          {pausado && <Button size="sm" disabled={carregando} onClick={() => executar({ acao: "retomar", processo_id: p.id, idempotency_key: chave }, "Aviso retomado.")}>Retomar aviso</Button>}
          <Button size="sm" variant="ghost" onClick={() => setAcao("cancelar")}>Cancelar registro lançado por engano</Button>
        </div>
      )}

      {acao === "alterar" && (
        <div className="space-y-3 rounded-md border p-3">
          <Condicoes v={cond} set={setCond} comMotivo={false} />
          <Button size="sm" disabled={carregando} onClick={() => calcular({ acao: "alterar", processo_id: p.id, idempotency_key: chave, previa: true })}>Calcular novas datas</Button>
          {Msg}
          {previa && <>
            <DatasDesligamento r={previa} />
            <p className="text-xs text-muted-foreground">O colaborador será avisado no portal das novas datas.</p>
            <Button size="sm" disabled={carregando} onClick={() => executar({ acao: "alterar", processo_id: p.id, idempotency_key: chave, ...condBody(), esperado }, "Condições atualizadas.")}>Confirmar alteração</Button>
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
            <div className="space-y-1"><Label htmlFor="desl-oc-data">A partir de</Label><Input id="desl-oc-data" type="date" value={ocData} onChange={(e) => setOcData(e.target.value)} /></div>
          </div>
          <Label htmlFor="desl-oc-nota">Observação interna</Label>
          <Textarea id="desl-oc-nota" value={nota} onChange={(e) => setNota(e.target.value)} />
          <p className="text-xs text-muted-foreground">A efetivação automática fica pausada. Os efeitos sobre datas e pagamento dependem de análise: depois, altere as condições ou retome o aviso.</p>
          <div className="flex gap-2">
            <Button size="sm" disabled={carregando} onClick={() => executar({ acao: "ocorrencia", processo_id: p.id, idempotency_key: chave, tipo: ocTipo, data: ocData, nota }, "Ocorrência registrada. Aviso pausado para revisão.")}>Registrar</Button>
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
  return secao("Registrar aviso prévio", null, <>
    <p className="text-sm text-muted-foreground">Calcula com a jornada, a escala publicada e os feriados cadastrados. O colaborador continua ativo, com acesso ao portal, até o último dia do vínculo.</p>
    {rascunho && <p className="text-xs text-muted-foreground">Dados trazidos da calculadora para conferência. Nada foi gravado.</p>}
    <Condicoes v={cond} set={setCond} comMotivo />
    <Button onClick={() => calcular({ acao: "previa", colaborador_id: colaboradorId })} disabled={carregando || !cond.comunicacao}>{carregando ? "Calculando…" : "Calcular datas oficiais"}</Button>
    {Msg}
    {previa && (
      <div className="space-y-3">
        <DatasDesligamento r={previa} />
        <Detalhes r={previa} />
        {Comparacao}
        {previa.avisos?.map((a) => <p key={a} className="text-xs text-muted-foreground">{a}</p>)}
        <Alert><AlertDescription>{AVISO_AUTO}</AlertDescription></Alert>
        <label className="flex items-start gap-2 text-sm">
          <Checkbox checked={formal} onCheckedChange={(v) => setFormal(v === true)} aria-label="Comunicação formal entregue" />
          A comunicação formal do aviso foi entregue ao colaborador em {br(previa.data_comunicacao)}. As datas passam a aparecer no portal dele.
        </label>
        <Button onClick={() => executar({ acao: "confirmar", colaborador_id: colaboradorId, ...condBody(), comunicacao_formal: formal, idempotency_key: chave, esperado }, "Aviso prévio registrado. O colaborador continua ativo até o último dia.")} disabled={carregando || !formal}>Confirmar registro do aviso</Button>
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
