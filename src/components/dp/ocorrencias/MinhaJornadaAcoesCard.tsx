import { useRef, useState } from "react";
import { AlertTriangle, Clock, HeartPulse, HelpCircle, LogOut, Timer, UserX, Wrench } from "lucide-react";
import { toast } from "sonner";
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
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { sanitizeStorageFilename } from "@/lib/storage";
import { TIPO_LABEL, resumoOperacional, somarMinutos } from "@/lib/dp/ocorrencias";
import {
  PORTAL_MOMENTOS,
  exigeJustificativa,
  frasesQuando,
  marcacaoDoMomento,
  opcaoPortal,
  opcoesDisponiveis,
  tipoOcorrenciaPortal,
  type PortalMomentoId,
  type PortalOpcaoId,
  type PortalQuando,
} from "@/lib/dp/ocorrencias-portal";
import { useMinhasOcorrencias } from "@/hooks/useMinhasOcorrencias";
import { useMeuVinculoPortal } from "@/hooks/useMeuVinculoPortal";
import { useMinhaProximaFolga } from "@/hooks/useMinhaProximaFolga";

const ATRASOS = [10, 20, 30, 45, 60];
const BUCKET = "dp-documentos";

const ICONE: Record<PortalOpcaoId, typeof Clock> = {
  atraso: Timer,
  falta: UserX,
  saida_antecipada: LogOut,
  esquecimento: Clock,
  problema_ponto: Wrench,
  atestado: HeartPulse,
  outro: HelpCircle,
};

