import { useMemo } from "react";
import { Link } from "react-router-dom";
import { FileCheck2, AlertTriangle, Settings2, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useDpColaboradorDocumentos } from "@/hooks/useDpColaboradorDocumentos";
import { CATEGORIA_LABEL, type ItemChecklist } from "@/lib/dp/documentos-requisitos";
import { DocumentoRequisitoRow } from "./DocumentoRequisitoRow";

type Props = {
  colaboradorId?: string | null;
  /** Portal do colaborador: só envia e aceita, nunca aprova. */
  somenteEnvio?: boolean;
  /** Esconde o atalho para a configuração da empresa. */
  ocultarConfig?: boolean;
};

export function ColaboradorDocumentosPanel({
  colaboradorId,
  somenteEnvio = false,
  ocultarConfig = false,
}: Props) {
  const doc = useDpColaboradorDocumentos(colaboradorId, { comoColaborador: somenteEnvio });

  const grupos = useMemo(() => {
    const map = new Map<string, ItemChecklist[]>();
    for (const item of doc.itens) {
      const key = item.requisito.categoria ?? "geral";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return [...map.entries()];
  }, [doc.itens]);

  if (!colaboradorId) {
    return (
      <Alert>
        <AlertDescription>
          Salve o cadastro do colaborador para liberar o checklist de documentos.
        </AlertDescription>
      </Alert>
    );
  }

  if (doc.isLoading) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" /> Carregando checklist…
      </div>
    );
  }

  const { resumo } = doc;
  const ocupado =
    doc.enviar.isPending ||
    doc.aprovar.isPending ||
    doc.recusar.isPending ||
    doc.dispensar.isPending ||
    doc.excluirAnexo.isPending ||
    doc.pedirAceite.isPending ||
    doc.aceitar.isPending;


  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileCheck2 className="size-4 text-primary" />
            Documentos {somenteEnvio ? "exigidos" : "de admissão"}
          </CardTitle>
          {!somenteEnvio && !ocultarConfig && (
            <Button asChild size="sm" variant="ghost">
              <Link to="/dp/cadastros/documentos-exigidos">
                <Settings2 className="mr-1 size-4" /> Configurar exigências
              </Link>
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="outline">{resumo.total} exigências</Badge>
            <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" variant="outline">
              {resumo.aprovados} em conformidade
            </Badge>
            <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-300" variant="outline">
              {resumo.aguardandoAprovacao.length} aguardando aprovação
            </Badge>
            <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300" variant="outline">
              {resumo.vencendo.length} vencendo
            </Badge>
            <Badge variant="outline" className="bg-destructive/15 text-destructive">
              {resumo.pendentesObrigatorios.length} pendências
            </Badge>
          </div>
          {resumo.pendentesObrigatorios.length > 0 && (
            <Alert>
              <AlertTriangle className="size-4" />
              <AlertDescription>
                Faltam {resumo.pendentesObrigatorios.length} documento(s) obrigatório(s). O cadastro pode ser
                salvo, mas a pendência aparece no painel do gestor e no acesso do colaborador.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {grupos.map(([categoria, itens]) => (
        <div key={categoria} className="space-y-2">
          <h4 className="text-sm font-semibold text-muted-foreground">
            {CATEGORIA_LABEL[categoria] ?? categoria}
          </h4>
          <div className="space-y-2">
            {itens.map((item) => (
              <DocumentoRequisitoRow
                key={`${item.requisito.id}-${item.dependente?.id ?? "self"}`}
                item={item}
                somenteEnvio={somenteEnvio}
                ocupado={ocupado}
                onEnviar={(file, validade) => doc.enviar.mutate({ item, file, validade })}
                onAbrir={(anexo) => doc.abrirArquivo(anexo)}
                onAprovar={(anexo, validade) => doc.aprovar.mutate({ item, anexo, validade })}
                onRecusar={(anexo, motivo) => doc.recusar.mutate({ item, anexo, motivo })}
                onDispensar={(motivo) => doc.dispensar.mutate({ item, motivo })}
                onAceitar={(anexo) => doc.aceitar.mutate({ item, anexo })}
                {...(somenteEnvio
                  ? {}
                  : {
                      onExcluir: (anexo) => doc.excluirAnexo.mutate({ anexo }),
                      onPedirAceite: item.requisito.exige_aceite
                        ? (anexo) => doc.pedirAceite.mutate({ anexo })
                        : undefined,
                    })}

              />
            ))}
          </div>
        </div>
      ))}

      {grupos.length === 0 && (
        <Alert>
          <AlertDescription>
            Nenhuma exigência de documento configurada para este colaborador.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
