import { useState } from "react";
import { AlertTriangle, Clock, LogOut, Timer, UserX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  MARCACAO_LABEL,
  TIPO_LABEL,
  resumoOperacional,
  somarMinutos,
  type OcorrenciaMarcacao,
  type OcorrenciaTipo,
} from "@/lib/dp/ocorrencias";
import { useMinhasOcorrencias } from "@/hooks/useMinhasOcorrencias";
import { useMeuVinculoPortal } from "@/hooks/useMeuVinculoPortal";
import { useMinhaProximaFolga } from "@/hooks/useMinhaProximaFolga";

type Acao = "atraso" | "ausencia" | "saida" | "ponto";
/** O fato já aconteceu ou ainda vai acontecer. */
type Quando = "ocorrido" | "previsto";

const ATRASOS = [10, 20, 30, 45, 60];

/** Ocorrências de pontualidade para unidades que não registram ponto. */
const PONTUALIDADE: { label: string; marcacao?: OcorrenciaMarcacao; tipo: OcorrenciaTipo }[] = [
  { label: "Cheguei atrasado na entrada", tipo: "atraso" },
  { label: "Voltei atrasado do intervalo", tipo: "atraso_intervalo" },
  { label: "Saí antes do horário", tipo: "saida_antecipada" },
  { label: "Outra divergência de horário", tipo: "divergencia_jornada" },
];

const PROBLEMAS: { label: string; marcacao?: OcorrenciaMarcacao; tipo: OcorrenciaTipo }[] = [
  { label: "Esqueci de registrar entrada", marcacao: "entrada", tipo: "esquecimento_marcacao" },
  { label: "Esqueci de registrar saída", marcacao: "saida", tipo: "esquecimento_marcacao" },
  { label: "Esqueci o início do intervalo", marcacao: "intervalo_inicio", tipo: "esquecimento_marcacao" },
  { label: "Esqueci o retorno do intervalo", marcacao: "intervalo_retorno", tipo: "esquecimento_marcacao" },
  { label: "Atrasei o retorno do intervalo", tipo: "atraso_intervalo" },
  { label: "Outra divergência", tipo: "divergencia_jornada" },
];

