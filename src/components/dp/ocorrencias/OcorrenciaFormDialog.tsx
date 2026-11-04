import { useEffect, useMemo, useState } from "react";
import { prepararFalta, type ClassificacaoFalta } from "@/lib/dp/falta-classificacao";
import { useIsMobile } from "@/hooks/use-mobile";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
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
import {
  MARCACAO_LABEL,
  TIPOS_ORDEM,
  TIPO_LABEL,
  type OcorrenciaMarcacao,
  type OcorrenciaTipo,
} from "@/lib/dp/ocorrencias";
import type { RegistrarOcorrenciaInput } from "@/hooks/useDpOcorrencias";
import { AssiduidadePergunta, validarDecisaoAssiduidade, type DecisaoAssiduidade } from "@/components/dp/AssiduidadePergunta";
import type { EventoAssiduidade } from "@/lib/dp/assiduidade-risco";

/** Evento de assiduidade do tipo registrado; os demais não perguntam. */
function eventoDoTipo(t: OcorrenciaTipo): EventoAssiduidade {
  if (t === "falta" || t === "previsao_falta") return "falta";
  if (t === "atestado") return "atestado";
  if (["atraso", "previsao_atraso", "atraso_intervalo", "previsao_atraso_intervalo", "saida_antecipada", "previsao_saida_antecipada"].includes(t)) return "atraso";
  return "folga";
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  colaboradores: { id: string; nome: string }[];
  saving?: boolean;
  dataInicial?: string;
  /** Colaborador já escolhido (atalho do calendário). */
  colaboradorInicial?: string;
  somenteFalta?: boolean;
  contexto?: string;
  onSubmit: (input: RegistrarOcorrenciaInput) => void;
}

const PEDE_ESTIMADO: OcorrenciaTipo[] = [
  "previsao_atraso",
  "previsao_saida_antecipada",
  "previsao_atraso_intervalo",
];
/** Tipos em que a pessoa não trabalha no dia: pedem motivo explícito. */
const PEDE_MOTIVO: OcorrenciaTipo[] = [
  "falta",
  "previsao_falta",
  "ausencia_justificada",
  "divergencia_jornada",
];

const MOTIVOS_AUSENCIA = [
  "Falta injustificada",
  "Falta justificada",
  "Atestado médico",
  "Licença legal",
  "Outro",
] as const;

const PEDE_REAL: OcorrenciaTipo[] = [
  "atraso",
  "saida_antecipada",
  "atraso_intervalo",
  "esquecimento_marcacao",
];

