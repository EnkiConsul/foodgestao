import { useState } from "react";
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
 * Aviso prévio com data futura: o servidor recalcula com o motor oficial e
 * grava o processo sem inativar o vínculo nem o portal.
 */
type Resultado = {
  modalidade: string; data_comunicacao: string; inicio_aviso: string;
  ultimo_comparecimento: string | null; dispensado_desde: string | null; data_efetiva: string;
  projecao_indenizada: string; base_quitacao: string; prazo_10_dias: string; sugestao_pagamento: string;
  dias_aviso: number; dias_indenizados: number; avisos?: string[];
};
type Processo = Resultado & { id: string; status: string; comunicacao_confirmada_em: string | null };

const br = (iso: string | null | undefined) => (iso ? iso.split("-").reverse().join("/") : "—");
const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const semana = (iso: string) => DIAS[new Date(`${iso}T00:00:00Z`).getUTCDay()];

async function chamar(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("dp-desligamento-aviso", { body });
  if (error) {
    // Respostas 4xx trazem o motivo no corpo.
    const ctx = (error as { context?: Response }).context;
    const corpo = ctx ? await ctx.json().catch(() => null) : null;
    return { ok: false as const, corpo: corpo ?? { error: error.message } };
  }
  return { ok: true as const, corpo: data };
}

