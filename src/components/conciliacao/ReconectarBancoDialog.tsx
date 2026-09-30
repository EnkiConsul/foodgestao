import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Unplug, Plus, ShieldCheck, Search } from "lucide-react";

interface ReconectarBancoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Nome do banco/conta apresentado ao usuário (ex.: "Banco BMG"). */
  banco?: string | null;
}

/**
 * Orientação passo a passo para o usuário refazer a autorização do banco no
 * Open Finance. Quando o banco atualiza o saldo mas retém o extrato, renovar o
 * consentimento é o caminho que reabre o envio dos lançamentos.
 */
export function ReconectarBancoDialog({ open, onOpenChange, banco }: ReconectarBancoDialogProps) {
  const navigate = useNavigate();
  const nome = banco?.trim() || "o banco";

  const passos = [
    {
      icon: Search,
      titulo: `Abra Conexões Open Finance e localize ${nome}`,
      texto: "A lista mostra todos os bancos conectados a esta empresa.",
    },
    {
      icon: Unplug,
      titulo: "Clique em Desconectar",
      texto:
        "Isso encerra apenas a autorização de acesso. Nenhum lançamento já conciliado é apagado — todo o histórico permanece.",
    },
    {
      icon: Plus,
      titulo: "Clique em Conectar banco e autorize de novo",
      texto: `Escolha ${nome} na lista e conclua a autorização no aplicativo ou site do banco.`,
    },
    {
      icon: ShieldCheck,
      titulo: "Confirme o compartilhamento de Extrato e Movimentações",
      texto:
        "Na tela de autorização do banco, marque também extrato e movimentações, não apenas saldos. É isso que libera os lançamentos.",
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Como reconectar {nome}</DialogTitle>
          <DialogDescription>
            O banco atualizou o saldo, mas não enviou todos os lançamentos do período. Refazer a
            autorização reabre o envio do extrato.
          </DialogDescription>
        </DialogHeader>

        <ol className="space-y-3">
          {passos.map((p, i) => (
            <li key={p.titulo} className="flex gap-3 rounded-lg border border-border bg-card p-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {i + 1}
              </span>
              <div className="min-w-0 space-y-1">
                <p className="flex items-start gap-1.5 text-sm font-medium text-foreground">
                  <p.icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span className="break-words">{p.titulo}</span>
                </p>
                <p className="text-xs text-muted-foreground">{p.texto}</p>
              </div>
            </li>
          ))}
        </ol>

        <p className="text-xs text-muted-foreground">
          Depois de reconectar, o sistema busca o período que faltava na próxima sincronização e o
          aviso desaparece sozinho quando a conta fecha.
        </p>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          <Button
            onClick={() => {
              onOpenChange(false);
              navigate("/contas-bancarias/conexoes");
            }}
          >
            Ir para Conexões
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
