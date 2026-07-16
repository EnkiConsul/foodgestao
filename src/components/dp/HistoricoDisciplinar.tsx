import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const TIPO_LABEL: Record<string, string> = {
  advertencia_verbal: "Advertência verbal",
  advertencia_escrita: "Advertência escrita",
  suspensao: "Suspensão",
  elogio: "Elogio",
  observacao: "Observação",
};

export const TIPO_COR: Record<string, string> = {
  advertencia_verbal: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-300",
  advertencia_escrita: "bg-orange-500/10 text-orange-700 dark:text-orange-300",
  suspensao: "bg-red-500/10 text-red-700 dark:text-red-300",
  elogio: "bg-green-500/10 text-green-700 dark:text-green-300",
  observacao: "bg-muted text-muted-foreground",
};

export type RegistroDisciplinar = {
  id: string;
  tipo: string;
  data: string;
  motivo: string;
  descricao?: string | null;
  suspensao_dias?: number | null;
  pdf_storage_path?: string | null;
  dp_colaboradores?: { nome: string } | null;
};

interface HistoricoDisciplinarProps {
  registros: RegistroDisciplinar[];
  /** Se true, mostra o nome do colaborador em cada card (visão admin). */
  showColaborador?: boolean;
  /** Se true, mostra ações extra na direita (ex.: excluir/gerar PDF). */
  renderActions?: (r: RegistroDisciplinar) => React.ReactNode;
  emptyLabel?: string;
}

/**
 * Cards com o histórico disciplinar. Compartilhado entre a visão do
 * colaborador (`DpMeuDisciplinar`) e a visão administrativa (`DpDisciplinar`).
 */
export function HistoricoDisciplinar({
  registros,
  showColaborador = false,
  renderActions,
  emptyLabel = "Nenhum registro.",
}: HistoricoDisciplinarProps) {
  const openPdf = async (path: string) => {
    const { data, error } = await supabase.storage.from("dp-disciplinar").createSignedUrl(path, 60);
    if (error) return toast.error(error.message);
    window.open(data.signedUrl, "_blank");
  };

  if (registros.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">{emptyLabel}</CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-3">
      {registros.map((r) => (
        <Card key={r.id}>
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className={TIPO_COR[r.tipo]}>{TIPO_LABEL[r.tipo] ?? r.tipo}</Badge>
                {showColaborador && (
                  <CardTitle className="text-base">{r.dp_colaboradores?.nome ?? "—"}</CardTitle>
                )}
                <span className="text-xs text-muted-foreground">
                  {format(new Date(r.data), "dd 'de' MMM yyyy", { locale: ptBR })}
                </span>
                {r.suspensao_dias && <Badge variant="outline">{r.suspensao_dias} dia(s)</Badge>}
              </div>
              <div className="flex gap-1">
                {r.pdf_storage_path && (
                  <Button size="sm" variant="outline" onClick={() => openPdf(r.pdf_storage_path!)}>
                    <FileText className="h-4 w-4 mr-1" /> Ver PDF
                  </Button>
                )}
                {renderActions?.(r)}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-medium">{r.motivo}</p>
            {r.descricao && (
              <p className="text-sm text-muted-foreground whitespace-pre-wrap mt-1">{r.descricao}</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
