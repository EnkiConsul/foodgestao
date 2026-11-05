import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  ESTADO_LABEL, IMPACTO_LABEL, TRATATIVA_LABEL, DECISAO_TRATATIVA_LABEL, rotuloTipoOcorrencia,
} from "@/lib/dp/ocorrencias";

interface Props {
  ocorrenciaId: string | null;
  nome: string;
  onOpenChange: (open: boolean) => void;
}

/** Detalhes de leitura de uma ausência do dia; edição continua na tela oficial de Ocorrências. */
export function AusenciaDetalheSheet({ ocorrenciaId, nome, onOpenChange }: Props) {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const open = !!ocorrenciaId;

  const { data, isLoading, error } = useQuery({
    queryKey: ["dp_ocorrencia_detalhe", ocorrenciaId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_ocorrencias")
        .select("id, tipo, subtipo, troca_id, estado, data_operacional, justificativa_inicial, justificativa_final, impacta_assiduidade, impacta_ferias, tratativa_status, tratativa_decisao")
        .eq("id", ocorrenciaId!)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const titulo = data ? rotuloTipoOcorrencia(data) : "Ausência";
  const corpo = (
    <div className="space-y-4 text-sm">
      {isLoading && <Skeleton className="h-24 w-full" />}
      {error && <p className="text-destructive">Não foi possível carregar os detalhes.</p>}
      {data && (
        <>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{titulo}</Badge>
            <Badge variant="secondary">{ESTADO_LABEL[data.estado as keyof typeof ESTADO_LABEL] ?? data.estado}</Badge>
          </div>
          <dl className="space-y-3">
            <div>
              <dt className="text-xs text-muted-foreground">Data</dt>
              <dd>{String(data.data_operacional).split("-").reverse().join("/")}</dd>
            </div>
            {(data.justificativa_final || data.justificativa_inicial) && (
              <div>
                <dt className="text-xs text-muted-foreground">Justificativa</dt>
                <dd className="whitespace-pre-wrap break-words">{data.justificativa_final || data.justificativa_inicial}</dd>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <dt className="text-xs text-muted-foreground">Assiduidade</dt>
                <dd>{IMPACTO_LABEL[data.impacta_assiduidade as keyof typeof IMPACTO_LABEL] ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Férias</dt>
                <dd>{IMPACTO_LABEL[data.impacta_ferias as keyof typeof IMPACTO_LABEL] ?? "—"}</dd>
              </div>
            </div>
            {(data.tratativa_decisao || data.tratativa_status) && (
              <div>
                <dt className="text-xs text-muted-foreground">Tratativa</dt>
                <dd>
                  {data.tratativa_decisao
                    ? DECISAO_TRATATIVA_LABEL[data.tratativa_decisao] ?? data.tratativa_decisao
                    : TRATATIVA_LABEL[data.tratativa_status as keyof typeof TRATATIVA_LABEL] ?? data.tratativa_status}
                </dd>
              </div>
            )}
          </dl>
        </>
      )}
      <Button
        className="h-12 w-full justify-between"
        disabled={!ocorrenciaId}
        onClick={() => { onOpenChange(false); navigate(`/dp/ocorrencias?id=${ocorrenciaId}`); }}
      >
        Abrir em Ocorrências <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="max-h-[88dvh] overflow-y-auto rounded-t-2xl pb-[max(1rem,env(safe-area-inset-bottom))]">
          <SheetHeader className="text-left">
            <SheetTitle>{titulo}</SheetTitle>
            <SheetDescription>{nome}</SheetDescription>
          </SheetHeader>
          <div className="mt-4">{corpo}</div>
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{nome}</DialogDescription>
        </DialogHeader>
        {corpo}
      </DialogContent>
    </Dialog>
  );
}
