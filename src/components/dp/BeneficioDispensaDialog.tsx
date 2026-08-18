import { useEffect, useState } from "react";
import { AlertTriangle, Printer } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  MOTIVOS_ISONOMIA, MOTIVO_ISONOMIA_LABEL, termoDispensaTexto,
  type DivergenciaIsonomia, type MotivoIsonomia,
} from "@/lib/dp/beneficios-regras";
import { formatarBRL } from "@/lib/dp/folha";

export interface DispensaBeneficio {
  beneficio_id: string;
  beneficio_nome: string;
  divergencia: DivergenciaIsonomia;
}

export interface MotivoIsonomiaEscolhido {
  motivo: MotivoIsonomia;
  detalhe: string;
  descricao: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  colaborador: { nome: string; cpf?: string | null; cargo?: string | null };
  empresa: { nome: string; cnpj?: string | null; cidade?: string | null };
  itens: DispensaBeneficio[];
  onConfirmar: (motivo: MotivoIsonomiaEscolhido) => void;
}

/** Abre o termo de dispensa em uma janela pronta para impressão/assinatura. */
function imprimirTermo(
  colaborador: Props["colaborador"],
  empresa: Props["empresa"],
  beneficio: string,
  motivo?: string | null,
) {
  const paragrafos = termoDispensaTexto({
    empresa: empresa.nome,
    empresaCnpj: empresa.cnpj,
    colaborador: colaborador.nome,
    colaboradorCpf: colaborador.cpf,
    cargo: colaborador.cargo,
    beneficio,
    motivo,
    cidade: empresa.cidade,
  });
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Termo de não adesão — ${beneficio}</title>
<style>
  body{font-family:Georgia,serif;max-width:720px;margin:40px auto;padding:0 24px;line-height:1.7;color:#111}
  h1{font-size:18px;text-align:center;text-transform:uppercase;letter-spacing:.5px;margin-bottom:28px}
  p{text-align:justify;margin:0 0 16px}
  .assinaturas{margin-top:64px;display:flex;gap:48px}
  .linha{flex:1;border-top:1px solid #111;padding-top:6px;font-size:12px;text-align:center}
  @media print{body{margin:0}}
</style></head><body>
<h1>Termo de ciência e não adesão a benefício</h1>
${paragrafos.map((t) => `<p>${t}</p>`).join("\n")}
<div class="assinaturas">
  <div class="linha">${colaborador.nome}</div>
  <div class="linha">${empresa.nome}</div>
</div>
<script>window.onload=function(){window.print()}</script>
</body></html>`;
  const w = window.open("", "_blank", "width=820,height=900");
  if (!w) return;
  w.document.write(html);
  w.document.close();
}

/**
 * Confirmação de isonomia: colegas em situação equivalente recebem o benefício.
 * Continuar exige escolher um motivo objetivo, que é registrado no histórico e
 * pode ser levado ao termo de não adesão assinado pelo colaborador.
 */
export function BeneficioDispensaDialog({
  open, onOpenChange, colaborador, empresa, itens, onConfirmar,
}: Props) {
  const [motivo, setMotivo] = useState<MotivoIsonomia | "">("");
  const [detalhe, setDetalhe] = useState("");

  useEffect(() => {
    if (open) { setMotivo(""); setDetalhe(""); }
  }, [open]);

  const precisaDetalhe = motivo === "outro";
  const podeConfirmar = !!motivo && (!precisaDetalhe || detalhe.trim().length >= 5);
  const descricao = motivo
    ? [MOTIVO_ISONOMIA_LABEL[motivo], detalhe.trim()].filter(Boolean).join(" — ")
    : "";

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" aria-hidden="true" />
            Isonomia: colegas recebem este benefício
          </AlertDialogTitle>
          <AlertDialogDescription>
            Para continuar, informe o motivo objetivo da diferença. O motivo fica registrado no
            histórico e pode ser impresso no termo de não adesão.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <ul className="max-h-[35vh] space-y-3 overflow-y-auto">
          {itens.map((i) => (
            <li key={`${i.beneficio_id}-${i.divergencia.tipo}`} className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
              <p className="font-semibold text-foreground">{i.divergencia.titulo}</p>
              <p className="mt-1 text-muted-foreground">{i.divergencia.mensagem}</p>
              <p className="mt-1 text-muted-foreground">
                Recebem: {i.divergencia.colegas.slice(0, 5).join(", ")}
                {i.divergencia.colegas.length > 5 ? ` e mais ${i.divergencia.colegas.length - 5}` : ""}.
                {i.divergencia.valor_padrao
                  ? ` Padrão do grupo: ${formatarBRL(i.divergencia.valor_padrao)}/mês.`
                  : ""}
              </p>
              <Button
                type="button" size="sm" variant="outline" className="mt-2 gap-2"
                onClick={() => imprimirTermo(colaborador, empresa, i.beneficio_nome, descricao || null)}
              >
                <Printer className="h-4 w-4" aria-hidden="true" />
                Gerar termo de não adesão
              </Button>
            </li>
          ))}
        </ul>

        <div className="space-y-2">
          <Label>Motivo objetivo da diferença *</Label>
          <Select value={motivo} onValueChange={(v: MotivoIsonomia) => setMotivo(v)}>
            <SelectTrigger><SelectValue placeholder="Selecione o motivo" /></SelectTrigger>
            <SelectContent>
              {MOTIVOS_ISONOMIA.map((m) => (
                <SelectItem key={m.valor} value={m.valor}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {precisaDetalhe && (
            <Textarea
              value={detalhe}
              onChange={(e) => setDetalhe(e.target.value)}
              placeholder="Descreva o motivo objetivo (mínimo 5 caracteres)"
              rows={3}
            />
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Conceder o benefício</AlertDialogCancel>
          <AlertDialogAction
            disabled={!podeConfirmar}
            onClick={(e) => {
              if (!podeConfirmar || !motivo) { e.preventDefault(); return; }
              onConfirmar({ motivo, detalhe: detalhe.trim(), descricao });
            }}
          >
            Registrar motivo e continuar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