/** Ações rápidas do colaborador sobre a jornada de hoje. */
export function MinhaJornadaAcoesCard() {
  const { previsto, minhas, hoje, registrar, colaboradorId } = useMinhasOcorrencias();
  const { data: vinculo } = useMeuVinculoPortal();
  const { folga } = useMinhaProximaFolga(colaboradorId);
  const usaPonto = vinculo?.unidadeUsaPonto ?? false;
  const opcoesPonto = usaPonto ? PROBLEMAS : PONTUALIDADE;
  const [quando, setQuando] = useState<Quando>("ocorrido");
  const [acao, setAcao] = useState<Acao | null>(null);
  const [minutos, setMinutos] = useState<number | null>(30);
  const [horario, setHorario] = useState("");
  const [motivo, setMotivo] = useState("");
  const [problema, setProblema] = useState<{ label: string; marcacao?: OcorrenciaMarcacao; tipo: OcorrenciaTipo }>(PROBLEMAS[0]);

  if (!colaboradorId) return null;

  const entrada = previsto?.entrada?.slice(0, 5) ?? null;
  const saida = previsto?.saida?.slice(0, 5) ?? null;
  const doDia = minhas.filter((o) => o.data_operacional === hoje);

  const abrir = (a: Acao) => {
    setAcao(a);
    setMinutos(30);
    setHorario(a === "saida" ? (saida ?? "") : "");
    setMotivo("");
    setProblema(opcoesPonto[0]);
    setQuando("ocorrido");
  };

  const enviar = () => {
    const ocorrido = quando === "ocorrido";
    if (acao === "atraso") {
      const informado = horario || (entrada && minutos ? somarMinutos(entrada, minutos) : "");
      registrar.mutate(
        ocorrido
          ? { tipo: "atraso", justificativa: motivo, horarioReal: informado || null }
          : { tipo: "previsao_atraso", justificativa: motivo, horarioEstimado: informado || null },
        { onSuccess: () => setAcao(null) },
      );
    } else if (acao === "ausencia") {
      registrar.mutate(
        { tipo: ocorrido ? "falta" : "previsao_falta", justificativa: motivo },
        { onSuccess: () => setAcao(null) },
      );
    } else if (acao === "saida") {
      registrar.mutate(
        ocorrido
          ? { tipo: "saida_antecipada", justificativa: motivo, horarioReal: horario || null }
          : { tipo: "previsao_saida_antecipada", justificativa: motivo, horarioEstimado: horario || null },
        { onSuccess: () => setAcao(null) },
      );
    } else if (acao === "ponto") {
      registrar.mutate(
        {
          tipo: problema.tipo,
          justificativa: motivo,
          horarioReal: horario || null,
          marcacaoAlvo: problema.marcacao ?? null,
        },
        { onSuccess: () => setAcao(null) },
      );
    }
  };

  return (
    <section className="rounded-2xl border-2 border-[hsl(var(--dp-border))] bg-card p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Clock className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Minha jornada hoje</h2>
        <Badge variant="outline" className="ml-auto">
          {entrada && saida
            ? `${entrada} às ${saida}`
            : folga?.data === hoje
              ? "Hoje é sua folga"
              : "Sem horário definido para hoje"}
        </Badge>
      </div>

      {doDia.length > 0 && (
        <div className="mb-3 space-y-1">
          {doDia.map((o) => (
            <p
              key={o.id}
              className={cn(
                "flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/5 px-2 py-1 text-xs",
              )}
            >
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
              {resumoOperacional({
                tipo: o.tipo,
                estado: o.estado,
                minutos: o.minutos,
                horario_estimado: o.horario_estimado,
                horario_real: o.horario_real,
              })}
            </p>
          ))}
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <Button variant="outline" onClick={() => abrir("atraso")}>
          <Timer className="mr-2 h-4 w-4" /> Atraso na entrada
        </Button>
        <Button variant="outline" onClick={() => abrir("ausencia")}>
          <UserX className="mr-2 h-4 w-4" /> Falta no dia
        </Button>
        <Button variant="outline" onClick={() => abrir("saida")}>
          <LogOut className="mr-2 h-4 w-4" /> Saída antes do horário
        </Button>
        <Button variant="outline" onClick={() => abrir("ponto")}>
          <Clock className="mr-2 h-4 w-4" />{" "}
          {usaPonto ? "Informar problema com ponto" : "Registrar ocorrência de pontualidade"}
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Informar aqui avisa a rotina na hora. A análise do gestor acontece depois.
      </p>

      <Dialog open={!!acao} onOpenChange={(open) => !open && setAcao(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {acao === "atraso" && (quando === "ocorrido" ? "Cheguei atrasado" : "Vou me atrasar")}
              {acao === "ausencia" && (quando === "ocorrido" ? "Faltei" : "Não poderei comparecer")}
              {acao === "saida" && (quando === "ocorrido" ? "Saí antes do horário" : "Vou sair mais cedo")}
              {acao === "ponto" && (usaPonto ? "Problema com ponto" : "Ocorrência de pontualidade")}
            </DialogTitle>
            <DialogDescription>
              {acao === "ausencia"
                ? "Avisar não é o mesmo que ter a ausência aprovada — o gestor analisa depois."
                : "O registro entra na rotina do dia imediatamente."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {acao !== "ponto" && (
              <div className="space-y-2">
                <Label>Isso já aconteceu ou ainda vai acontecer?</Label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant={quando === "ocorrido" ? "default" : "outline"}
                    onClick={() => setQuando("ocorrido")}
                  >
                    Já aconteceu
                  </Button>
                  <Button
                    size="sm"
                    variant={quando === "previsto" ? "default" : "outline"}
                    onClick={() => setQuando("previsto")}
                  >
                    Vai acontecer
                  </Button>
                </div>
              </div>
            )}

            {acao === "atraso" && (
              <div className="space-y-2">
                <Label>
                  {quando === "ocorrido" ? "Quanto tempo você atrasou?" : "Quanto você acredita que irá atrasar?"}
                </Label>
                <div className="flex flex-wrap gap-2">
                  {ATRASOS.map((m) => (
                    <Button
                      key={m}
                      size="sm"
                      variant={minutos === m && !horario ? "default" : "outline"}
                      onClick={() => {
                        setMinutos(m);
                        setHorario("");
                      }}
                    >
                      {m === 60 ? "1 hora" : `${m} min`}
                    </Button>
                  ))}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Ou informe o horário</Label>
                  <Input
                    type="time"
                    value={horario}
                    onChange={(e) => {
                      setHorario(e.target.value);
                      setMinutos(null);
                    }}
                  />
                </div>
                {entrada && (
                  <p className="text-xs text-muted-foreground">
                    Entrada prevista {entrada}
                    {minutos ? ` · chegada estimada ${somarMinutos(entrada, minutos)}` : ""}
                  </p>
                )}
              </div>
            )}

            {acao === "saida" && (
              <div className="space-y-1.5">
                <Label>{quando === "ocorrido" ? "Saí às" : "Pretendo sair às"}</Label>
                <Input type="time" value={horario} onChange={(e) => setHorario(e.target.value)} />
                {saida && <p className="text-xs text-muted-foreground">Saída prevista {saida}</p>}
              </div>
            )}

            {acao === "ponto" && (
              <div className="space-y-2">
                <Label>O que aconteceu?</Label>
                <div className="grid gap-2">
                  {opcoesPonto.map((p) => (
                    <Button
                      key={p.label}
                      size="sm"
                      variant={problema.label === p.label ? "default" : "outline"}
                      className="justify-start"
                      onClick={() => setProblema(p)}
                    >
                      {p.label}
                    </Button>
                  ))}
                </div>
                {problema.tipo === "esquecimento_marcacao" && (
                  <div className="space-y-1.5">
                    <Label>
                      Horário da {MARCACAO_LABEL[problema.marcacao!].toLowerCase()}
                    </Label>
                    <Input type="time" value={horario} onChange={(e) => setHorario(e.target.value)} />
                  </div>
                )}
                <p className="rounded-md border border-border bg-muted/40 p-2 text-xs text-muted-foreground">
                  {usaPonto
                    ? "Isso só registra a informação — não altera nenhuma marcação de ponto."
                    : "Sua unidade não registra ponto. Isso apenas informa a ocorrência de horário ao gestor."}
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Motivo / justificativa</Label>
              <Textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAcao(null)}>
              Voltar
            </Button>
            <Button
              onClick={enviar}
              disabled={
                registrar.isPending ||
                !motivo.trim() ||
                (acao === "saida" && !horario) ||
                (acao === "atraso" && !horario && !minutos)
              }
            >
              Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

export { TIPO_LABEL };
