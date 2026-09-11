import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { DpFilePicker } from "@/components/dp/DpFilePicker";
import { useDpFeriasDocumentos } from "@/hooks/useDpFeriasDocumentos";
import {
  AVISO_FERIAS_PRAZO_DIAS, avisoForaDoPrazo, diasDeAntecedencia, validarRegistroAviso,
} from "@/lib/dp/ferias-aviso";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  gozo: {
    id: string;
    colaborador_id: string;
    colaborador_nome?: string | null;
    data_inicio: string;
    aviso_em?: string | null;
  } | null;
};

const hojeISO = () => format(new Date(), "yyyy-MM-dd");

/**
 * Registro do aviso de férias. O colaborador recebe a notificação para dar
 * ciência; se o aviso sair com menos de 30 dias, o gestor precisa justificar.
 * Data anterior a hoje só é aceita com declaração do gestor e comprovante.
 */
export function FeriasAvisoDialog({ open, onOpenChange, gozo }: Props) {
  const { anexar, registrarAviso } = useDpFeriasDocumentos();
  const [avisoEm, setAvisoEm] = useState("");
  const [justificativa, setJustificativa] = useState("");
  const [declarou, setDeclarou] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setAvisoEm(hojeISO());
    setJustificativa("");
    setDeclarou(false);
    setFile(null);
    setErro(null);
  }, [open]);

  if (!gozo) return null;

  const hoje = hojeISO();
  const retroativo = !!avisoEm && avisoEm < hoje;
  const dias = avisoEm ? diasDeAntecedencia(gozo.data_inicio, avisoEm) : null;
  const foraPrazo = !!avisoEm && avisoForaDoPrazo(gozo.data_inicio, avisoEm);
  const salvando = anexar.isPending || registrarAviso.isPending;

  const confirmar = async () => {
    const check = validarRegistroAviso({
      dataInicio: gozo.data_inicio,
      avisoEm,
      hojeISO: hoje,
      declarouComunicacao: declarou,
      temAnexo: !!file,
      justificativa,
    });
    if (!check.ok) return setErro(check.texto);
    setErro(null);
    let documentoId: string | null = null;
    if (file) {
      documentoId = await anexar.mutateAsync({
        gozoId: gozo.id,
        colaboradorId: gozo.colaborador_id,
        tipo: "aviso_ferias",
        referenciaData: avisoEm,
        file,
      });
    }
    await registrarAviso.mutateAsync({
      gozoId: gozo.id,
      avisoEm,
      retroativo,
      justificativa: foraPrazo ? justificativa : null,
      documentoId,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Aviso de férias</DialogTitle>
          <DialogDescription>
            {gozo.colaborador_nome ?? "O colaborador"} vai receber o aviso para dar ciência das
            férias que começam em {format(parseISO(gozo.data_inicio), "dd/MM/yyyy")}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Data do aviso</Label>
            <Input
              type="date"
              max={hoje}
              value={avisoEm}
              onChange={(e) => setAvisoEm(e.target.value)}
            />
            {dias !== null && (
              <p className="text-xs text-muted-foreground">
                {dias} dia(s) de antecedência · a lei pede {AVISO_FERIAS_PRAZO_DIAS}.
              </p>
            )}
          </div>

          {foraPrazo && (
            <div className="space-y-2 rounded-xl border border-destructive/50 bg-destructive/10 p-3">
              <p className="text-sm font-medium text-destructive">
                Aviso fora do prazo legal de {AVISO_FERIAS_PRAZO_DIAS} dias.
              </p>
              <Label>Justificativa</Label>
              <Textarea
                rows={2}
                value={justificativa}
                placeholder="Explique por que o aviso saiu fora do prazo."
                onChange={(e) => setJustificativa(e.target.value)}
              />
            </div>
          )}

          {retroativo && (
            <div className="space-y-2 rounded-xl border border-amber-400/60 bg-amber-500/10 p-3">
              <p className="text-sm font-medium text-amber-700">Registro retroativo</p>
              <label className="flex items-start gap-2 text-sm">
                <Checkbox
                  checked={declarou}
                  onCheckedChange={(v) => setDeclarou(v === true)}
                  className="mt-0.5"
                />
                <span>
                  Declaro que o aviso foi entregue ao colaborador na data informada, por outro meio,
                  e que o comprovante está anexado.
                </span>
              </label>
            </div>
          )}

          <div className="space-y-2">
            <Label>
              Comprovante do aviso {retroativo ? "(obrigatório)" : "(opcional)"}
            </Label>
            <DpFilePicker
              accept="image/*,application/pdf"
              onFileSelected={(f) => setFile(f)}
              file={file}
              onClear={() => setFile(null)}
            />
          </div>

          {erro && <p className="text-sm text-destructive">{erro}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={salvando} onClick={confirmar}>
            {salvando ? "Registrando…" : "Registrar aviso"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
