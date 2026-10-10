import { useMemo, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { NotebookPen, Plus, Paperclip, Send, Sparkles, Trash2, Users, Search, CheckCircle2, Clock, Eye, X, FileText } from "lucide-react";
import { abrirDocumento } from "@/lib/documentoArquivo";
import { DpPage, DpPageHeader } from "@/components/dp/DpPage";
import { AtaEditor } from "@/components/dp/atas/AtaEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useCompanyUnidades } from "@/hooks/useCompanyUnidades";
import { useDpColaboradores } from "@/hooks/useDpColaboradores";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AtaAudioTranscricao } from "@/components/dp/atas/AtaAudioTranscricao";
import { AtaImportarDialog } from "@/components/dp/atas/AtaImportarDialog";
import { MODALIDADES, MODELOS_ATA, ESTRUTURA_PADRAO_ATA, enviarAta, enviarLinkAvulso, htmlTemTexto, type AtaAnexo, type AtaCondutor, type AtaModalidade } from "@/lib/dp/atas";
import { Switch } from "@/components/ui/switch";
import { abrirArquivoDp } from "@/lib/dp/abrirDocumento";

type Ata = {
  id: string; company_id: string; unidade_id: string | null; titulo: string; data_reuniao: string; local: string | null;
  conteudo_html: string; anexos: AtaAnexo[]; condutores?: AtaCondutor[]; publicar_mural?: boolean; origem?: "sistema" | "importada" | "importada_assinada"; status: "rascunho" | "enviada"; enviada_em: string | null; created_at: string;
};
type Part = { key: string; colaborador_id: string | null; modalidade: AtaModalidade; documento_id?: string | null; nome?: string; avulso_cpf?: string | null; avulso_whatsapp?: string | null; id?: string; assinado_em?: string | null };
const soDigitos = (v: string) => v.replace(/\D/g, "");

const hoje = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const fmt = (d: string) => d.split("-").reverse().join("/");
const MIMES = ["application/pdf", "image/png", "image/jpeg"];

