import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DpDialogShell } from "@/components/dp/DpDialogShell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SubstitutoPicker, type SubstitutoOpcao } from "./SubstitutoPicker";
import {
  COBERTURA_EXECUCAO_LABEL,
  COBERTURA_STATUS_LABEL,
  TIPO_LABEL,
} from "@/lib/dp/ocorrencias";
import type { Ocorrencia, OcorrenciaCobertura } from "@/hooks/useDpOcorrencias";

interface Props {
  ocorrencia: Ocorrencia | null;
  coberturas: OcorrenciaCobertura[];
  opcoes: SubstitutoOpcao[];
  saving?: boolean;
  onOpenChange: (open: boolean) => void;
  onCriar: (input: {
    substitutoColaboradorId?: string | null;
    maoDeObraExtraId?: string | null;
    entrada?: string | null;
    saida?: string | null;
  }) => void;
  onDecidir: (input: { coberturaId: string; aprovar: boolean; motivoRecusa?: string }) => void;
  onConfirmar: (coberturaId: string) => void;
}

/** Monta e acompanha a cobertura de uma ausência (folguista, apoio ou colega da equipe). */
export function OcorrenciaCoberturaDialog({
  ocorrencia,
  coberturas,
  opcoes,
  saving,
  onOpenChange,
  onCriar,
  onDecidir,
  onConfirmar,
}: Props) {
  const [escolhido, setEscolhido] = useState<SubstitutoOpcao | null>(null);
  const [entrada, setEntrada] = useState("");
  const [saida, setSaida] = useState("");
  const [recusarId, setRecusarId] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");

  useEffect(() => {
    setEscolhido(null);
    setEntrada(ocorrencia?.previsto_entrada?.slice(0, 5) ?? "");
    setSaida(ocorrencia?.previsto_saida?.slice(0, 5) ?? "");
    setRecusarId(null);
    setMotivo("");
  }, [ocorrencia?.id, ocorrencia?.previsto_entrada, ocorrencia?.previsto_saida]);

  const disponiveis = useMemo(
    () => opcoes.filter((o) => !(o.origem === "colaborador" && o.id === ocorrencia?.colaborador_id)),
    [opcoes, ocorrencia?.colaborador_id],
  );

  if (!ocorrencia) return null;

  const data = new Date(`${ocorrencia.data_operacional}T12:00:00`).toLocaleDateString("pt-BR");

  return (
    <DpDialogShell
      open
      onOpenChange={onOpenChange}
      title="Cobrir a ausência"
      description={`${ocorrencia.colaborador?.nome} — ${TIPO_LABEL[ocorrencia.tipo].toLowerCase()} em ${data}`}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          <Button
            disabled={!escolhido || saving}
            onClick={() =>
              escolhido &&
              onCriar({
                substitutoColaboradorId: escolhido.origem === "colaborador" ? escolhido.id : null,
                maoDeObraExtraId: escolhido.origem === "apoio" ? escolhido.id : null,
                entrada: entrada || null,
                saida: saida || null,
              })
            }
          >
            Registrar cobertura
          </Button>
        </>
      }
    >
      <div className="space-y-4">
          {coberturas.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Coberturas deste dia</Label>
              {coberturas.map((c) => (
                <div key={c.id} className="rounded-md border p-2 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">
                      {c.substituto?.nome ?? c.apoio?.nome ?? "Sem nome"}
                    </span>
                    <span className="flex items-center gap-1">
                      <Badge variant="outline" className="text-[10px]">
                        {COBERTURA_STATUS_LABEL[c.status]}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {COBERTURA_EXECUCAO_LABEL[c.execucao_status]}
                      </Badge>
                    </span>
                  </div>
                  {(c.entrada || c.saida) && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {c.entrada?.slice(0, 5) ?? "--"} às {c.saida?.slice(0, 5) ?? "--"}
                    </p>
                  )}
                  {c.motivo_recusa && (
                    <p className="mt-0.5 text-xs text-muted-foreground">Recusa: {c.motivo_recusa}</p>
                  )}
                  {c.status === "proposta" && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={saving}
                        onClick={() => onDecidir({ coberturaId: c.id, aprovar: true })}
                      >
                        <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Aprovar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={saving}
                        onClick={() => {
                          setRecusarId(c.id);
                          setMotivo("");
                        }}
                      >
                        <XCircle className="mr-1 h-3.5 w-3.5" /> Recusar
                      </Button>
                    </div>
                  )}
                  {c.status === "aprovada" && c.execucao_status === "prevista" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2"
                      disabled={saving}
                      onClick={() => onConfirmar(c.id)}
                    >
                      <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Aconteceu
                    </Button>
                  )}
                  {recusarId === c.id && (
                    <div className="mt-2 space-y-2">
                      <Textarea
                        value={motivo}
                        onChange={(e) => setMotivo(e.target.value)}
                        placeholder="Por que essa cobertura não vale?"
                        rows={2}
                      />
                      <div className="flex gap-1.5">
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={saving || motivo.trim().length < 3}
                          onClick={() =>
                            onDecidir({ coberturaId: c.id, aprovar: false, motivoRecusa: motivo.trim() })
                          }
                        >
                          Confirmar recusa
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setRecusarId(null)}>
                          Voltar
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Quem vai cobrir</Label>
            <SubstitutoPicker opcoes={disponiveis} value={escolhido} onChange={setEscolhido} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cobertura-entrada">Entrada</Label>
              <Input
                id="cobertura-entrada"
                type="time"
                value={entrada}
                onChange={(e) => setEntrada(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cobertura-saida">Saída</Label>
              <Input
                id="cobertura-saida"
                type="time"
                value={saida}
                onChange={(e) => setSaida(e.target.value)}
              />
            </div>
          </div>
      </div>
    </DpDialogShell>
  );
}
