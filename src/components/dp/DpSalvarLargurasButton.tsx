import { Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { supabase } from "@/integrations/supabase/client";

export function DpSalvarLargurasButton(props: {
  screenKey: string;
  colOrder: string[];
  colWidths: Record<string, number>;
}) {
  const { isSuperAdmin } = useSuperAdmin();
  if (!isSuperAdmin) return null;

  const salvar = async () => {
    const { error } = await supabase
      .from("app_table_layouts")
      .upsert(
        {
          screen_key: props.screenKey,
          column_order: props.colOrder,
          column_widths: props.colWidths,
        },
        { onConflict: "screen_key" },
      );

    if (error) {
      toast.error("Erro ao salvar layout", { description: error.message });
      return;
    }

    toast.success("Layout padrão salvo", {
      description: "A ordem e as larguras atuais viraram o padrão global do sistema.",
    });
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-10 rounded-full"
      onClick={salvar}
      title="Salvar larguras e ordem das colunas como padrão global"
    >
      <Save className="h-4 w-4 sm:mr-2" /> <span className="hidden sm:inline">Salvar Larguras</span>
    </Button>
  );
}

export default DpSalvarLargurasButton;
