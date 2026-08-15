import { AlertTriangle, Printer } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { termoDispensaTexto, type IsonomiaAlerta } from "@/lib/dp/beneficios-regras";

export interface DispensaBeneficio {
  beneficio_id: string;
  beneficio_nome: string;
  alerta: IsonomiaAlerta;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  colaborador: { nome: string; cpf?: string | null; cargo?: string | null };
  empresa: { nome: string; cnpj?: string | null; cidade?: string | null };
  itens: DispensaBeneficio[];
  onConfirmar: () => void;
}

/** Abre o termo de dispensa em uma janela pronta para impressão/assinatura. */
function imprimirTermo(
  colaborador: Props["colaborador"],
  empresa: Props["empresa"],
  beneficio: string,
) {
  const paragrafos = termoDispensaTexto({
    empresa: empresa.nome,
    empresaCnpj: empresa.cnpj,
    colaborador: colaborador.nome,
    colaboradorCpf: colaborador.cpf,
    cargo: colaborador.cargo,
    beneficio,
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
 * Alerta de isonomia ao retirar um benefício de um colaborador e geração do
 * termo de não adesão para assinatura — o cadastro não é bloqueado.
 */
export function BeneficioDispensaDialog({
  open, onOpenChange, colaborador, empresa, itens, onConfirmar,
}: Props) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" aria-hidden="true" />
            Benefício retirado — atenção à isonomia
          </AlertDialogTitle>
          <AlertDialogDescription>
            Colegas em situação equivalente continuam recebendo. Registre o motivo e colha o
            termo assinado para reduzir o risco trabalhista.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <ul className="max-h-[45vh] space-y-3 overflow-y-auto">
          {itens.map((i) => (
            <li key={i.beneficio_id} className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
              <p className="font-semibold text-foreground">{i.alerta.titulo}</p>
              <p className="mt-1 text-muted-foreground">{i.alerta.mensagem}</p>
              <p className="mt-1 text-muted-foreground">
                Mantêm o benefício: {i.alerta.colegas.slice(0, 5).join(", ")}
                {i.alerta.colegas.length > 5 ? ` e mais ${i.alerta.colegas.length - 5}` : ""}.
              </p>
              <p className="mt-1 text-muted-foreground">{i.alerta.recomendacao}</p>
              <Button
                type="button" size="sm" variant="outline" className="mt-2 gap-2"
                onClick={() => imprimirTermo(colaborador, empresa, i.beneficio_nome)}
              >
                <Printer className="h-4 w-4" aria-hidden="true" />
                Gerar termo de não adesão
              </Button>
            </li>
          ))}
        </ul>

        <AlertDialogFooter>
          <AlertDialogCancel>Manter o benefício</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirmar}>Estou ciente, continuar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
