import { useEffect, useState } from "react";
import { AlertTriangle, Info, ShieldAlert } from "lucide-react";

import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import {
  temRiscoAlto,
  type AlertaAlteracao,
  type AlteracaoContratual,
  type EfeitoAlteracao,
} from "@/lib/dp/alteracao-contratual";

const hoje = () => new Date().toISOString().slice(0, 10);

const ICONE: Record<AlertaAlteracao["nivel"], typeof Info> = {
  alto: ShieldAlert,
  medio: AlertTriangle,
  info: Info,
};

const CLASSE: Record<AlertaAlteracao["nivel"], string> = {
  alto: "border-destructive/40 bg-destructive/10 text-destructive",
  medio: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  info: "border-border bg-muted/40 text-muted-foreground",
};

export interface AlteracaoContratualConfirmacao {
  efeito: EfeitoAlteracao;
  vigencia: string;
  justificativa: string;
}

interface Props {
  open: boolean;
  nome: string;
  /** Data de admissão, exibida como limite mínimo da vigência. */
  admissao?: string | null;
  alteracoes: AlteracaoContratual[];
  alertas: AlertaAlteracao[];
  salvando?: boolean;
  onCancel: () => void;
  onConfirm: (c: AlteracaoContratualConfirmacao) => void | Promise<void>;
}

/**
 * Confirmação de alteração de condição de trabalho.
 *
 * Mostra tudo que está mudando no contrato, pede a data a partir da qual a nova
 * condição vale (permitindo correção retroativa) e registra a justificativa.
 */
export function AlteracaoContratualDialog({
  open, nome, admissao, alteracoes, alertas, salvando, onCancel, onConfirm,
}: Props) {
  const [efeito, setEfeito] = useState<EfeitoAlteracao>("nova_vigencia");
  const [vigencia, setVigencia] = useState(hoje());
  const [justificativa, setJustificativa] = useState("");

  useEffect(() => {
    if (!open) return;
    setEfeito("nova_vigencia");
    setVigencia(hoje());
    setJustificativa("");
  }, [open]);

  const exigeJustificativa = temRiscoAlto(alertas) || efeito === "correcao";
  const justificativaOk = !exigeJustificativa || justificativa.trim().length >= 10;
  const vigenciaOk = /^\d{4}-\d{2}-\d{2}$/.test(vigencia) && (!admissao || vigencia >= admissao);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Confirmar alteração de condição de trabalho</DialogTitle>
          <DialogDescription>
            Você está alterando as condições contratuais de {nome || "colaborador"}. Confira o que muda
            e informe a partir de quando vale.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-xl border border-border divide-y divide-border">
            {alteracoes.map((a) => (
              <div key={a.campo} className="flex flex-wrap items-baseline gap-2 p-3 text-sm">
                <span className="font-medium">{a.label}</span>
                <span className="text-muted-foreground line-through">{a.de}</span>
                <span className="text-muted-foreground">→</span>
                <span className="font-semibold">{a.para}</span>
              </div>
            ))}
          </div>

          {alertas.map((al, i) => {
            const Icone = ICONE[al.nivel];
            return (
              <div key={`${al.titulo}-${i}`} className={`rounded-xl border p-3 text-sm ${CLASSE[al.nivel]}`}>
                <div className="flex items-start gap-2">
                  <Icone className="h-4 w-4 mt-0.5 shrink-0" />
                  <div className="space-y-1">
                    <p className="font-semibold">{al.titulo}</p>
                    <p className="text-[13px] leading-relaxed opacity-90">{al.mensagem}</p>
                  </div>
                </div>
              </div>
            );
          })}

          <Separator />

          <div className="space-y-3">
            <Label>Esta alteração é</Label>
            <RadioGroup value={efeito} onValueChange={(v) => setEfeito(v as EfeitoAlteracao)}>
              <div className="flex items-start gap-3 rounded-xl border border-border p-3">
                <RadioGroupItem value="nova_vigencia" id="efeito-nova" className="mt-1" />
                <Label htmlFor="efeito-nova" className="cursor-pointer font-normal">
                  <span className="font-medium block">Nova condição a partir de uma data</span>
                  <span className="text-xs text-muted-foreground">
                    A condição anterior fica no histórico e a nova passa a valer da data informada em diante.
                  </span>
                </Label>
              </div>
              <div className="flex items-start gap-3 rounded-xl border border-border p-3">
                <RadioGroupItem value="correcao" id="efeito-correcao" className="mt-1" />
                <Label htmlFor="efeito-correcao" className="cursor-pointer font-normal">
                  <span className="font-medium block">Correção de cadastro</span>
                  <span className="text-xs text-muted-foreground">
                    O cadastro estava errado. A condição correta passa a valer desde a data informada.
                  </span>
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="vigencia-alteracao">
              {efeito === "correcao" ? "Correta desde" : "Vale a partir de"}
            </Label>
            <Input
              id="vigencia-alteracao"
              type="date"
              value={vigencia}
              min={admissao ?? undefined}
              onChange={(e) => setVigencia(e.target.value)}
            />
            {!vigenciaOk && (
              <p className="text-xs text-destructive">
                Informe uma data válida, a partir da admissão do colaborador.
              </p>
            )}
            {vigenciaOk && vigencia < hoje() && (
              <p className="text-xs text-muted-foreground">
                Data retroativa: a nova condição vale desde {new Date(`${vigencia}T12:00:00`).toLocaleDateString("pt-BR")}.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="justificativa-alteracao">
              Justificativa {exigeJustificativa ? "" : "(opcional)"}
            </Label>
            <Textarea
              id="justificativa-alteracao"
              rows={3}
              value={justificativa}
              placeholder="Descreva o motivo da alteração e o acordo que a autoriza."
              onChange={(e) => setJustificativa(e.target.value)}
            />
            {exigeJustificativa && !justificativaOk && (
              <p className="text-xs text-destructive">Descreva o motivo com pelo menos 10 caracteres.</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={salvando}>
            Voltar e revisar
          </Button>
          <Button
            disabled={!vigenciaOk || !justificativaOk || salvando}
            onClick={() => void onConfirm({ efeito, vigencia, justificativa: justificativa.trim() })}
          >
            Confirmar alteração
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
