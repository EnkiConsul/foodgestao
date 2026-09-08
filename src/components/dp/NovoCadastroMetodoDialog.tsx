import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { UserPlus, FileUp, Users, ClipboardCheck } from "lucide-react";

export type NovoCadastroMetodo = "colaborador" | "folguista" | "teste" | "importar";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (metodo: NovoCadastroMetodo) => void;
}

const OPCOES: { key: NovoCadastroMetodo; icon: typeof UserPlus; titulo: string; desc: string }[] = [
  {
    key: "colaborador",
    icon: Users,
    titulo: "Colaborador (cadastro manual)",
    desc: "Cadastro completo, com vínculo, jornada, remuneração e acesso.",
  },
  {
    key: "importar",
    icon: FileUp,
    titulo: "Importar ficha de registro",
    desc: "Envie o PDF da ficha e o sistema preenche o cadastro para você revisar.",
  },
  {
    key: "folguista",
    icon: UserPlus,
    titulo: "Folguista",
    desc: "Contato para chamar em dias eventuais, sem cadastro completo.",
  },
  {
    key: "teste",
    icon: ClipboardCheck,
    titulo: "Em teste",
    desc: "Pessoa em experiência na operação, antes de efetivar.",
  },
];

/** Escolha única de como cadastrar alguém novo na equipe. */
export function NovoCadastroMetodoDialog({ open, onOpenChange, onSelect }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Quem Você Vai Cadastrar?</DialogTitle>
          <DialogDescription>Escolha o tipo de cadastro para começar.</DialogDescription>
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
