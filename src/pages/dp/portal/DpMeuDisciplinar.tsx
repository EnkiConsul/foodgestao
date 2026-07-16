import { Helmet } from "react-helmet-async";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertOctagon, FileText } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const TIPO_LABEL: Record<string, string> = {
  advertencia_verbal: "Advertência verbal",
  advertencia_escrita: "Advertência escrita",
  suspensao: "Suspensão",
  elogio: "Elogio",
  observacao: "Observação",
};
const cor: Record<string, string> = {
  advertencia_verbal: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-300",
  advertencia_escrita: "bg-orange-500/10 text-orange-700 dark:text-orange-300",
  suspensao: "bg-red-500/10 text-red-700 dark:text-red-300",
  elogio: "bg-green-500/10 text-green-700 dark:text-green-300",
  observacao: "bg-muted text-muted-foreground",
};

export default function DpMeuDisciplinar() {
  const { user } = useAuth();

  const list = useQuery({
    queryKey: ["dp_meu_disciplinar", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data: cid } = await supabase.rpc("dp_colaborador_of", { _user_id: user!.id });
      if (!cid) return [];
      const { data, error } = await supabase
        .from("dp_registros_disciplinares").select("*")
        .eq("colaborador_id", cid as string)
        .order("data", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const openPdf = async (path: string) => {
    const { data, error } = await supabase.storage.from("dp-disciplinar").createSignedUrl(path, 60);
    if (error) return toast.error(error.message);
    window.open(data.signedUrl, "_blank");
  };

  return (
    <div className="space-y-4">
      <Helmet><title>Meus registros disciplinares — Portal</title></Helmet>
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <AlertOctagon className="h-6 w-6" /> Registros disciplinares
      </h1>
      {(list.data?.length ?? 0) === 0 ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground">Nenhum registro.</CardContent></Card>
      ) : (
        <div className="grid gap-3">
          {list.data?.map((r: any) => (
            <Card key={r.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Badge className={cor[r.tipo]}>{TIPO_LABEL[r.tipo] ?? r.tipo}</Badge>
                    <CardTitle className="text-base">
                      {format(new Date(r.data), "dd 'de' MMM yyyy", { locale: ptBR })}
                    </CardTitle>
                    {r.suspensao_dias && <Badge variant="outline">{r.suspensao_dias} dia(s)</Badge>}
                  </div>
                  {r.pdf_storage_path && (
                    <Button size="sm" variant="outline" onClick={() => openPdf(r.pdf_storage_path)}>
                      <FileText className="h-4 w-4 mr-1" /> Ver PDF
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm font-medium">{r.motivo}</p>
                {r.descricao && <p className="text-sm text-muted-foreground whitespace-pre-wrap mt-1">{r.descricao}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
