import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import QRCode from "qrcode";
import { toast } from "sonner";
import { Plus, Share2, Pause, Play, RotateCw, XCircle, Pencil, Copy, Download, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ESTADO_ROTULO, LIMITE_VAGAS_ATIVAS, TIPOS_CONTRATACAO, estadoEfetivo, urlPublicaVaga,
  type VagaEstado, type VagaStatus,
} from "@/lib/recrutamento/vagas";

interface Vaga {
  id: string; company_id: string; unidade_id: string | null; codigo: string; titulo: string;
  quantidade: number; cidade: string | null; bairro: string | null; jornada: string | null;
  escala: string | null; tipo_contratacao: string; remuneracao: string | null;
  exibir_remuneracao: boolean; beneficios: string | null; atividades: string | null;
  requisitos: string | null; status: VagaStatus; publicada_em: string | null; expira_em: string | null;
}

const VAZIA: Partial<Vaga> = { titulo: "", quantidade: 1, tipo_contratacao: "clt", exibir_remuneracao: false };
const CAMPOS_EDITAVEIS = ["titulo","quantidade","unidade_id","cidade","bairro","jornada","escala","tipo_contratacao","remuneracao","exibir_remuneracao","beneficios","atividades","requisitos"] as const;

const ESTADO_VARIANT: Record<VagaEstado, "default" | "secondary" | "destructive" | "outline"> = {
  ativa: "default", rascunho: "outline", pausada: "secondary", encerrada: "secondary", expirada: "destructive",
};

function fmt(d: string | null) { return d ? new Date(d).toLocaleDateString("pt-BR") : "—"; }

