import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useQuery } from "@tanstack/react-query";
import { ListChecks, Eye, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useDpColaboradores } from "@/hooks/useDpColaboradores";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableSkeleton } from "@/components/dp/DpSkeletons";
import { DocumentPreview } from "@/components/dp/DocumentPreview";
import { TIPOS } from "./DpDocumentos";
import { DpContentCard, DpFilterCard, DpPage, DpPageHeader } from "@/components/dp/DpPage";

type Doc = {
  id: string;
  titulo: string;
  tipo: string;
  referencia_data: string | null;
  file_path: string;
  mime_type?: string | null;
  created_at: string;
  colaborador_id: string | null;
  dp_colaboradores?: { nome: string } | null;
};

export default function DpHistoricoCompleto() {
  const { selectedCompanyId } = useCompanyContext();
  const colabs = useDpColaboradores();
  const [tipo, setTipo] = useState<string>("all");
  const [colabId, setColabId] = useState<string>("all");
  const [de, setDe] = useState<string>("");
  const [ate, setAte] = useState<string>("");
  const [busca, setBusca] = useState("");
  const [preview, setPreview] = useState<Doc | null>(null);

  const list = useQuery({
    queryKey: ["dp_historico_completo", selectedCompanyId, tipo, colabId, de, ate],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      let q = supabase
        .from("dp_documentos")
        .select("id, titulo, tipo, referencia_data, file_path, mime_type, created_at, colaborador_id, dp_colaboradores(nome)")
        .eq("company_id", selectedCompanyId!)
        .order("created_at", { ascending: false });
      if (tipo !== "all") q = q.eq("tipo", tipo as any);
      if (colabId !== "all") q = q.eq("colaborador_id", colabId);
      if (de) q = q.gte("created_at", de);
      if (ate) q = q.lte("created_at", ate + "T23:59:59");
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Doc[];
    },
  });

  const filtered = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return list.data ?? [];
    return (list.data ?? []).filter(
      (d) =>
        d.titulo?.toLowerCase().includes(q) ||
        d.dp_colaboradores?.nome?.toLowerCase().includes(q),
    );
  }, [list.data, busca]);

  const download = async (path: string, titulo: string) => {
    const { data, error } = await supabase.storage.from("dp-documentos").createSignedUrl(path, 60);
    if (error || !data) return toast.error("Erro ao gerar link");
    const a = document.createElement("a");
    a.href = data.signedUrl;
    a.download = titulo || "documento";
    a.rel = "noopener noreferrer";
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <DpPage>
      <Helmet><title>Histórico Completo — DP 360°</title></Helmet>
      <DpPageHeader
        icon={ListChecks}
        title="Histórico completo de documentos"
        description="Visão unificada de todos os documentos por colaborador, tipo e período."
      />

      <DpFilterCard>
        <div className="grid gap-3 md:grid-cols-5">
          <div className="space-y-1.5">
            <Label className="text-xs">TIPO</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {TIPOS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">COLABORADOR</Label>
            <Select value={colabId} onValueChange={setColabId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {(colabs.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">DE</Label>
            <Input type="date" value={de} onChange={(e) => setDe(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">ATÉ</Label>
            <Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">BUSCAR</Label>
            <Input
              placeholder="Título ou colaborador"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
        </div>
      </DpFilterCard>

      <DpContentCard contentClassName="overflow-x-auto">
          {list.isLoading ? (
            <TableSkeleton
              columns={6}
              headers={["Data", "Colaborador", "Tipo", "Título", "Referência", "Ações"]}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Colaborador</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Título</TableHead>
                  <TableHead>Referência</TableHead>
                  <TableHead className="w-28 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(d.created_at).toLocaleDateString("pt-BR")}
                    </TableCell>
                    <TableCell className="font-medium">{d.dp_colaboradores?.nome ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">{d.tipo}</Badge>
                    </TableCell>
                    <TableCell className="max-w-xs truncate">{d.titulo}</TableCell>
                    <TableCell>{d.referencia_data ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" title="Pré-visualizar" onClick={() => setPreview(d)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" title="Baixar" onClick={() => download(d.file_path, d.titulo)}>
                        <Download className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                      Nenhum documento encontrado com esses filtros.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
      </DpContentCard>

      <p className="text-xs text-muted-foreground">
        {filtered.length} de {list.data?.length ?? 0} documento(s) exibido(s).
      </p>

      <DocumentPreview
        open={!!preview}
        onOpenChange={(v) => { if (!v) setPreview(null); }}
        title={preview?.titulo}
        bucket="dp-documentos"
        path={preview?.file_path}
        mime={preview?.mime_type}
      />
    </DpPage>
  );
}
