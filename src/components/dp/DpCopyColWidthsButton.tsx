import { Ruler } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";

/**
 * TEMPORÁRIO (super admin): copia a largura e a ordem atuais das colunas
 * para que possam ser fixadas como padrão do sistema no código.
 */
export function DpCopyColWidthsButton(props: {
  tela: string;
  colOrder: string[];
  colWidths: Record<string, number>;
}) {
  const { isSuperAdmin } = useSuperAdmin();
  if (!isSuperAdmin) return null;

  const copiar = async () => {
    const payload = JSON.stringify(
      { tela: props.tela, ordem: props.colOrder, larguras: props.colWidths },
      null,
      2,
    );
    try {
      await navigator.clipboard.writeText(payload);
      toast.success("Larguras copiadas", { description: "Cole no chat para virar o padrão." });
    } catch {
      window.prompt("Copie as larguras abaixo:", payload);
    }
  };

  return (
    <Button variant="ghost" size="sm" className="h-10 rounded-full" onClick={copiar} title="Copiar larguras das colunas">
      <Ruler className="h-4 w-4 sm:mr-2" /> <span className="hidden sm:inline">Copiar Larguras</span>
    </Button>
  );
}

export default DpCopyColWidthsButton;