/** Ações rápidas do colaborador sobre a jornada de hoje. */
export function MinhaJornadaAcoesCard() {
  const { user } = useAuth();
  const { previsto, minhas, hoje, registrar, colaboradorId } = useMinhasOcorrencias();
  const { data: vinculo } = useMeuVinculoPortal();
  const { folga } = useMinhaProximaFolga(colaboradorId);
  const usaPonto = vinculo?.unidadeUsaPonto ?? false;
  const opcoes = opcoesDisponiveis(usaPonto);

  const [aberta, setAberta] = useState<PortalOpcaoId | null>(null);
  const [quando, setQuando] = useState<PortalQuando>("ocorrido");
  const [momento, setMomento] = useState<PortalMomentoId | null>(null);
  const [minutos, setMinutos] = useState<number | null>(30);
  const [horario, setHorario] = useState("");
  const [motivo, setMotivo] = useState("");
  const [enviandoAtestado, setEnviandoAtestado] = useState(false);
  const arquivoRef = useRef<HTMLInputElement>(null);

  if (!colaboradorId) return null;

  const entrada = previsto?.entrada?.slice(0, 5) ?? null;
  const saida = previsto?.saida?.slice(0, 5) ?? null;
  const doDia = minhas.filter((o) => o.data_operacional === hoje);
  const opcao = aberta ? opcaoPortal(aberta) : null;
  const frases = aberta ? frasesQuando(aberta) : null;
  const motivoObrigatorio = aberta ? exigeJustificativa(aberta, momento) : false;

  const abrir = (id: PortalOpcaoId) => {
    const o = opcaoPortal(id);
    setAberta(id);
    setQuando("ocorrido");
    setMomento(o.pedeMomento ? "entrada" : null);
    setMinutos(30);
    setHorario(id === "saida_antecipada" ? (saida ?? "") : "");
    setMotivo("");
    if (arquivoRef.current) arquivoRef.current.value = "";
  };

  const fechar = () => setAberta(null);

  const enviarAtestado = async () => {
    const arquivo = arquivoRef.current?.files?.[0];
    if (!vinculo) return toast.error("Não encontramos seu cadastro. Fale com o DP.");
    if (!arquivo) return toast.error("Anexe a foto ou o PDF do atestado.");
    setEnviandoAtestado(true);
    try {
      const path = `${vinculo.companyId}/${vinculo.colaboradorId}/${Date.now()}-${sanitizeStorageFilename(arquivo.name)}`;
      const up = await supabase.storage.from(BUCKET).upload(path, arquivo, {
        contentType: arquivo.type,
        upsert: false,
      });
      if (up.error) throw up.error;
      const { error } = await supabase.from("dp_documentos").insert({
        company_id: vinculo.companyId,
        colaborador_id: vinculo.colaboradorId,
        tipo: "atestado",
        titulo: `Atestado ${hoje.split("-").reverse().join("/")}`,
        descricao: motivo.trim() || null,
        file_path: path,
        file_name: arquivo.name,
        file_size: arquivo.size,
        mime_type: arquivo.type,
        referencia_data: hoje,
        uploaded_by: user?.id,
        submetido_por_colaborador: true,
        aprovacao_status: "pendente",
      });
      if (error) throw error;
      registrar.mutate(
        { tipo: "atestado", justificativa: motivo || null },
        { onSuccess: fechar },
      );
    } catch (e: any) {
      toast.error("Não conseguimos enviar o atestado agora.", { description: e?.message });
    } finally {
      setEnviandoAtestado(false);
    }
  };

  const enviar = () => {
    if (!aberta || !opcao) return;
    if (aberta === "atestado") return void enviarAtestado();

    const tipo = tipoOcorrenciaPortal(aberta, quando, momento);
    const ocorrido = quando === "ocorrido";
    const informado =
      aberta === "atraso" ? horario || (entrada && minutos ? somarMinutos(entrada, minutos) : "") : horario;

    registrar.mutate(
      {
        tipo,
        justificativa: motivo || null,
        horarioReal: ocorrido ? informado || null : null,
        horarioEstimado: ocorrido ? null : informado || null,
        marcacaoAlvo: opcao.pedeMomento ? marcacaoDoMomento(momento) : null,
      },
      { onSuccess: fechar },
    );
  };

  const faltaHorario = !!opcao?.pedeHorario && aberta !== "outro" && aberta !== "atraso" && !horario;
  const faltaAtraso = aberta === "atraso" && !horario && !minutos;

  return (
    <section className="rounded-2xl border-2 border-[hsl(var(--dp-border))] bg-card p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Clock className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Minha jornada hoje</h2>
        <Badge variant="outline" className="ml-auto">
          {entrada && saida
            ? `${entrada} às ${saida}`
            : entrada
              ? `A partir de ${entrada}`
              : folga?.data === hoje
                ? "Hoje é sua folga"
                : "Horário a confirmar com o gestor"}
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
        {/* No celular os rótulos são longos: deixa o botão crescer em vez de cortar o texto. */}
        {opcoes.map((o) => {
          const Icone = ICONE[o.id];
          return (
            <Button
              key={o.id}
              variant="outline"
              className="h-auto min-h-10 justify-start whitespace-normal py-2 text-left leading-snug"
              onClick={() => abrir(o.id)}
            >
              <Icone className="mr-2 h-4 w-4 shrink-0" /> {o.label}
            </Button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Informar aqui avisa a rotina na hora. A análise do gestor acontece depois.
      </p>

      <Dialog open={!!aberta} onOpenChange={(open) => !open && fechar()}>
        <DialogContent className="max-w-md max-h-[85svh] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>
              {opcao?.pedeQuando && frases
                ? quando === "ocorrido"
                  ? frases.ocorrido
                  : frases.previsto
                : (opcao?.label ?? "")}
            </DialogTitle>
            <DialogDescription>
              {aberta === "falta"
                ? "Avisar não é o mesmo que ter a ausência aprovada — o gestor analisa depois."
                : (opcao?.descricao ?? "")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {opcao?.pedeQuando && frases && (
              <div className="space-y-2">
                <Label>Isso já aconteceu ou ainda vai acontecer?</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button
                    size="sm"
                    variant={quando === "ocorrido" ? "default" : "outline"}
                    className="h-auto min-h-9 whitespace-normal py-2 leading-snug"
                    onClick={() => setQuando("ocorrido")}
                  >
                    {frases.ocorrido}
                  </Button>
                  <Button
                    size="sm"
                    variant={quando === "previsto" ? "default" : "outline"}
                    className="h-auto min-h-9 whitespace-normal py-2 leading-snug"
                    onClick={() => setQuando("previsto")}
                  >
                    {frases.previsto}
                  </Button>
                </div>
              </div>
            )}

            {opcao?.pedeMomento && (
              <div className="space-y-2">
                <Label>Em qual momento?</Label>
                <div className="grid gap-2">
                  {PORTAL_MOMENTOS.map((m) => (
                    <Button
                      key={m.id}
                      size="sm"
                      variant={momento === m.id ? "default" : "outline"}
                      className="h-auto min-h-9 justify-start whitespace-normal py-2 text-left leading-snug"
                      onClick={() => setMomento(m.id)}
                    >
                      {m.label}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {aberta === "atraso" && (
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
                  <Label className="text-xs text-muted-foreground">Ou informe o horário do fato</Label>
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

            {opcao?.pedeHorario && aberta !== "atraso" && (
              <div className="space-y-1.5">
                <Label>
                  {aberta === "saida_antecipada"
                    ? quando === "ocorrido"
                      ? "Saí às"
                      : "Pretendo sair às"
                    : "Horário em que o fato aconteceu"}
                  {aberta === "outro" ? " (opcional)" : ""}
                </Label>
                <Input type="time" value={horario} onChange={(e) => setHorario(e.target.value)} />
                {aberta === "saida_antecipada" && saida && (
                  <p className="text-xs text-muted-foreground">Saída prevista {saida}</p>
                )}
              </div>
            )}

            {opcao?.pedeArquivo && (
              <div className="space-y-1.5">
                <Label>Foto ou PDF do atestado</Label>
                <Input ref={arquivoRef} type="file" accept="image/*,application/pdf" />
                <p className="text-xs text-muted-foreground">
                  O atestado vai para os seus documentos e aguarda a conferência do DP.
                </p>
              </div>
            )}

            {(aberta === "esquecimento" || aberta === "problema_ponto") && (
              <p className="rounded-md border border-border bg-muted/40 p-2 text-xs text-muted-foreground">
                Isso só registra a informação — não altera nenhuma marcação de ponto.
              </p>
            )}

            <div className="space-y-1.5">
              <Label>
                Justificativa {motivoObrigatorio ? "" : "(opcional)"}
              </Label>
              <Textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={fechar}>
              Voltar
            </Button>
            <Button
              onClick={enviar}
              disabled={
                registrar.isPending ||
                enviandoAtestado ||
                (motivoObrigatorio && !motivo.trim()) ||
                faltaHorario ||
                faltaAtraso
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
