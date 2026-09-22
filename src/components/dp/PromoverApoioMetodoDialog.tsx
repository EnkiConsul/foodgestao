/**
 * Promoção de folguista / pessoa em teste a colaborador.
 *
 * Oferece os mesmos três caminhos do novo cadastro — manual, ficha de registro
 * e link de admissão — aproveitando os dados já digitados da pessoa. O caminho
 * escolhido fica amarrado à pessoa no servidor, para que a promoção não
 * aconteça duas vezes.
 */
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileUp, Send, Users } from "lucide-react";

export type PromoverApoioMetodo = "manual" | "importar" | "preadmissao";

interface Props {
  open: boolean;
  nome?: string | null;
  onOpenChange: (open: boolean) => void;
  onSelect: (metodo: PromoverApoioMetodo) => void;
}

const OPCOES: { key: PromoverApoioMetodo; icon: typeof Users; titulo: string; desc: string }[] = [
  {
    key: "preadmissao",
    icon: Send,
    titulo: "Enviar link de admissão",
    desc: "A pessoa preenche os dados e envia os documentos pelo celular; você revisa antes de cadastrar.",
  },
  {
    key: "importar",
    icon: FileUp,
    titulo: "Importar ficha de registro",
    desc: "Envie o PDF da ficha e o sistema preenche o cadastro para você conferir.",
  },
  {
    key: "manual",
    icon: Users,
    titulo: "Cadastro manual",
    desc: "Preencher agora vínculo, jornada, remuneração e acesso.",
  },
];

/** Escolha de como promover quem já está no banco de folguistas. */
export function PromoverApoioMetodoDialog({ open, nome, onOpenChange, onSelect }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Como Promover A Colaborador?</DialogTitle>
          <DialogDescription>
            {nome
              ? `Escolha por onde começar o cadastro de ${nome}. Os dados já informados são aproveitados.`
              : "Escolha por onde começar o cadastro. Os dados já informados são aproveitados."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 pt-2">
          {OPCOES.map(({ key, icon: Icon, titulo, desc }) => (
            <Button
              key={key}
              variant="outline"
              className="h-auto py-4 px-4 justify-start text-left"
              onClick={() => onSelect(key)}
            >
              <Icon className="h-6 w-6 mr-3 text-primary shrink-0" />
              <div className="whitespace-normal">
                <div className="font-semibold">{titulo}</div>
                <div className="text-xs text-muted-foreground font-normal">{desc}</div>
              </div>
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
