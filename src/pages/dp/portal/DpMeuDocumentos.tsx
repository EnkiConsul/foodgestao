import { Helmet } from "react-helmet-async";
import { useQuery } from "@tanstack/react-query";
import { Download, FileText } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

export default function DpMeuDocumentos() {
  const { user } = useAuth();
  const list = useQuery({
    queryKey: ["dp_meu_docs", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data: cid } = await supabase.rpc("dp_colaborador_of", { _user_id: user!.id });
      if (!cid) return [];
      const { data, error } = await supabase
        .from("dp_documentos")
        .select("*")
        .eq("colaborador_id", cid as string)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const download = async (path: string) => {
    const { data, error } = await supabase.storage.from("dp-documentos").createSignedUrl(path, 60);
    if (error || !data) return toast.error("Erro ao gerar link");
    window.open(data.signedUrl, "_blank");
  };

  return (
    <div className="space-y-4">
      <Helmet><title>Meus documentos — Portal</title></Helmet>
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <FileText className="h-6 w-6" /> Meus documentos
      </h1>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Título</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Referência</TableHead>
                <TableHead className="w-24"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(list.data ?? []).map((d: any) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.titulo}</TableCell>
                  <TableCell><Badge variant="outline" className="capitalize">{d.tipo}</Badge></TableCell>
                  <TableCell>{d.referencia_data ?? "—"}</TableCell>
                  <TableCell>
                    <Button size="icon" variant="ghost" onClick={() => download(d.file_path)}>
                      <Download className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {(list.data?.length ?? 0) === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Sem documentos.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
