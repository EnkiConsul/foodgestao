import { toast } from "sonner";
import { Copy, Download } from "lucide-react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export type ResumoContabilidade = {
  gozoId: string;
  nome: string;
  cpfMascarado: string;
  unidade: string;
  periodoAquisitivo: string;
  datas: string;
  dias: number;
  diasAbono: number;
  adiantar13: boolean;
  observacao: string | null;
};

/** Monta o texto do resumo enviado à contabilidade (nunca inclui valores). */
export function textoResumo(r: ResumoContabilidade): string {
  return [
    `Colaborador: ${r.nome}`,
    `CPF: ${r.cpfMascarado}`,
    `Unidade: ${r.unidade}`,
    `Período aquisitivo: ${r.periodoAquisitivo}`,
    `Férias: ${r.datas}`,
    `Dias de férias: ${r.dias}`,
    `Dias de abono: ${r.diasAbono}`,
    `Adiantamento do 13º: ${r.adiantar13 ? "sim" : "não"}`,
    r.observacao ? `Observação: ${r.observacao}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

interface Props {
  resumo: ResumoContabilidade | null;
  onOpenChange: (open: boolean) => void;
  saving?: boolean;
  onConfirmar: () => void;
}

/** Resumo para a contabilidade, com cópia, download e confirmação do envio. */
export function FeriasResumoContabilidadeDialog({ resumo, onOpenChange, saving, onConfirmar }: Props) {
  const texto = resumo ? textoResumo(resumo) : "";

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success("Resumo copiado");
    } catch {
      toast.error("Não foi possível copiar. Selecione o texto e copie manualmente.");
    }
  };

  const baixar = () => {
    const blob = new Blob([texto], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ferias-${resumo?.nome.replace(/\s+/g, "-").toLowerCase() ?? "resumo"}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={!!resumo} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Informar à contabilidade</DialogTitle>
        </DialogHeader>

        <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-xl bg-muted/50 p-3 text-sm">
          {texto}
        </pre>
        <p className="text-xs text-muted-foreground">
          Nenhum valor é calculado aqui. A contabilidade confere e processa o pagamento.
        </p>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={() => void copiar()}>
            <Copy className="mr-1 size-4" /> Copiar
          </Button>
          <Button variant="outline" onClick={baixar}>
            <Download className="mr-1 size-4" /> Baixar
          </Button>
          <Button disabled={saving} onClick={onConfirmar}>
            {saving ? "Salvando…" : "Marcar como informada"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