export function DatasDesligamento({ r, gestor = true }: { r: Pick<Resultado, "ultimo_comparecimento" | "dispensado_desde" | "prazo_10_dias" | "sugestao_pagamento" | "base_quitacao">; gestor?: boolean }) {
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
        {gestor && r.sugestao_pagamento !== r.prazo_10_dias && (
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

export type RascunhoDesligamento = { data_comunicacao?: string; modalidade?: "trabalhado" | "indenizado"; reducao?: "duas_horas" | "sete_dias" };

export function ColaboradorDesligamentoAvisoPanel({ colaboradorId, ativo, rascunho }: { colaboradorId: string; ativo: boolean; rascunho?: RascunhoDesligamento | null }) {
  const qc = useQueryClient();
  const proc = useQuery({
    queryKey: ["dp_desligamento_processo", colaboradorId],
    queryFn: async () => {
      const { data, error } = await supabase.from("dp_desligamento_processos")
        .select("*").eq("colaborador_id", colaboradorId)
        .in("status", ["aviso_em_curso", "suspenso", "aguardando_revisao"]).maybeSingle();
      if (error) throw error;
      return data as unknown as Processo | null;
    },
  });

  const [motivo, setMotivo] = useState("dispensa_sem_justa_causa");
  const [modalidade, setModalidade] = useState<"trabalhado" | "indenizado">(rascunho?.modalidade ?? "trabalhado");
  const [reducao, setReducao] = useState<"duas_horas" | "sete_dias">(rascunho?.reducao ?? "duas_horas");
  const [comunicacao, setComunicacao] = useState(rascunho?.data_comunicacao ?? hojeIsoLocal());
  const [previa, setPrevia] = useState<Resultado | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [formal, setFormal] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [chave, setChave] = useState(() => crypto.randomUUID());
  const [justificativa, setJustificativa] = useState("");
  const [cancelando, setCancelando] = useState(false);

  const limpar = () => { setPrevia(null); setMensagem(null); setFormal(false); };
  const base = () => ({ colaborador_id: colaboradorId, motivo, modalidade, reducao: modalidade === "trabalhado" ? reducao : null, data_comunicacao: comunicacao });

  const calcular = async () => {
    setCarregando(true); limpar();
    const r = await chamar({ acao: "previa", ...base() });
    setCarregando(false);
    if (r.ok) setPrevia(r.corpo.resultado);
    else setMensagem(r.corpo?.error ?? "Não foi possível calcular.");
  };

  const confirmar = async () => {
    if (!previa) return;
    setCarregando(true);
    const r = await chamar({
      acao: "confirmar", ...base(), comunicacao_formal: formal, idempotency_key: chave,
      esperado: { ultimo: previa.ultimo_comparecimento, prazo: previa.prazo_10_dias, efetiva: previa.data_efetiva },
    });
    setCarregando(false);
    if (r.ok) {
      toast.success("Aviso prévio registrado. O colaborador continua ativo até o último dia.");
      limpar(); setChave(crypto.randomUUID());
      qc.invalidateQueries({ queryKey: ["dp_desligamento_processo", colaboradorId] });
    } else if (r.corpo?.divergente) {
      setPrevia(r.corpo.resultado); setFormal(false);
      setMensagem("As datas oficiais mudaram. Confira as novas datas e confirme de novo.");
    } else setMensagem(r.corpo?.error ?? "Não foi possível registrar.");
  };

  const cancelar = async () => {
    if (!proc.data) return;
    setCarregando(true);
    const r = await chamar({ acao: "cancelar", processo_id: proc.data.id, justificativa });
    setCarregando(false);
    if (r.ok) { toast.success("Registro cancelado."); setCancelando(false); setJustificativa(""); qc.invalidateQueries({ queryKey: ["dp_desligamento_processo", colaboradorId] }); }
    else toast.error(r.corpo?.error ?? "Não foi possível cancelar.");
  };

  const alertaEfetivacao = (
    <Alert><AlertTriangle className="h-4 w-4" /><AlertDescription>
      A efetivação automática será habilitada em etapa posterior; por enquanto, revise a data de desligamento para efetivar quando chegar o dia (registro abaixo, na data do término).
    </AlertDescription></Alert>
  );

  if (proc.isLoading) return <p className="text-sm text-muted-foreground">Carregando…</p>;

  if (proc.data) {
    const p = proc.data;
    return (
      <section className="space-y-3 rounded-lg border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">Aviso prévio em andamento</h3>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs">Colaborador ativo até {br(p.data_efetiva)}</span>
        </div>
        <DatasDesligamento r={p} />
        <Detalhes r={p} />
        {alertaEfetivacao}
        {!cancelando
          ? <Button variant="outline" size="sm" onClick={() => setCancelando(true)}>Cancelar registro lançado por engano</Button>
          : <div className="space-y-2">
              <Label htmlFor="desl-just">Justificativa</Label>
              <Textarea id="desl-just" value={justificativa} onChange={(e) => setJustificativa(e.target.value)} placeholder="Por que o registro está sendo cancelado" />
              <p className="text-xs text-muted-foreground">Reconsideração aceita pelas duas partes será tratada em etapa própria.</p>
              <div className="flex gap-2">
                <Button size="sm" variant="destructive" disabled={carregando || justificativa.trim().length < 5} onClick={cancelar}>Confirmar cancelamento</Button>
                <Button size="sm" variant="ghost" onClick={() => setCancelando(false)}>Voltar</Button>
              </div>
            </div>}
      </section>
    );
  }

  if (!ativo) return null;

  return (
    <section className="space-y-3 rounded-lg border p-4">
      <div>
        <h3 className="font-semibold">Registrar aviso prévio</h3>
        <p className="text-sm text-muted-foreground">Calcula com a jornada e os feriados cadastrados. O colaborador continua ativo, com acesso ao portal, até o último dia do vínculo.</p>
      </div>
      {rascunho && <p className="text-xs text-muted-foreground">Dados trazidos da calculadora para conferência. Nada foi gravado.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>Motivo</Label>
          <Select value={motivo} onValueChange={(v) => { setMotivo(v); limpar(); }}>
            <SelectTrigger aria-label="Motivo"><SelectValue /></SelectTrigger>
            <SelectContent>{MOTIVO_DESLIGAMENTO_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="desl-com">Data da comunicação</Label>
          <Input id="desl-com" type="date" value={comunicacao} max={hojeIsoLocal()} onChange={(e) => { setComunicacao(e.target.value); limpar(); }} />
        </div>
        <div className="space-y-1">
          <Label>Aviso</Label>
          <RadioGroup value={modalidade} onValueChange={(v) => { setModalidade(v as "trabalhado" | "indenizado"); limpar(); }} className="flex gap-4">
            <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="trabalhado" /> Trabalhado</label>
            <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="indenizado" /> Indenizado</label>
          </RadioGroup>
        </div>
        {modalidade === "trabalhado" && (
          <div className="space-y-1">
            <Label>Redução escolhida pelo colaborador</Label>
            <RadioGroup value={reducao} onValueChange={(v) => { setReducao(v as "duas_horas" | "sete_dias"); limpar(); }} className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="duas_horas" /> 2 horas por dia</label>
              <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="sete_dias" /> 7 dias corridos no final</label>
            </RadioGroup>
          </div>
        )}
      </div>
      <Button onClick={calcular} disabled={carregando || !comunicacao}>Calcular datas oficiais</Button>
      {mensagem && <Alert variant={previa ? "default" : "destructive"}><AlertDescription>{mensagem}</AlertDescription></Alert>}
      {previa && (
        <div className="space-y-3">
          <DatasDesligamento r={previa} />
          <Detalhes r={previa} />
          {previa.avisos?.map((a) => <p key={a} className="text-xs text-muted-foreground">{a}</p>)}
          {alertaEfetivacao}
          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={formal} onCheckedChange={(v) => setFormal(v === true)} aria-label="Comunicação formal entregue" />
            A comunicação formal do aviso foi entregue ao colaborador em {br(previa.data_comunicacao)}.
          </label>
          <Button onClick={confirmar} disabled={carregando || !formal}>Confirmar registro do aviso</Button>
        </div>
      )}
    </section>
  );
}
