import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useQuery } from "@tanstack/react-query";
import { Download, FileText, Eye, DownloadCloud } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { DocumentPreview } from "@/components/dp/DocumentPreview";

const TABS: { key: string; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "contracheque", label: "Contracheques" },
  { key: "ponto", label: "Ponto" },
  { key: "adiantamento", label: "Adiantamentos" },
  { key: "contrato", label: "Contratos" },
  { key: "outros", label: "Outros" },
];

const KNOWN_TIPOS = new Set(["contracheque", "ponto", "adiantamento", "contrato"]);

type Doc = {
  id: string;
  titulo: string;
  tipo: string;
  referencia_data: string | null;
  file_path: string;
  mime_type?: string | null;
};

export default function DpMeuDocumentos() {
  const { user } = useAuth();
  const [tab, setTab] = useState("all");
  const [preview, setPreview] = useState<Doc | null>(null);

  const list = useQuery({
    queryKey: ["dp_meu_docs", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data: cid } = await supabase.rpc("dp_colaborador_of", { _user_id: user!.id });
      if (!cid) return [] as Doc[];
      const { data, error } = await supabase
        .from("dp_documentos")
        .select("id, titulo, tipo, referencia_data, file_path, mime_type")
        .eq("colaborador_id", cid as string)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Doc[];
    },
  });

  const filtered = useMemo(() => {
    const all = list.data ?? [];
    if (tab === "all") return all;
    if (tab === "outros") return all.filter((d) => !KNOWN_TIPOS.has(d.tipo));
    return all.filter((d) => d.tipo === tab);
  }, [list.data, tab]);

  const download = async (path: string) => {
    const { data, error } = await supabase.storage.from("dp-documentos").createSignedUrl(path, 60);
    if (error || !data) return toast.error("Erro ao gerar link");
    window.open(data.signedUrl, "_blank");
  };

  const downloadAll = async () => {
    if (filtered.length === 0) return;
    toast.info(`Abrindo ${filtered.length} download(s)…`);
    for (const d of filtered) {
      const { data } = await supabase.storage.from("dp-documentos").createSignedUrl(d.file_path, 120);
      if (data?.signedUrl) window.open(data.signedUrl, "_blank");
      await new Promise((r) => setTimeout(r, 250));
    }
  };

  return (
    <div className="space-y-4">
      <Helmet><title>Meus documentos — Portal</title></Helmet>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileText className="h-6 w-6" /> Meus documentos
        </h1>
        <Button
          size="sm"
          variant="outline"
          onClick={downloadAll}
          disabled={filtered.length === 0}
        >
          <DownloadCloud className="h-4 w-4 mr-1" /> Baixar todos ({filtered.length})
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap h-auto">
          {TABS.map((t) => (
            <TabsTrigger key={t.key} value={t.key}>{t.label}</TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={tab} className="mt-4">
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Título</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Referência</TableHead>
                    <TableHead className="w-32 text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium">{d.titulo}</TableCell>
                      <TableCell><Badge variant="outline" className="capitalize">{d.tipo}</Badge></TableCell>
                      <TableCell>{d.referencia_data ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        <Button size="icon" variant="ghost" title="Pré-visualizar" onClick={() => setPreview(d)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" title="Baixar" onClick={() => download(d.file_path)}>
                          <Download className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                        Sem documentos nesta categoria.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <DocumentPreview
        open={!!preview}
        onOpenChange={(v) => { if (!v) setPreview(null); }}
        title={preview?.titulo}
        bucket="dp-documentos"
        path={preview?.file_path}
        mime={preview?.mime_type}
      />
    </div>
  );
}