export default function DpAtas() {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();
  const [editando, setEditando] = useState<Ata | "nova" | null>(null);
  const [busca, setBusca] = useState("");
  const [importar, setImportar] = useState(false);

  const atas = useQuery({
    queryKey: ["dp_atas", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase.from("dp_atas" as never).select("*").eq("company_id", selectedCompanyId!).order("data_reuniao", { ascending: false });
      if (error) throw error;
      const lista = (data ?? []) as unknown as Ata[];
      const ids = lista.map((a) => a.id);
      const { data: parts } = ids.length
        ? await supabase.from("dp_ata_participantes" as never).select("ata_id, modalidade, documento_id").in("ata_id", ids)
        : { data: [] };
      const docIds = ((parts ?? []) as any[]).map((p) => p.documento_id).filter(Boolean);
      const { data: aceites } = docIds.length
        ? await supabase.from("dp_documento_aceites").select("documento_id").in("documento_id", docIds)
        : { data: [] };
      const assinados = new Set(((aceites ?? []) as any[]).map((a) => a.documento_id));
      return lista.map((a) => {
        const ps = ((parts ?? []) as any[]).filter((p) => p.ata_id === a.id);
        const exige = ps.filter((p) => p.modalidade !== "consulta");
        return { ...a, total: ps.length, exige: exige.length, assinados: exige.filter((p) => assinados.has(p.documento_id)).length };
      });
    },
  });

  const filtradas = (atas.data ?? []).filter((a) => a.titulo.toLowerCase().includes(busca.toLowerCase()));

  return (
    <DpPage>
      <Helmet><title>Atas de Reunião — Pessoas 360°</title></Helmet>
      <DpPageHeader
        icon={NotebookPen}
        title="Atas de Reunião"
        description="Registre as reuniões da equipe e envie a ata para assinatura ou consulta no portal."
        actions={<div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setImportar(true)}><Paperclip className="mr-1 h-4 w-4" />Importar Ata</Button><Button onClick={() => setEditando("nova")}><Plus className="mr-1 h-4 w-4" />Nova Ata</Button></div>}
      />
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input className="pl-8" placeholder="Buscar ata…" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>
      {atas.isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p> : filtradas.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          Nenhuma ata registrada ainda. Clique em <b>Nova Ata</b> e escolha um modelo rápido para começar.
        </CardContent></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {filtradas.map((a) => (
            <Card key={a.id} className="cursor-pointer transition hover:border-primary/50" onClick={() => setEditando(a)}>
              <CardContent className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{a.titulo}</p>
                    <p className="text-xs text-muted-foreground">{fmt(a.data_reuniao)}{a.local ? ` • ${a.local}` : ""}</p>
                  </div>
                  {a.status === "rascunho"
                    ? <Badge variant="outline">Rascunho</Badge>
                    : a.exige > 0 && a.assinados >= a.exige
                      ? <Badge className="bg-primary/15 text-primary hover:bg-primary/15"><CheckCircle2 className="mr-1 h-3 w-3" />Concluída</Badge>
                      : <Badge variant="secondary"><Clock className="mr-1 h-3 w-3" />Aguardando Assinaturas</Badge>}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><Users className="h-3.5 w-3.5" />{a.total} participante(s){a.anexos?.length ? ` • ${a.anexos.length} anexo(s)` : ""}</div>
                {a.status === "enviada" && a.exige > 0 && (
                  <div className="space-y-1">
                    <Progress value={(a.assinados / a.exige) * 100} className="h-1.5" />
                    <p className="text-xs text-muted-foreground">{a.assinados} de {a.exige} assinaturas</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {importar && selectedCompanyId && (
        <AtaImportarDialog companyId={selectedCompanyId} onClose={() => setImportar(false)}
          onCriada={(ata) => { setImportar(false); qc.invalidateQueries({ queryKey: ["dp_atas"] }); setEditando(ata as Ata); }} />
      )}
      {editando && selectedCompanyId && (
        <AtaDialog
          companyId={selectedCompanyId}
          ata={editando === "nova" ? null : editando}
          onClose={() => { setEditando(null); qc.invalidateQueries({ queryKey: ["dp_atas"] }); }}
        />
      )}
    </DpPage>
  );
}

function AtaDialog({ companyId, ata, onClose }: { companyId: string; ata: Ata | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [id, setId] = useState<string | null>(ata?.id ?? null);
  const enviada = ata?.status === "enviada";
  const [titulo, setTitulo] = useState(ata?.titulo ?? "");
  const [data, setData] = useState(ata?.data_reuniao ?? hoje());
  const [local, setLocal] = useState(ata?.local ?? "");
  const [unidadeId, setUnidadeId] = useState<string>(ata?.unidade_id ?? "todas");
  const [html, setHtml] = useState(ata?.conteudo_html ?? ESTRUTURA_PADRAO_ATA);
  const [condutores, setCondutores] = useState<AtaCondutor[]>(ata?.condutores ?? []);
  const [publicarMural, setPublicarMural] = useState<boolean>(ata?.publicar_mural ?? false);
  const [condSel, setCondSel] = useState<string>("");
  const [condNome, setCondNome] = useState(""); const [condCargo, setCondCargo] = useState("");
  const [avulsoAberto, setAvulsoAberto] = useState(false);
  const [anexos, setAnexos] = useState<AtaAnexo[]>(ata?.anexos ?? []);
  const [parts, setParts] = useState<Part[]>([]);
  const [carregouParts, setCarregouParts] = useState(!ata);
  const [salvando, setSalvando] = useState(false);
  const [progresso, setProgresso] = useState<string | null>(null);
  const [revisao, setRevisao] = useState<{ html: string; alteracoes: string[] } | null>(null);
  const [revisando, setRevisando] = useState(false);
  const [pickerAberto, setPickerAberto] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const unidades = useCompanyUnidades(companyId);
  const colabs = useDpColaboradores();

  useQuery({
    queryKey: ["dp_ata_parts", ata?.id],
    enabled: !!ata?.id,
    queryFn: async () => {
      const { data } = await supabase.from("dp_ata_participantes" as never).select("id, colaborador_id, modalidade, documento_id, avulso_nome, avulso_cpf, avulso_whatsapp, assinado_em, dp_colaboradores(nome)").eq("ata_id", ata!.id);
      const lista = ((data ?? []) as any[]).map((p) => ({ key: p.id, colaborador_id: p.colaborador_id, modalidade: p.modalidade, documento_id: p.documento_id, nome: p.dp_colaboradores?.nome ?? p.avulso_nome, avulso_cpf: p.avulso_cpf, avulso_whatsapp: p.avulso_whatsapp, id: p.id, assinado_em: p.assinado_em }));
      setParts(lista); setCarregouParts(true);
      return lista;
    },
  });

  const docIds = parts.map((p) => p.documento_id).filter(Boolean) as string[];
  const aceites = useQuery({
    queryKey: ["dp_ata_aceites", docIds.join(",")],
    enabled: enviada && docIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("dp_documento_aceites").select("documento_id, aceito_em").in("documento_id", docIds);
      return new Map(((data ?? []) as any[]).map((a) => [a.documento_id, a.aceito_em as string]));
    },
  });

  const nomeDe = (p: Part) => p.nome ?? (colabs.data ?? []).find((c: any) => c.id === p.colaborador_id)?.nome ?? "Participante";

  async function salvar(silencioso = false): Promise<string | null> {
    if (titulo.trim().length < 3) { toast.error("Informe o título da reunião (mínimo 3 caracteres)."); return null; }
    if (!data) { toast.error("Informe a data da reunião."); return null; }
    setSalvando(true);
    try {
      const payload = { company_id: companyId, titulo: titulo.trim(), data_reuniao: data, local: local.trim() || null, unidade_id: unidadeId === "todas" ? null : unidadeId, conteudo_html: html, anexos, condutores, publicar_mural: publicarMural };
      let atual = id;
      if (atual) {
        const { error } = await supabase.from("dp_atas" as never).update(payload as never).eq("id", atual);
        if (error) throw error;
      } else {
        const { data: ins, error } = await supabase.from("dp_atas" as never).insert(payload as never).select("id").single();
        if (error) throw error;
        atual = (ins as any).id; setId(atual);
      }
      // sincroniza participantes
      await supabase.from("dp_ata_participantes" as never).delete().eq("ata_id", atual!);
      if (parts.length) {
        const { error } = await supabase.from("dp_ata_participantes" as never).insert(parts.map((p) => ({ ata_id: atual, company_id: companyId, colaborador_id: p.colaborador_id, modalidade: p.modalidade, avulso_nome: p.colaborador_id ? null : p.nome, avulso_cpf: p.colaborador_id ? null : p.avulso_cpf, avulso_whatsapp: p.colaborador_id ? null : p.avulso_whatsapp })) as never);
        if (error) throw error;
      }
      if (!silencioso) toast.success("Rascunho salvo.");
      qc.invalidateQueries({ queryKey: ["dp_atas"] });
      return atual;
    } catch (e: any) {
      toast.error("Não foi possível salvar a ata.", { description: /permission|policy/i.test(e?.message ?? "") ? "Seu perfil não tem permissão para editar documentos. Fale com o administrador." : "Tente novamente em instantes." });
      return null;
    } finally { setSalvando(false); }
  }

  async function anexar(files: FileList | null) {
    if (!files?.length) return;
    for (const f of Array.from(files)) {
      if (!MIMES.includes(f.type)) { toast.error(`"${f.name}" não é aceito.`, { description: "Anexe arquivos PDF, PNG ou JPG — eles são incorporados à ata assinada." }); continue; }
      if (f.size > 15 * 1024 * 1024) { toast.error(`"${f.name}" passa de 15 MB.`, { description: "Reduza o arquivo e tente de novo." }); continue; }
      const path = `${companyId}/atas/${crypto.randomUUID()}-${f.name.replace(/[^\w.-]+/g, "_")}`;
      const up = await supabase.storage.from("dp-documentos").upload(path, f, { contentType: f.type });
      if (up.error) { toast.error(`Não foi possível anexar "${f.name}".`, { description: "Tente novamente em instantes." }); continue; }
      setAnexos((a) => [...a, { path, name: f.name, mime: f.type, size: f.size }]);
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  async function revisar() {
    if (!htmlTemTexto(html)) { toast.error("Escreva o texto da ata antes de pedir a revisão."); return; }
    setRevisando(true);
    try {
      const { data: r, error } = await supabase.functions.invoke("dp-ata-revisar", { body: { html } });
      if (error) {
        let msg = "Não foi possível revisar o texto agora. Tente novamente em instantes.";
        try { const b = await (error as any).context?.json(); if (b?.error) msg = b.error; } catch { /* */ }
        toast.error(msg); return;
      }
      setRevisao(r as any);
    } finally { setRevisando(false); }
  }

  async function enviar() {
    if (!htmlTemTexto(html) || html === ESTRUTURA_PADRAO_ATA) { toast.error("Escreva o conteúdo da ata antes de enviar.", { description: "Preencha a pauta, as discussões e os combinados." }); return; }
    if (!parts.length) { toast.error("Inclua ao menos um participante.", { description: "Use o botão Adicionar Participantes." }); return; }
    const atual = await salvar(true);
    if (!atual) return;
    setProgresso("Gerando a ata…");
    try {
      const r = await enviarAta(atual, (f, t) => setProgresso(`Enviando ${f} de ${t}…`));
      toast.success(`Ata enviada para ${r.feitos} colaborador(es).`, { description: "Quem precisa assinar recebe a pendência no portal; quem não tem cadastro recebe o link no WhatsApp." });
      if (r.linksFalhos.length) toast.warning(`Link não enviado para: ${r.linksFalhos.join(", ")}.`, { description: "Abra a ata e use Reenviar Link ou Copiar Link ao lado do nome." });
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível enviar a ata.");
    } finally { setProgresso(null); }
  }

  async function excluir() {
    if (!id) return onClose();
    const { error } = await supabase.from("dp_atas" as never).delete().eq("id", id);
    if (error) return toast.error("Não foi possível excluir o rascunho.");
    toast.success("Rascunho excluído."); onClose();
  }

  const contagem = useMemo(() => ({
    presente: parts.filter((p) => p.modalidade === "presente").length,
    ciencia: parts.filter((p) => p.modalidade === "ciencia").length,
    consulta: parts.filter((p) => p.modalidade === "consulta").length,
  }), [parts]);

  return (
    <Dialog open onOpenChange={(v) => { if (!v && !progresso) onClose(); }}>
      <DialogContent className="flex max-h-[95vh] w-[calc(100vw-1rem)] max-w-4xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b p-4">
          <DialogTitle className="flex items-center gap-2"><NotebookPen className="h-5 w-5 text-primary" />{ata ? (enviada ? "Ata Enviada" : "Editar Ata") : "Nova Ata de Reunião"}</DialogTitle>
          <DialogDescription>{enviada ? "Ata enviada não pode ser alterada. Acompanhe as assinaturas abaixo." : "Escreva a ata, inclua anexos e escolha como cada colaborador recebe."}</DialogDescription>
        </DialogHeader>
        <div className="min-w-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden p-3 sm:p-4">
          {!ata && (html === ESTRUTURA_PADRAO_ATA || !htmlTemTexto(html)) && (
            <div className="space-y-2">
              <Label>Modelos Rápidos</Label>
              <div className="flex flex-wrap gap-2">
                {MODELOS_ATA.map((m) => (
                  <Button key={m.id} type="button" size="sm" variant="outline" onClick={() => { setHtml(m.html); if (!titulo) setTitulo(m.titulo); }}>{m.nome}</Button>
                ))}
              </div>
            </div>
          )}
          {ata?.origem === "importada_assinada" && <p className="rounded-md border bg-muted/40 p-3 text-xs">Ata importada já assinada no papel: os participantes recebem a via no portal só para consulta, sem nova assinatura.</p>}
          {ata?.origem === "importada" && <p className="rounded-md border bg-muted/40 p-3 text-xs">Ata importada: o PDF anexado é enviado como está para os participantes assinarem.</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2"><Label>Título da Reunião *</Label><Input value={titulo} disabled={enviada} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Alinhamento da Equipe de Salão" /></div>
            <div className="space-y-1"><Label>Data *</Label><Input type="date" value={data} disabled={enviada} onChange={(e) => setData(e.target.value)} /></div>
            <div className="space-y-1"><Label>Local</Label><Input value={local} disabled={enviada} onChange={(e) => setLocal(e.target.value)} placeholder="Ex.: Salão principal" /></div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Unidade</Label>
              <Select value={unidadeId} onValueChange={setUnidadeId} disabled={enviada}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas as Unidades</SelectItem>
                  {(unidades.data ?? []).map((u: any) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Conduzida Por</Label>
            {condutores.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {condutores.map((c, i) => (
                  <li key={i}><Badge variant="secondary" className="gap-1 py-1">{c.nome}{c.cargo ? ` — ${c.cargo}` : ""}
                    {!enviada && <button type="button" aria-label="Remover condutor" onClick={() => setCondutores((x) => x.filter((_, j) => j !== i))}><X className="h-3 w-3" /></button>}
                  </Badge></li>
                ))}
              </ul>
            )}
            {!enviada && (
              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <Select value={condSel} onValueChange={(v) => {
                  if (v === "__externo") { setCondSel(v); return; }
                  const c = (colabs.data ?? []).find((x: any) => x.id === v) as any;
                  if (c && !condutores.some((k) => k.colaborador_id === c.id)) setCondutores((x) => [...x, { colaborador_id: c.id, nome: c.nome, cargo: c.cargo_nome ?? null }]);
                  setCondSel("");
                }}>
                  <SelectTrigger><SelectValue placeholder="Escolher quem conduziu…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__externo">Pessoa sem cadastro (digitar nome e cargo)</SelectItem>
                    {((colabs.data ?? []) as any[]).filter((c) => !c.data_desligamento).map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}{c.cargo_nome ? ` — ${c.cargo_nome}` : ""}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {condSel === "__externo" && !enviada && (
              <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <Input placeholder="Nome completo" value={condNome} onChange={(e) => setCondNome(e.target.value)} />
                <Input placeholder="Cargo ou função (ex.: Consultor)" value={condCargo} onChange={(e) => setCondCargo(e.target.value)} />
                <Button type="button" variant="outline" onClick={() => {
                  if (condNome.trim().length < 3) { toast.error("Informe o nome de quem conduziu (mínimo 3 letras)."); return; }
                  setCondutores((x) => [...x, { colaborador_id: null, nome: condNome.trim().toUpperCase(), cargo: condCargo.trim() || null }]);
                  setCondNome(""); setCondCargo(""); setCondSel("");
                }}>Incluir</Button>
              </div>
            )}
          </div>

          <div className="space-y-1">
            <Label>Conteúdo da Ata *</Label>
            <AtaEditor value={html} onChange={setHtml} disabled={enviada}
              extra={<div className="flex flex-wrap gap-1"><AtaAudioTranscricao onTexto={(h) => { setHtml(h); toast.success("Transcrição colocada no editor.", { description: "Revise antes de enviar — a IA pode errar nomes e números." }); }} /><Button type="button" size="sm" variant="secondary" className="h-8" disabled={revisando} onClick={revisar}><Sparkles className="mr-1 h-4 w-4" />{revisando ? "Revisando…" : "Revisar Texto"}</Button></div>} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Anexos</Label>
              {!enviada && <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()}><Paperclip className="mr-1 h-4 w-4" />Anexar</Button>}
              <input ref={fileRef} type="file" multiple accept=".pdf,.png,.jpg,.jpeg" className="hidden" onChange={(e) => anexar(e.target.files)} />
            </div>
            {anexos.length === 0 ? <p className="text-xs text-muted-foreground">PDF ou imagens (PNG/JPG). Os anexos entram no documento enviado para assinatura.</p> : (
              <ul className="space-y-1">
                {anexos.map((a) => (
                  <li key={a.path} className="flex items-center justify-between gap-2 rounded border px-2 py-1 text-sm">
                    <button type="button" className="truncate text-left hover:underline" onClick={() => abrirArquivoDp({ bucket: "dp-documentos", path: a.path, mimeType: a.mime, fileName: a.name })}>{a.name}</button>
                    {!enviada && <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setAnexos((x) => x.filter((y) => y.path !== a.path))}><X className="h-4 w-4" /></Button>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label>Participantes e Destinatários ({parts.length})</Label>
              {!enviada && <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => setPickerAberto(true)}><Users className="mr-1 h-4 w-4" />Adicionar Participantes</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setAvulsoAberto(true)}><Plus className="mr-1 h-4 w-4" />Sem Cadastro</Button>
              </div>}
            </div>
            {parts.length > 0 && <p className="text-xs text-muted-foreground">{contagem.presente} presente(s) • {contagem.ciencia} ciência • {contagem.consulta} apenas consulta</p>}
            {!carregouParts ? <p className="text-xs text-muted-foreground">Carregando…</p> : (
              <ul className="divide-y rounded border">
                {parts.map((p) => {
                  const assinado = p.documento_id ? aceites.data?.get(p.documento_id) : null;
                  const avulso = !p.colaborador_id;
                  return (
                    <li key={p.key} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                      <span className="min-w-0 flex-1 truncate font-medium">{nomeDe(p)}{avulso && <span className="ml-1 text-xs font-normal text-muted-foreground">· sem cadastro{p.avulso_whatsapp ? ` · ${p.avulso_whatsapp}` : ""}</span>}</span>
                      <div className="flex w-full items-center gap-2 sm:w-auto">
                        {enviada ? (
                          <>
                            <Badge variant="outline">{MODALIDADES[p.modalidade].label}</Badge>
                            {avulso && p.modalidade !== "consulta" ? (
                              p.assinado_em ? <Badge className="bg-primary/15 text-primary hover:bg-primary/15"><CheckCircle2 className="mr-1 h-3 w-3" />Assinado pelo Link</Badge>
                              : p.avulso_cpf && p.avulso_whatsapp && ata?.origem !== "importada_assinada" ? <>
                                <Badge variant="secondary"><Clock className="mr-1 h-3 w-3" />Link Pendente</Badge>
                                <Button size="sm" variant="ghost" className="h-8" onClick={async () => {
                                  try {
                                    const r = await enviarLinkAvulso(p.id!);
                                    if (r.enviado) toast.success("Link reenviado pelo WhatsApp.");
                                    else { await navigator.clipboard.writeText(r.link ?? "").catch(() => {}); toast.warning("Não foi possível enviar pelo WhatsApp. O link foi copiado.", { description: r.erro ?? "Cole o link na conversa com a pessoa." }); }
                                  } catch (e: any) { toast.error(e.message); }
                                }}>Reenviar Link</Button>
                              </> : <Badge variant="secondary">Assina no Papel</Badge>)
                              : p.modalidade === "consulta" ? <Badge variant="secondary"><Eye className="mr-1 h-3 w-3" />Disponível</Badge>
                              : assinado ? <Badge className="bg-primary/15 text-primary hover:bg-primary/15"><CheckCircle2 className="mr-1 h-3 w-3" />Assinado {new Date(assinado).toLocaleDateString("pt-BR")}</Badge>
                              : <Badge variant="secondary"><Clock className="mr-1 h-3 w-3" />Pendente</Badge>}
                            {p.documento_id && (
                              <Button size="icon" variant="ghost" className="h-8 w-8" title="Ver PDF da Ata" aria-label="Ver PDF da Ata"
                                onClick={async () => {
                                  const ok = await abrirDocumento(p.documento_id!).catch(() => false);
                                  if (!ok) toast.error("Não foi possível abrir a ata.", { description: "Tente novamente em instantes ou verifique sua permissão em Documentos." });
                                }}>
                                <FileText className="h-4 w-4" />
                              </Button>
                            )}
                          </>
                        ) : (
                          <>
                            <Select value={p.modalidade} onValueChange={(v) => setParts((x) => x.map((y) => y.key === p.key ? { ...y, modalidade: v as AtaModalidade } : y))}>
                              <SelectTrigger className="h-8 min-w-0 flex-1 sm:w-[210px] sm:flex-none"><SelectValue /></SelectTrigger>
                              <SelectContent>{(Object.keys(MODALIDADES) as AtaModalidade[]).map((m) => <SelectItem key={m} value={m}>{MODALIDADES[m].label}</SelectItem>)}</SelectContent>
                            </Select>
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setParts((x) => x.filter((y) => y.key !== p.key))}><Trash2 className="h-4 w-4" /></Button>
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
                {parts.length === 0 && <li className="px-3 py-4 text-center text-xs text-muted-foreground">Nenhum participante adicionado.</li>}
              </ul>
            )}
          </div>
        </div>
        <div className="flex items-start gap-3 border-t px-4 py-3">
          <Switch id="ata-mural" checked={publicarMural} disabled={enviada} onCheckedChange={setPublicarMural} />
          <label htmlFor="ata-mural" className="text-sm"><span className="font-medium">Publicar no Mural</span>
            <span className="block text-xs text-muted-foreground">Opcional. Ao enviar, o resumo da ata vai para o Mural {unidadeId === "todas" ? "da empresa" : "da unidade"}. Deixe desligado em reuniões reservadas.</span></label>
        </div>
        <DialogFooter className="flex-col gap-2 border-t p-4 sm:flex-row sm:justify-between">
          {progresso ? <p className="text-sm text-muted-foreground">{progresso}</p> : enviada ? <span /> : (
            <Button variant="ghost" className="text-destructive" onClick={excluir}><Trash2 className="mr-1 h-4 w-4" />Excluir Rascunho</Button>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={!!progresso}>Fechar</Button>
            {!enviada && <>
              <Button variant="secondary" disabled={salvando || !!progresso} onClick={() => salvar()}>Salvar Rascunho</Button>
              <Button disabled={salvando || !!progresso} onClick={enviar}><Send className="mr-1 h-4 w-4" />Enviar aos Participantes</Button>
            </>}
          </div>
        </DialogFooter>
      </DialogContent>

      {pickerAberto && (
        <ParticipantesPicker
          colabs={(colabs.data ?? []) as any[]}
          unidadeId={unidadeId === "todas" ? null : unidadeId}
          jaIncluidos={new Set(parts.map((p) => p.colaborador_id).filter(Boolean) as string[])}
          onClose={() => setPickerAberto(false)}
          onAdd={(ids, modalidade) => {
            setParts((x) => [...x, ...ids.map((cid) => ({ key: cid, colaborador_id: cid, modalidade, nome: (colabs.data ?? []).find((c: any) => c.id === cid)?.nome }))]);
            setPickerAberto(false);
          }}
        />
      )}

      {avulsoAberto && (
        <AvulsoDialog onClose={() => setAvulsoAberto(false)} onAdd={(a) => {
          if (a.cpf && parts.some((p) => p.avulso_cpf === a.cpf)) { toast.error("Esse CPF já está na lista de participantes."); return; }
          setParts((x) => [...x, { key: crypto.randomUUID(), colaborador_id: null, nome: a.nome, avulso_cpf: a.cpf || null, avulso_whatsapp: a.whatsapp || null, modalidade: a.modalidade }]);
          setAvulsoAberto(false);
        }} />
      )}

      {revisao && (
        <Dialog open onOpenChange={(v) => !v && setRevisao(null)}>
          <DialogContent className="max-h-[90vh] w-[calc(100%-1rem)] max-w-3xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" />Revisão do Texto</DialogTitle>
              <DialogDescription>Confira as sugestões. Nada é alterado até você aplicar.</DialogDescription>
            </DialogHeader>
            {revisao.alteracoes.length > 0 && (
              <ul className="list-disc space-y-0.5 pl-5 text-sm">{revisao.alteracoes.map((a, i) => <li key={i}>{a}</li>)}</ul>
            )}
            <div className="rounded border bg-muted/30 p-3 text-sm [&_h1]:text-xl [&_h1]:font-bold [&_h2]:mt-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:font-semibold [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6" dangerouslySetInnerHTML={{ __html: sanitizar(revisao.html) }} />
            <DialogFooter>
              <Button variant="outline" onClick={() => setRevisao(null)}>Manter Original</Button>
              <Button onClick={() => { setHtml(sanitizar(revisao.html)); setRevisao(null); toast.success("Revisão aplicada. Você ainda pode editar o texto."); }}>Aplicar Revisão</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Dialog>
  );
}

/** Remove scripts/atributos perigosos do HTML vindo da revisão. */
function sanitizar(html: string) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script,style,iframe,object,embed,link,meta").forEach((n) => n.remove());
  doc.querySelectorAll("*").forEach((el) => Array.from(el.attributes).forEach((a) => { if (a.name !== "style") el.removeAttribute(a.name); }));
  return doc.body.innerHTML;
}

function AvulsoDialog({ onClose, onAdd }: { onClose: () => void; onAdd: (a: { nome: string; cpf: string; whatsapp: string; modalidade: AtaModalidade }) => void }) {
  const [nome, setNome] = useState(""); const [cpf, setCpf] = useState(""); const [wpp, setWpp] = useState("");
  const [modalidade, setModalidade] = useState<AtaModalidade>("presente");
  function confirmar() {
    if (nome.trim().length < 3) return toast.error("Informe o nome completo (mínimo 3 letras).");
    const c = soDigitos(cpf); const w = soDigitos(wpp);
    if (c && c.length !== 11) return toast.error("CPF incompleto.", { description: "Digite os 11 números ou deixe em branco." });
    if (w && (w.length < 10 || w.length > 13)) return toast.error("WhatsApp inválido.", { description: "Digite DDD + número, ex.: 62 99999-9999." });
    onAdd({ nome: nome.trim().toUpperCase(), cpf: c, whatsapp: w, modalidade });
  }
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-md">
        <DialogHeader>
          <DialogTitle>Participante Sem Cadastro</DialogTitle>
          <DialogDescription>Para consultores, terceirizados ou visitantes. Não cria cadastro de colaborador.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Nome Completo *</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1"><Label>CPF</Label><Input inputMode="numeric" value={cpf} onChange={(e) => setCpf(e.target.value)} placeholder="000.000.000-00" /></div>
            <div className="space-y-1"><Label>WhatsApp</Label><Input inputMode="tel" value={wpp} onChange={(e) => setWpp(e.target.value)} placeholder="(62) 99999-9999" /></div>
          </div>
          <Select value={modalidade} onValueChange={(v) => setModalidade(v as AtaModalidade)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{(Object.keys(MODALIDADES) as AtaModalidade[]).map((m) => <SelectItem key={m} value={m}>{MODALIDADES[m].label}</SelectItem>)}</SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Quem não tem cadastro assina no espaço reservado do PDF impresso. CPF e WhatsApp ficam guardados para o envio do link de assinatura.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={confirmar}>Incluir</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ParticipantesPicker({ colabs, unidadeId, jaIncluidos, onClose, onAdd }: {
  colabs: any[]; unidadeId: string | null; jaIncluidos: Set<string>; onClose: () => void; onAdd: (ids: string[], m: AtaModalidade) => void;
}) {
  const [busca, setBusca] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [modalidade, setModalidade] = useState<AtaModalidade>("presente");
  const [fUnidade, setFUnidade] = useState<string>(unidadeId ?? "todos");
  const [fCargo, setFCargo] = useState("todos");
  const [fSetor, setFSetor] = useState("todos");
  const [fRegime, setFRegime] = useState("todos");
  const [fSind, setFSind] = useState("todos");
  const sindicatos = useQuery({
    queryKey: ["dp_sindicatos_nomes", colabs[0]?.company_id],
    enabled: !!colabs[0]?.company_id,
    queryFn: async () => {
      const { data } = await supabase.from("dp_sindicatos").select("id, nome").eq("company_id", colabs[0].company_id);
      return new Map(((data ?? []) as any[]).map((x) => [x.id, x.nome as string]));
    },
  });
  const ativos = colabs.filter((c) => c.status !== "desligado" && !c.data_desligamento && !jaIncluidos.has(c.id));
  const opcoes = (k: string, label: string) => {
    const m = new Map<string, string>();
    ativos.forEach((c) => { const v = c[k]; if (v) m.set(String(v), String(c[label] ?? v)); });
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  };
  const unidades = opcoes("unidade_id", "unidade_nome");
  const cargos = opcoes("cargo_nome", "cargo_nome");
  const setores = opcoes("setor_nome", "setor_nome");
  const regimes = opcoes("regime", "regime");
  const sinds = [...new Set(ativos.map((c) => c.sindicato_id).filter(Boolean))].map((id) => [id, sindicatos.data?.get(id) ?? "Sindicato"] as [string, string]);
  const lista = ativos
    .filter((c) => fUnidade === "todos" || c.unidade_id === fUnidade)
    .filter((c) => fCargo === "todos" || c.cargo_nome === fCargo)
    .filter((c) => fSetor === "todos" || c.setor_nome === fSetor)
    .filter((c) => fRegime === "todos" || c.regime === fRegime)
    .filter((c) => fSind === "todos" || c.sindicato_id === fSind)
    .filter((c) => `${c.nome} ${c.nome_social ?? ""} ${c.cargo_nome ?? ""} ${c.setor_nome ?? ""}`.toLowerCase().includes(busca.toLowerCase()));
  const todos = lista.length > 0 && lista.every((c) => sel.has(c.id));
  const Filtro = ({ v, on, ph, ops }: { v: string; on: (x: string) => void; ph: string; ops: [string, string][] }) => (
    <Select value={v} onValueChange={on}>
      <SelectTrigger className="h-9 min-w-0"><SelectValue /></SelectTrigger>
      <SelectContent><SelectItem value="todos">{ph}</SelectItem>{ops.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
    </Select>
  );
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="flex max-h-[90vh] w-[calc(100vw-1rem)] max-w-lg flex-col">
        <DialogHeader>
          <DialogTitle>Adicionar Participantes</DialogTitle>
          <DialogDescription>Filtre a equipe, selecione e escolha como esse grupo recebe a ata.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Select value={modalidade} onValueChange={(v) => setModalidade(v as AtaModalidade)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{(Object.keys(MODALIDADES) as AtaModalidade[]).map((m) => <SelectItem key={m} value={m}>{MODALIDADES[m].label}</SelectItem>)}</SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{MODALIDADES[modalidade].descricao}</p>
          <div className="grid grid-cols-2 gap-2">
            <Filtro v={fUnidade} on={setFUnidade} ph="Todas as Unidades" ops={unidades} />
            <Filtro v={fCargo} on={setFCargo} ph="Todos os Cargos" ops={cargos} />
            <Filtro v={fSetor} on={setFSetor} ph="Todos os Setores" ops={setores} />
            <Filtro v={fRegime} on={setFRegime} ph="Todos os Vínculos" ops={regimes} />
            {sinds.length > 0 && <div className="col-span-2"><Filtro v={fSind} on={setFSind} ph="Todos os Sindicatos" ops={sinds} /></div>}
          </div>
          <Input placeholder="Buscar por nome…" value={busca} onChange={(e) => setBusca(e.target.value)} />
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={todos} onCheckedChange={(v) => { const n = new Set(sel); lista.forEach((c) => v ? n.add(c.id) : n.delete(c.id)); setSel(n); }} />Selecionar todos do filtro ({lista.length})</label>
        </div>
        <ul className="min-h-[120px] flex-1 divide-y overflow-y-auto rounded border">
          {lista.map((c) => (
            <li key={c.id}>
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm">
                <Checkbox checked={sel.has(c.id)} onCheckedChange={(v) => { const n = new Set(sel); v ? n.add(c.id) : n.delete(c.id); setSel(n); }} />
                <span className="min-w-0"><span className="block truncate font-medium">{c.nome}</span><span className="block truncate text-xs text-muted-foreground">{[c.cargo_nome, c.setor_nome, c.unidade_nome].filter(Boolean).join(" • ")}</span></span>
              </label>
            </li>
          ))}
          {lista.length === 0 && <li className="px-3 py-6 text-center text-xs text-muted-foreground">Nenhum colaborador encontrado com esses filtros.</li>}
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={sel.size === 0} onClick={() => onAdd([...sel], modalidade)}>Adicionar {sel.size || ""}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