export default function RecrutamentoVagas() {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();
  const [edit, setEdit] = useState<Partial<Vaga> | null>(null);
  const [share, setShare] = useState<Vaga | null>(null);

  const acesso = useQuery({
    queryKey: ["rec-acesso", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("recrutamento_pode_gerir", { _company_id: selectedCompanyId! });
      if (error) throw error;
      return !!data;
    },
  });

  const vagas = useQuery({
    queryKey: ["rec-vagas", selectedCompanyId],
    enabled: !!selectedCompanyId && acesso.data === true,
    queryFn: async () => {
      const { data, error } = await supabase.from("recrutamento_vagas").select("*")
        .eq("company_id", selectedCompanyId!).order("created_at", { ascending: false });
      if (error) throw error;
      return data as Vaga[];
    },
  });

  const unidades = useQuery({
    queryKey: ["rec-unidades", selectedCompanyId],
    enabled: !!selectedCompanyId && acesso.data === true,
    queryFn: async () => {
      const { data, error } = await supabase.from("dp_unidades").select("id,nome,cidade,bairro")
        .eq("company_id", selectedCompanyId!).eq("ativo", true).order("nome");
      if (error) throw error;
      return data;
    },
  });

  const ativas = useMemo(
    () => (vagas.data ?? []).filter((v) => estadoEfetivo(v.status, v.expira_em) === "ativa").length,
    [vagas.data],
  );

  const salvar = useMutation({
    mutationFn: async (v: Partial<Vaga>) => {
      const payload: Record<string, unknown> = {};
      for (const k of CAMPOS_EDITAVEIS) payload[k] = (v as any)[k] === "" ? null : (v as any)[k] ?? null;
      payload.titulo = (v.titulo ?? "").trim();
      if (payload.titulo.toString().length < 3) throw new Error("Informe a função da vaga (mínimo 3 letras).");
      if (v.id) {
        const { error } = await supabase.from("recrutamento_vagas").update(payload as any).eq("id", v.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("recrutamento_vagas").insert({ ...payload, company_id: selectedCompanyId! } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success("Vaga salva"); setEdit(null); qc.invalidateQueries({ queryKey: ["rec-vagas"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const acao = useMutation({
    mutationFn: async ({ id, acao }: { id: string; acao: string }) => {
      const { error } = await supabase.rpc("recrutamento_vaga_acao", { _vaga_id: id, _acao: acao });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast.success({ publicar: "Vaga publicada por 30 dias", renovar: "Vaga renovada por 30 dias", pausar: "Vaga pausada", encerrar: "Vaga encerrada" }[vars.acao] ?? "Feito");
      qc.invalidateQueries({ queryKey: ["rec-vagas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (acesso.isLoading) return <p className="p-4 text-sm text-muted-foreground">Carregando…</p>;
  if (acesso.data !== true) {
    return (
      <Card className="max-w-lg mx-auto mt-6"><CardContent className="p-5 text-sm">
        O Recrutamento 360 não está liberado para esta empresa ou para o seu perfil. Somente dono ou administrador de empresa liberada tem acesso.
      </CardContent></Card>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Helmet><title>Recrutamento 360 — Vagas | AVETO 360</title></Helmet>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Recrutamento 360</h1>
          <p className="text-sm text-muted-foreground">{ativas} de {LIMITE_VAGAS_ATIVAS} vagas ativas</p>
        </div>
        <Button onClick={() => setEdit({ ...VAZIA })}><Plus className="h-4 w-4 mr-1" /> Nova Vaga</Button>
      </div>

      {vagas.isLoading && <p className="text-sm text-muted-foreground">Carregando vagas…</p>}
      {vagas.data?.length === 0 && (
        <Card><CardContent className="p-5 text-sm text-muted-foreground">Nenhuma vaga cadastrada ainda.</CardContent></Card>
      )}

      <div className="grid gap-3">
        {vagas.data?.map((v) => {
          const est = estadoEfetivo(v.status, v.expira_em);
          const unidade = unidades.data?.find((u) => u.id === v.unidade_id)?.nome;
          return (
            <Card key={v.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold break-words">{v.titulo}</h3>
                    <p className="text-xs text-muted-foreground">
                      {[unidade, TIPOS_CONTRATACAO[v.tipo_contratacao], `${v.quantidade} vaga(s)`].filter(Boolean).join(" · ")}
                    </p>
                    {v.status === "ativa" && <p className="text-xs text-muted-foreground">Publicada em {fmt(v.publicada_em)} · expira em {fmt(v.expira_em)}</p>}
                  </div>
                  <Badge variant={ESTADO_VARIANT[est]}>{ESTADO_ROTULO[est]}</Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                  {v.status !== "encerrada" && (
                    <Button size="sm" variant="outline" onClick={() => setEdit(v)}><Pencil className="h-4 w-4 mr-1" />Editar</Button>
                  )}
                  {(v.status === "rascunho" || v.status === "pausada") && (
                    <Button size="sm" disabled={acao.isPending} onClick={() => acao.mutate({ id: v.id, acao: "publicar" })}><Play className="h-4 w-4 mr-1" />Publicar</Button>
                  )}
                  {v.status === "ativa" && (
                    <Button size="sm" variant="outline" disabled={acao.isPending} onClick={() => acao.mutate({ id: v.id, acao: "renovar" })}><RotateCw className="h-4 w-4 mr-1" />Renovar</Button>
                  )}
                  {est === "ativa" && (
                    <Button size="sm" variant="outline" disabled={acao.isPending} onClick={() => acao.mutate({ id: v.id, acao: "pausar" })}><Pause className="h-4 w-4 mr-1" />Pausar</Button>
                  )}
                  {v.status !== "rascunho" && (
                    <Button size="sm" variant="outline" onClick={() => setShare(v)}><Share2 className="h-4 w-4 mr-1" />Compartilhar</Button>
                  )}
                  {v.status !== "encerrada" && (
                    <Button size="sm" variant="ghost" className="text-destructive" disabled={acao.isPending}
                      onClick={() => { if (confirm("Encerrar esta vaga? Ela não poderá ser republicada.")) acao.mutate({ id: v.id, acao: "encerrar" }); }}>
                      <XCircle className="h-4 w-4 mr-1" />Encerrar
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {edit && (
        <VagaForm vaga={edit} unidades={unidades.data ?? []} salvando={salvar.isPending}
          onClose={() => setEdit(null)} onSave={(v) => salvar.mutate(v)} />
      )}
      {share && <ShareDialog vaga={share} onClose={() => setShare(null)} />}
    </div>
  );
}

function VagaForm({ vaga, unidades, salvando, onClose, onSave }: {
  vaga: Partial<Vaga>; unidades: { id: string; nome: string; cidade: string | null; bairro: string | null }[];
  salvando: boolean; onClose: () => void; onSave: (v: Partial<Vaga>) => void;
}) {
  const [f, setF] = useState<Partial<Vaga>>(vaga);
  const set = (k: keyof Vaga, val: unknown) => setF((p) => ({ ...p, [k]: val }));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader><DialogTitle>{f.id ? "Editar Vaga" : "Nova Vaga"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Função *</Label><Input value={f.titulo ?? ""} maxLength={120} onChange={(e) => set("titulo", e.target.value)} placeholder="Ex.: Pizzaiolo" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Quantidade</Label><Input type="number" min={1} value={f.quantidade ?? 1} onChange={(e) => set("quantidade", Math.max(1, Number(e.target.value) || 1))} /></div>
            <div><Label>Contratação</Label>
              <Select value={f.tipo_contratacao ?? "clt"} onValueChange={(v) => set("tipo_contratacao", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(TIPOS_CONTRATACAO).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div><Label>Unidade</Label>
            <Select value={f.unidade_id ?? "nenhuma"} onValueChange={(v) => {
              const u = unidades.find((x) => x.id === v);
              setF((p) => ({ ...p, unidade_id: v === "nenhuma" ? null : v, cidade: p.cidade || u?.cidade || null, bairro: p.bairro || u?.bairro || null }));
            }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="nenhuma">Sem unidade específica</SelectItem>
                {unidades.map((u) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Cidade</Label><Input value={f.cidade ?? ""} onChange={(e) => set("cidade", e.target.value)} /></div>
            <div><Label>Bairro</Label><Input value={f.bairro ?? ""} onChange={(e) => set("bairro", e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Jornada / Turno</Label><Input value={f.jornada ?? ""} onChange={(e) => set("jornada", e.target.value)} placeholder="Ex.: 17h às 23h" /></div>
            <div><Label>Escala</Label><Input value={f.escala ?? ""} onChange={(e) => set("escala", e.target.value)} placeholder="Ex.: 6x1" /></div>
          </div>
          <div><Label>Remuneração</Label><Input value={f.remuneracao ?? ""} onChange={(e) => set("remuneracao", e.target.value)} placeholder="Ex.: R$ 2.100,00 + comissão" /></div>
          <div className="flex items-center gap-2"><Switch checked={!!f.exibir_remuneracao} onCheckedChange={(c) => set("exibir_remuneracao", c)} /><Label>Mostrar remuneração na página pública</Label></div>
          <div><Label>Benefícios</Label><Textarea rows={2} value={f.beneficios ?? ""} onChange={(e) => set("beneficios", e.target.value)} /></div>
          <div><Label>Atividades</Label><Textarea rows={3} value={f.atividades ?? ""} onChange={(e) => set("atividades", e.target.value)} /></div>
          <div><Label>Requisitos</Label><Textarea rows={3} value={f.requisitos ?? ""} onChange={(e) => set("requisitos", e.target.value)} /></div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={salvando} onClick={() => onSave(f)}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ShareDialog({ vaga, onClose }: { vaga: Vaga; onClose: () => void }) {
  const url = urlPublicaVaga(vaga.codigo);
  const [qr, setQr] = useState<string>("");
  useEffect(() => { QRCode.toDataURL(url, { width: 512, margin: 2 }).then(setQr).catch(() => setQr("")); }, [url]);
  const texto = `Vaga: ${vaga.titulo}\n${url}`;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Compartilhar Vaga</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {qr && <img src={qr} alt="QR Code da vaga" className="w-56 h-56 mx-auto" />}
          <Input readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => navigator.clipboard.writeText(url).then(() => toast.success("Link copiado"))}><Copy className="h-4 w-4 mr-1" />Copiar</Button>
            <Button variant="outline" asChild><a href={qr} download={`vaga-${vaga.codigo}.png`}><Download className="h-4 w-4 mr-1" />QR Code</a></Button>
            <Button variant="outline" asChild><a href={`https://wa.me/?text=${encodeURIComponent(texto)}`} target="_blank" rel="noopener noreferrer">WhatsApp</a></Button>
            <Button variant="outline" asChild><a href={url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4 mr-1" />Abrir</a></Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
