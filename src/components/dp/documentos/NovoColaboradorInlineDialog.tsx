import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { UserPlus, Loader2, FileUp } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { ColaboradorFormDialog } from "@/components/dp/ColaboradorFormDialog";

export interface NovoColaboradorInlineDialogProps {
  defaultNome?: string;
  defaultCpf?: string;
  defaultUnidadeId?: string | null;
  onCreated?: (id: string, nome: string) => void;
  trigger?: React.ReactNode;
}

/**
 * Atalho da conferência de documentos para cadastrar quem ainda não existe.
 * Abre SEMPRE o formulário oficial completo do colaborador, já preenchido com
 * o que foi lido da página — nunca um formulário paralelo resumido.
 */
export function NovoColaboradorInlineDialog({
  defaultNome = "",
  defaultCpf = "",
  defaultUnidadeId = null,
  onCreated,
  trigger,
}: NovoColaboradorInlineDialogProps) {
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompanyContext();
  const [choiceOpen, setChoiceOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [checando, setChecando] = useState(false);
  const [existing, setExisting] = useState<{ id: string; nome: string; ativo: boolean } | null>(null);

  const abrirFormulario = async () => {
    if (!selectedCompanyId) { toast.error("Selecione uma empresa antes de cadastrar"); return; }
    const cpf = defaultCpf.replace(/\D/g, "");
    setExisting(null);
    if (cpf) {
      setChecando(true);
      const { data, error } = await supabase
        .from("dp_colaboradores")
        .select("id,nome,ativo")
        .eq("company_id", selectedCompanyId)
        .eq("cpf", cpf)
        .maybeSingle();
      setChecando(false);
      if (error) { toast.error("Não foi possível verificar o CPF", { description: error.message }); return; }
      if (data) { setExisting(data as { id: string; nome: string; ativo: boolean }); return; }
    }
    setChoiceOpen(false);
    setFormOpen(true);
  };

  const vincularExistente = () => {
    if (!existing) return;
    onCreated?.(existing.id, existing.nome);
    toast.success("Página vinculada ao cadastro existente");
    setChoiceOpen(false);
  };

  return (
    <>
      <Dialog open={choiceOpen} onOpenChange={(o) => { setChoiceOpen(o); if (!o) setExisting(null); }}>
        <DialogTrigger asChild>{trigger ?? <Button size="sm" variant="outline" type="button"><UserPlus className="h-3.5 w-3.5 mr-1" /> Novo colaborador</Button>}</DialogTrigger>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Como Deseja Cadastrar?</DialogTitle><DialogDescription>A conferência atual ficará salva.</DialogDescription></DialogHeader>
          <div className="grid gap-3 pt-2">
            <Button variant="outline" disabled={checando} className="h-auto justify-start px-4 py-4 text-left whitespace-normal" onClick={() => void abrirFormulario()}>
              {checando ? <Loader2 className="mr-3 h-6 w-6 shrink-0 animate-spin" /> : <UserPlus className="mr-3 h-6 w-6 shrink-0 text-primary" />}
              <span><span className="block font-semibold">Cadastro manual</span><span className="block text-xs font-normal text-muted-foreground">Abre o cadastro completo já com os dados lidos desta página.</span></span>
            </Button>
            <Button variant="outline" className="h-auto justify-start px-4 py-4 text-left whitespace-normal" onClick={() => navigate("/dp/colaboradores/importar-ficha")}>
              <FileUp className="mr-3 h-6 w-6 shrink-0 text-primary" />
              <span><span className="block font-semibold">Importar ficha de registro</span><span className="block text-xs font-normal text-muted-foreground">Leia o cadastro completo em outro PDF.</span></span>
            </Button>
            {existing && (
              <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
                <p className="font-medium">Já existe cadastro com este CPF</p>
                <p className="text-muted-foreground">{existing.nome}{existing.ativo ? "" : " · Inativo"}</p>
                <Button className="mt-2 w-full" variant="outline" onClick={vincularExistente}>Vincular a este cadastro</Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <ColaboradorFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        colaborador={null}
        dadosIniciais={{ nome: defaultNome, cpf: defaultCpf, unidade_id: defaultUnidadeId }}
        onCriado={(id, nome) => onCreated?.(id, nome)}
      />
    </>
  );
}
