import { Helmet } from "react-helmet-async";
import { FileStack, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function DpDocImportBulk() {
  return (
    <div className="space-y-4">
      <Helmet><title>Importação em massa — DP 360°</title></Helmet>
      <div>
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <FileStack className="h-5 w-5" /> Importação em massa de documentos
        </h2>
        <p className="text-sm text-muted-foreground">
          Divisão automática de PDFs multi-página (contracheque, ponto, adiantamento) por colaborador.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Info className="h-4 w-4" /> Recurso em preparação
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            O motor de split de PDFs por CPF/matrícula e vinculação automática a <code>dp_documentos</code> será entregue
            na próxima onda (dependência: reconhecimento de texto/OCR na edge function <code>dp-import-documentos</code>).
          </p>
          <p>
            Enquanto isso, use a página <b>Documentos</b> para upload individual — cada arquivo é associado ao colaborador escolhido
            e ao tipo (contracheque, ponto, atestado etc.).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