/** Registro manual de ocorrência pelo gestor. */
export function OcorrenciaFormDialog({
  open,
  onOpenChange,
  colaboradores,
  saving,
  dataInicial,
  colaboradorInicial,
  onSubmit,
  somenteFalta,
  contexto,
}: Props) {
  const mobile = useIsMobile();
  const Root = mobile ? Sheet : Dialog;
  const Content = mobile ? SheetContent : DialogContent;
  const Header = mobile ? SheetHeader : DialogHeader;
  const Title = mobile ? SheetTitle : DialogTitle;
  const Description = mobile ? SheetDescription : DialogDescription;
  const Footer = mobile ? SheetFooter : DialogFooter;
  const [classificacao, setClassificacao] = useState<ClassificacaoFalta>("injustificada");
  const [comunicou, setComunicou] = useState(false);
  const hoje = new Date().toISOString().slice(0, 10);
  const [colaboradorId, setColaboradorId] = useState("");
  const [data, setData] = useState(dataInicial ?? hoje);
  const [tipo, setTipo] = useState<OcorrenciaTipo>("falta");
  const [marcacao, setMarcacao] = useState<OcorrenciaMarcacao>("entrada");
  const [horarioEstimado, setHorarioEstimado] = useState("");
  const [horarioReal, setHorarioReal] = useState("");
  const [justificativa, setJustificativa] = useState("");
  const [motivo, setMotivo] = useState<string>(MOTIVOS_AUSENCIA[0]);
  const [assid, setAssid] = useState<DecisaoAssiduidade | null>(null);

  useEffect(() => {
    if (!open) return;
    setColaboradorId(colaboradorInicial ?? "");
    setData(dataInicial ?? hoje);
    setTipo("falta");
    setClassificacao("injustificada");
    setComunicou(false);
    setAssid(null);
    setMarcacao("entrada");
    setHorarioEstimado("");
    setHorarioReal("");
    setJustificativa("");
    setMotivo(MOTIVOS_AUSENCIA[0]);
  }, [open, dataInicial, colaboradorInicial, hoje]);

  const pedeEstimado = useMemo(() => PEDE_ESTIMADO.includes(tipo), [tipo]);
  const pedeReal = useMemo(() => PEDE_REAL.includes(tipo), [tipo]);
  const ehFalta = somenteFalta || tipo === "falta" || tipo === "ausencia_justificada";
  const faltaPreparada = prepararFalta(classificacao, comunicou ? "sim" : "nao", justificativa, contexto);
  const evento = ehFalta ? faltaPreparada.evento : eventoDoTipo(tipo);
  const pedeMotivo = useMemo(() => PEDE_MOTIVO.includes(tipo), [tipo]);

  const submit = () => {
    if (!colaboradorId) {
      toast.error("Escolha o colaborador.");
      return;
    }
    if (!data) {
      toast.error("Informe a data da rotina.");
      return;
    }
    if ((ehFalta && classificacao === "justificada" || pedeMotivo && motivo === "Outro") && !justificativa.trim()) {
      toast.error("Descreva o motivo da ausência.");
      return;
    }
    let decisao: DecisaoAssiduidade | null;
    try {
      decisao = validarDecisaoAssiduidade(evento, assid);
    } catch (e) {
      toast.error((e as Error).message);
      return;
    }
    const detalhe = justificativa.trim();
    const textoFinal = pedeMotivo
      ? [motivo, detalhe].filter(Boolean).join(" — ")
      : detalhe;
    onSubmit({
      colaboradorId,
      data,
      tipo: ehFalta ? faltaPreparada.tipo : tipo,
      justificativa: ehFalta ? faltaPreparada.justificativa : textoFinal || null,
      horarioEstimado: pedeEstimado ? horarioEstimado || null : null,
      horarioReal: pedeReal ? horarioReal || null : null,
      marcacaoAlvo: tipo === "esquecimento_marcacao" ? marcacao : null,
      assiduidade: decisao,
    });
  };

  return (
    <Root open={open} onOpenChange={onOpenChange}>
      <Content {...(mobile ? { side: "bottom" as const } : {})} className="max-h-[92dvh] overflow-y-auto sm:max-w-lg [&_button]:min-h-12 [&_input]:min-h-12">
        <Header>
          <Title>{somenteFalta ? "Registrar falta" : "Registrar ocorrência"}</Title>
          <Description>
            Vincule sempre à data da rotina, e não à data em que o horário aconteceu.
          </Description>
        </Header>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Colaborador *</Label>
            <Select value={colaboradorId} onValueChange={setColaboradorId}>
              <SelectTrigger>
                <SelectValue placeholder="Escolher" />
              </SelectTrigger>
              <SelectContent>
                {colaboradores.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Data da rotina *</Label>
              <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
            {!somenteFalta && <div className="space-y-1.5">
              <Label>O que aconteceu *</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as OcorrenciaTipo)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_ORDEM.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TIPO_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>}
          </div>

          {ehFalta && <div className="space-y-3">
            {contexto && <p className="text-sm font-medium">{contexto}</p>}
            <Label>Classificação da falta *</Label>
            <Select value={classificacao} onValueChange={(v) => setClassificacao(v as ClassificacaoFalta)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="justificada">Falta justificada</SelectItem><SelectItem value="injustificada">Falta injustificada</SelectItem></SelectContent>
            </Select>
            <label className="flex min-h-12 items-center gap-3 text-sm"><Checkbox checked={comunicou} onCheckedChange={(v) => setComunicou(v === true)} />Houve comunicação prévia do colaborador</label>
            <p className="text-xs text-muted-foreground">Comunicação é informação interna. Descontos do dia e DSR dependem da análise e das regras aplicáveis, sem desconto automático.</p>
          </div>}
          {pedeMotivo && !ehFalta && (
            <div className="space-y-1.5">
              <Label>Motivo da ausência *</Label>
              <Select value={motivo} onValueChange={setMotivo}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MOTIVOS_AUSENCIA.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                O motivo aparece na rotina do dia e tira a pessoa da contagem de folga.
              </p>
            </div>
          )}

          {tipo === "esquecimento_marcacao" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Qual marcação</Label>
                <Select value={marcacao} onValueChange={(v) => setMarcacao(v as OcorrenciaMarcacao)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(MARCACAO_LABEL) as OcorrenciaMarcacao[]).map((m) => (
                      <SelectItem key={m} value={m}>
                        {MARCACAO_LABEL[m]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Horário informado</Label>
                <Input type="time" value={horarioReal} onChange={(e) => setHorarioReal(e.target.value)} />
              </div>
            </div>
          )}

          {pedeEstimado && (
            <div className="space-y-1.5">
              <Label>Horário estimado</Label>
              <Input
                type="time"
                value={horarioEstimado}
                onChange={(e) => setHorarioEstimado(e.target.value)}
              />
            </div>
          )}

          {pedeReal && tipo !== "esquecimento_marcacao" && (
            <div className="space-y-1.5">
              <Label>Horário real</Label>
              <Input type="time" value={horarioReal} onChange={(e) => setHorarioReal(e.target.value)} />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Justificativa</Label>
            <Textarea
              rows={3}
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value)}
              placeholder="O que foi informado sobre o ocorrido"
            />
          </div>
          <AssiduidadePergunta colaboradorId={colaboradorId} evento={evento} value={assid} onChange={setAssid} />
        </div>

        <Footer className="sticky bottom-0 mt-3 gap-2 border-t bg-background pt-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving}>
            Registrar
          </Button>
        </Footer>
      </Content>
    </Root>
  );
}
