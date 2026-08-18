import { useMemo, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Download, FileText, Eye, DownloadCloud, Upload, Ban,
  CheckCircle2, Clock, XCircle, HeartPulse, ShieldAlert, Scale, Coins, FileClock, Files,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { sanitizeStorageFilename } from "@/lib/storage";
import { useMeusDocumentos, type UnifiedDoc, type UnifiedTipo } from "@/hooks/portal/useMeusDocumentos";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ColaboradorDocumentosPanel } from "@/components/dp/documentos/ColaboradorDocumentosPanel";
import { DocumentPreview } from "@/components/dp/DocumentPreview";
import { DpContentCard, DpEmptyState, DpFilterCard, DpPage, DpPageHeader } from "@/components/dp/DpPage";
import type { Database } from "@/integrations/supabase/types";

type Tipo = Database["public"]["Enums"]["dp_documento_tipo"];

const TIPO_ICON: Record<UnifiedTipo, any> = {
  contracheque: FileText,
  adiantamento: Coins,
  ponto: FileClock,
  atestado: HeartPulse,
  disciplinar: ShieldAlert,
  act_cct: Scale,
  contrato: FileText,
  ferias: FileText,
  outros: Files,
};

const MESES = ["Todos", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

// Tabs types (ordem padrão do portal)
const ALL_TABS: { key: "all" | UnifiedTipo; label: string; requiresPonto?: boolean; hasEnvio?: boolean }[] = [
  { key: "all", label: "Todos" },
  { key: "contracheque", label: "Contracheques" },
  { key: "adiantamento", label: "Adiantamentos" },
  { key: "ponto", label: "Folha de Ponto", requiresPonto: true },
  { key: "atestado", label: "Atestados", hasEnvio: true },
  { key: "disciplinar", label: "Disciplinar" },
  { key: "act_cct", label: "ACT/CCT" },
  { key: "contrato", label: "Contratos" },
  { key: "outros", label: "Outros", hasEnvio: true },
];

const BUCKET = "dp-documentos";

// Tipos que o colaborador pode enviar (subset — o resto é gerado pelo DP).
const TIPOS_SUBMETIVEIS: { value: Tipo; label: string }[] = [
  { value: "atestado", label: "Atestado" },
  { value: "outros", label: "Outros" },
];

export default function DpMeuDocumentos() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { colaborador, possuiPonto, documentos, isLoading } = useMeusDocumentos();

  const [params, setParams] = useSearchParams();
  const initialTab = params.get("tipo") ?? "all";
  const [tab, setTab] = useState<string>(initialTab);
  const [origem, setOrigem] = useState<"dp" | "meu_envio">("dp");
  const [filtroMes, setFiltroMes] = useState("todos");
  const [filtroAno, setFiltroAno] = useState("todos");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [search, setSearch] = useState("");

  const [preview, setPreview] = useState<UnifiedDoc | null>(null);
  const [openSubmit, setOpenSubmit] = useState(false);
  const [form, setForm] = useState<{ tipo: Tipo; titulo: string; descricao: string; referencia_data: string }>({
    tipo: "atestado", titulo: "", descricao: "", referencia_data: "",
  });
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const visibleTabs = useMemo(
    () => ALL_TABS.filter((t) => !t.requiresPonto || possuiPonto),
    [possuiPonto]
  );

  const currentTab = useMemo(
    () => visibleTabs.find((t) => t.key === tab) ?? visibleTabs[0],
    [visibleTabs, tab]
  );

  const changeTab = (v: string) => {
    setTab(v);
    setOrigem("dp");
    const next = new URLSearchParams(params);
    if (v === "all") next.delete("tipo");
    else next.set("tipo", v);
    setParams(next, { replace: true });
  };

  const anos = useMemo(() => {
    const s = new Set<string>();
    for (const d of documentos) if (d.competencia_sort) s.add(d.competencia_sort.slice(0, 4));
    return Array.from(s).sort((a, b) => (a < b ? 1 : -1));
  }, [documentos]);

  const filtered = useMemo(() => {
    return documentos.filter((d) => {
      // filtro por tipo
      if (currentTab.key !== "all" && d.tipo_key !== currentTab.key) return false;
      // sub-tab origem (só quando tipo tem envio)
      if (currentTab.hasEnvio) {
        if (origem === "dp" && d.origem !== "dp") return false;
        if (origem === "meu_envio" && d.origem !== "meu_envio") return false;
      }
      if (filtroMes !== "todos" && d.competencia_sort.slice(5, 7) !== filtroMes) return false;
      if (filtroAno !== "todos" && d.competencia_sort.slice(0, 4) !== filtroAno) return false;
      if (filtroStatus !== "todos" && d.status_key !== filtroStatus) return false;
      if (search) {
        const t = search.toLowerCase();
        if (!d.titulo.toLowerCase().includes(t) && !d.tipo_label.toLowerCase().includes(t))
          return false;
      }
      return true;
    });
  }, [documentos, currentTab, origem, filtroMes, filtroAno, filtroStatus, search]);

  const statusOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of filtered) m.set(d.status_key, d.status_label);
    return Array.from(m.entries());
  }, [filtered]);

  const download = async (d: UnifiedDoc) => {
    if (!d.file_path) return toast.warning("Sem arquivo anexado.");
    const { data, error } = await supabase.storage.from(d.bucket).createSignedUrl(d.file_path, 60);
    if (error || !data) return toast.error("Erro ao gerar link");
    window.open(data.signedUrl, "_blank");
  };

  const downloadAll = async () => {
    const withFile = filtered.filter((d) => d.file_path);
    if (withFile.length === 0) return;
    toast.info(`Abrindo ${withFile.length} download(s)…`);
    for (const d of withFile) {
      const { data } = await supabase.storage.from(d.bucket).createSignedUrl(d.file_path!, 120);
      if (data?.signedUrl) window.open(data.signedUrl, "_blank");
      await new Promise((r) => setTimeout(r, 250));
    }
  };

  const submit = async () => {
    const files = fileRef.current?.files;
    if (!colaborador) return toast.error("Colaborador não encontrado");
    if (!files || files.length === 0) return toast.error("Selecione o arquivo");
    if (!form.titulo.trim()) return toast.error("Título obrigatório");
    setUploading(true);
    try {
      const file = files[0];
      const path = `${colaborador.company_id}/${colaborador.id}/${Date.now()}-${sanitizeStorageFilename(file.name)}`;
      const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
      if (up.error) throw up.error;
      const { error } = await supabase.from("dp_documentos").insert({
        company_id: colaborador.company_id,
        colaborador_id: colaborador.id,
        tipo: form.tipo,
        titulo: form.titulo.trim(),
        descricao: form.descricao.trim() || null,
        file_path: path,
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type,
        referencia_data: form.referencia_data || null,
        uploaded_by: user?.id,
        submetido_por_colaborador: true,
        aprovacao_status: "pendente",
      });
      if (error) throw error;
      toast.success("Documento enviado para aprovação");
      qc.invalidateQueries({ queryKey: ["dp_meus_documentos_unified"] });
      setOpenSubmit(false);
      setForm({ tipo: "atestado", titulo: "", descricao: "", referencia_data: "" });
      if (fileRef.current) fileRef.current.value = "";
    } catch (e: any) {
      toast.error("Erro ao enviar", { description: e.message ?? String(e) });
    } finally {
      setUploading(false);
    }
  };

  const cancelar = useMutation({
    mutationFn: async (d: UnifiedDoc) => {
      if (d.meta?.source === "solicitacao") {
        const { error } = await supabase.from("dp_solicitacoes").update({ status: "cancelada" }).eq("id", d.meta.originalId);
        if (error) throw error;
      } else {
        if (d.file_path) await supabase.storage.from(d.bucket).remove([d.file_path]);
        const { error } = await supabase.from("dp_documentos").delete().eq("id", d.meta?.originalId);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Envio cancelado");
      qc.invalidateQueries({ queryKey: ["dp_meus_documentos_unified"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao cancelar"),
  });

  return (
    <DpPage>
      <Helmet><title>Meus documentos — Portal</title></Helmet>
      <DpPageHeader
        icon={FileText}
        title="Meus documentos"
        description="Todos os seus documentos em um único lugar."
        actions={
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={downloadAll} disabled={filtered.filter((d) => d.file_path).length === 0}>
              <DownloadCloud className="h-4 w-4 mr-1" /> Baixar todos ({filtered.filter((d) => d.file_path).length})
            </Button>
            <Dialog open={openSubmit} onOpenChange={setOpenSubmit}>
              <DialogTrigger asChild>
                <Button size="sm"><Upload className="h-4 w-4 mr-1" /> Enviar documento</Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader><DialogTitle>Enviar documento para aprovação</DialogTitle></DialogHeader>
                <div className="grid gap-3 py-2">
                  <div className="grid gap-1.5">
                    <Label>Título *</Label>
                    <Input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} placeholder="Ex.: Atestado médico 16/07/2026" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-1.5">
                      <Label>Tipo</Label>
                      <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v as Tipo })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {TIPOS_SUBMETIVEIS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-1.5">
                      <Label>Data referência</Label>
                      <Input type="date" value={form.referencia_data} onChange={(e) => setForm({ ...form, referencia_data: e.target.value })} />
                    </div>
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Observações</Label>
                    <Textarea rows={2} value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Arquivo *</Label>
                    <Input ref={fileRef} type="file" accept=".pdf,image/*" />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Seu envio ficará em análise até que o DP aprove ou recuse.
                  </p>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpenSubmit(false)}>Cancelar</Button>
                  <Button onClick={submit} disabled={uploading}>{uploading ? "Enviando…" : "Enviar"}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      {/* Tabs por tipo */}
      <ColaboradorDocumentosPanel colaboradorId={colaborador?.id ?? null} somenteEnvio ocultarConfig />

      <Tabs value={tab} onValueChange={changeTab}>
        <DpFilterCard>
          <div className="-mx-1 overflow-x-auto">
            <TabsList className="flex-wrap md:flex-nowrap h-auto w-max md:w-auto">
              {visibleTabs.map((t) => (
                <TabsTrigger key={t.key} value={t.key} className="whitespace-nowrap">{t.label}</TabsTrigger>
              ))}
            </TabsList>
          </div>
        </DpFilterCard>
      </Tabs>

      {/* Sub-tabs origem (quando tipo tem envio) */}
      {currentTab.hasEnvio && (
        <Tabs value={origem} onValueChange={(v) => setOrigem(v as any)} className="mt-2">
          <TabsList>
            <TabsTrigger value="dp">Recebidos do DP</TabsTrigger>
            <TabsTrigger value="meu_envio">Meus envios</TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      {/* Filtros */}
      <DpFilterCard>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs">Buscar</Label>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Título ou tipo…" />
          </div>
          <div>
            <Label className="text-xs">Mês</Label>
            <Select value={filtroMes} onValueChange={setFiltroMes}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {MESES.slice(1).map((m, i) => (
                  <SelectItem key={m} value={String(i + 1).padStart(2, "0")}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Ano</Label>
            <Select value={filtroAno} onValueChange={setFiltroAno}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {anos.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {statusOptions.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </DpFilterCard>

      {/* Lista */}
      {isLoading ? (
        <DpContentCard contentClassName="py-10 text-center text-sm text-muted-foreground">
          Carregando…
        </DpContentCard>
      ) : filtered.length === 0 ? (
        <DpContentCard>
          <DpEmptyState icon={FileText}>Nenhum documento nesta categoria.</DpEmptyState>
        </DpContentCard>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 mt-2">
          {filtered.map((d) => {
            const Icon = TIPO_ICON[d.tipo_key] ?? FileText;
            return (
              <Card key={d.id} className="dp-content-card">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <Icon className="size-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium truncate">{d.titulo}</p>
                        <StatusBadge d={d} />
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        <span className="capitalize">{d.tipo_label}</span> · Competência {d.competencia_label}
                      </p>
                      {d.motivo_recusao && (
                        <p className="text-xs text-destructive mt-1">Recusado: {d.motivo_recusao}</p>
                      )}
                      {d.observacao && !d.motivo_recusao && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{d.observacao}</p>
                      )}
                      <div className="flex gap-2 mt-3 flex-wrap">
                        <Button size="sm" variant="outline" onClick={() => setPreview(d)} disabled={!d.file_path} className="min-h-9 flex-1 sm:flex-none">
                          <Eye className="h-4 w-4 mr-1" /> Visualizar
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => download(d)} disabled={!d.file_path} className="min-h-9 flex-1 sm:flex-none">
                          <Download className="h-4 w-4 mr-1" /> Baixar
                        </Button>
                        {d.origem === "meu_envio" && d.status_key === "pendente" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => cancelar.mutate(d)}
                            disabled={cancelar.isPending}
                            className="text-destructive min-h-9 flex-1 sm:flex-none"
                          >
                            <Ban className="h-4 w-4 mr-1" /> Cancelar
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <DocumentPreview
        open={!!preview}
        onOpenChange={(v) => { if (!v) setPreview(null); }}
        title={preview?.titulo}
        bucket={preview?.bucket}
        path={preview?.file_path ?? undefined}
        mime={preview?.mime_type ?? undefined}
      />
    </DpPage>
  );
}

export function StatusBadge(props: { d?: UnifiedDoc; status?: string }) {
  const k = (props.d?.status_key ?? props.status ?? "").toLowerCase();
  const label = props.d?.status_label
    ?? (k === "aprovado" || k === "aprovada" ? "Aprovado"
      : k === "recusado" || k === "recusada" ? "Recusado"
      : k === "pendente" ? "Pendente"
      : k === "disponivel" ? "Disponível"
      : k || "—");
  if (k === "aprovado" || k === "aprovada" || k === "disponivel")
    return <Badge className="bg-green-500/15 text-green-700 border border-green-300"><CheckCircle2 className="h-3 w-3 mr-1" />{label}</Badge>;
  if (k === "recusado" || k === "recusada")
    return <Badge className="bg-red-500/15 text-red-700 border border-red-300"><XCircle className="h-3 w-3 mr-1" />{label}</Badge>;
  if (k === "pendente")
    return <Badge className="bg-amber-500/15 text-amber-700 border border-amber-300"><Clock className="h-3 w-3 mr-1" />{label}</Badge>;
  return <Badge variant="outline">{label}</Badge>;
}
