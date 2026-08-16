import { useMemo, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import { toast } from "sonner";
import { FileText, Plus, Pencil, Trash2, Eye, Download, Building2, Users, Calendar } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { sanitizeStorageFilename } from "@/lib/storage";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useDpSindicatos, useDpUnidades } from "@/hooks/useDpCadastros";
import { AplicarPisoUnidadeDialog } from "@/components/dp/AplicarPisoUnidadeDialog";
import { DpContentCard, DpEmptyState, DpPage, DpPageHeader } from "@/components/dp/DpPage";

import type { Database } from "@/integrations/supabase/types";

type Negociacao = Database["public"]["Tables"]["dp_sindicato_negociacoes"]["Row"] & {
  sindicato_laboral_id?: string | null;
  arquivo_nome?: string | null;
};

type TipoDoc = Database["public"]["Enums"]["dp_negociacao_tipo_doc"];

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const TIPO_LABEL: Record<TipoDoc, string> = {
  act: "ACT (Acordo Coletivo de Trabalho)",
  cct: "CCT (Convenção Coletiva de Trabalho)",
  aditivo: "Aditivo",
  outro: "Outro",
};

type FormState = {
  id?: string;
  unidade_id: string;
  sindicato_patronal_id: string;
  sindicato_laboral_id: string;
  ano: string;
  mes: string;
  tipo: TipoDoc;
  arquivo?: File | null;
  arquivo_nome?: string | null;
};

const currentYear = new Date().getFullYear();
const emptyForm: FormState = {
  unidade_id: "",
  sindicato_patronal_id: "",
  sindicato_laboral_id: "",
  ano: String(currentYear),
  mes: String(new Date().getMonth() + 1),
  tipo: "act",
  arquivo: null,
  arquivo_nome: null,
};

export default function DpSindicatoNegociacoes() {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();
  const sindicatos = useDpSindicatos();
  const unidades = useDpUnidades();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [toDelete, setToDelete] = useState<Negociacao | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const list = useQuery({
    queryKey: ["dp_sindicato_negociacoes", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_sindicato_negociacoes")
        .select("*")
        .eq("company_id", selectedCompanyId!)
        .order("ano", { ascending: false })
        .order("mes", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Negociacao[];
    },
  });

  // Vínculos sindicato ↔ unidade (para filtrar dropdowns por unidade selecionada)
  const vinculos = useQuery({
    queryKey: ["dp_sindicato_unidades_all", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_sindicato_unidades")
        .select("sindicato_id, unidade_id");
      if (error) throw error;
      return data ?? [];
    },
  });

  const sindicatoMap = useMemo(() => {
    const m = new Map<string, { nome: string; tipo: string }>();
    (sindicatos.data ?? []).forEach((s) => m.set(s.id, { nome: s.nome, tipo: s.tipo }));
    return m;
  }, [sindicatos.data]);

  const unidadeMap = useMemo(() => {
    const m = new Map<string, string>();
    (unidades.data ?? []).forEach((u) => m.set(u.id, u.nome));
    return m;
  }, [unidades.data]);

  const sindicatosPorUnidade = (unidadeId: string, tipo: "patronal" | "laboral") => {
    if (!unidadeId) return [];
    const todosDoTipo = (sindicatos.data ?? []).filter((s) => s.tipo === tipo);
    const idsVinculados = new Set(
      (vinculos.data ?? []).filter((v) => v.unidade_id === unidadeId).map((v) => v.sindicato_id),
    );
    const vinculados = todosDoTipo.filter((s) => idsVinculados.has(s.id));
    // Fallback: se nenhum sindicato deste tipo estiver vinculado à unidade,
    // mostra todos os sindicatos do tipo cadastrados na empresa.
    return vinculados.length > 0 ? vinculados : todosDoTipo;
  };

  const upsert = useMutation({
    mutationFn: async () => {
      if (!selectedCompanyId) throw new Error("Empresa não selecionada");
      if (!form.unidade_id) throw new Error("Selecione a unidade");
      if (!form.sindicato_patronal_id) throw new Error("Selecione o sindicato patronal");
      if (!form.sindicato_laboral_id) throw new Error("Selecione o sindicato laboral");
      if (!form.ano || !form.mes) throw new Error("Informe ano e mês base");
      if (!form.id && !form.arquivo) throw new Error("Anexe o arquivo PDF");

      const ano = Number(form.ano);
      const mes = Number(form.mes);
      const dataBase = `${ano}-${String(mes).padStart(2, "0")}-01`;

      let pdf_path: string | null = null;
      let arquivo_nome: string | null = form.arquivo_nome ?? null;
      if (form.arquivo) {
        const file = form.arquivo;
        const safeName = sanitizeStorageFilename(file.name);
        const path = `${selectedCompanyId}/sindicato-negociacoes/${form.unidade_id}/${Date.now()}-${safeName}`;
        const { error: upErr } = await supabase.storage
          .from("dp-documentos")
          .upload(path, file, { upsert: true, contentType: file.type || "application/pdf" });
        if (upErr) throw upErr;
        pdf_path = path;
        arquivo_nome = file.name;
      }

      const payload: any = {
        company_id: selectedCompanyId,
        unidade_id: form.unidade_id,
        sindicato_id: form.sindicato_patronal_id,
        sindicato_laboral_id: form.sindicato_laboral_id,
        ano,
        mes,
        data_base: dataBase,
        vigencia_inicio: dataBase,
        tipo_documento: form.tipo,
        arquivo_nome,
      };
      if (pdf_path) payload.pdf_path = pdf_path;

      if (form.id) {
        const { error } = await supabase.from("dp_sindicato_negociacoes").update(payload).eq("id", form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("dp_sindicato_negociacoes").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(form.id ? "Negociação atualizada" : "Negociação cadastrada");
      qc.invalidateQueries({ queryKey: ["dp_sindicato_negociacoes"] });
      qc.invalidateQueries({ queryKey: ["dp_pendencias"] });
      setOpen(false);
    },
    onError: (e) => toast.error("Erro ao salvar", { description: e instanceof Error ? e.message : String(e) }),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dp_sindicato_negociacoes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Negociação removida");
      qc.invalidateQueries({ queryKey: ["dp_sindicato_negociacoes"] });
      qc.invalidateQueries({ queryKey: ["dp_pendencias"] });
    },
    onError: (e) => toast.error("Erro ao remover", { description: e instanceof Error ? e.message : String(e) }),
  });

  const openPdf = async (path: string, download = false) => {
    const { data, error } = await supabase.storage.from("dp-documentos").createSignedUrl(path, 60, {
      download: download || false,
    });
    if (error) return toast.error(error.message);
    if (download) {
      const a = document.createElement("a");
      a.href = data.signedUrl;
      a.download = "";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } else {
      window.open(data.signedUrl, "_blank");
    }
  };

  const openNew = () => {
    setForm({ ...emptyForm });
    setOpen(true);
  };

  const openEdit = (n: Negociacao) => {
    setForm({
      id: n.id,
      unidade_id: n.unidade_id ?? "",
      sindicato_patronal_id: n.sindicato_id,
      sindicato_laboral_id: n.sindicato_laboral_id ?? "",
      ano: String(n.ano ?? new Date(n.data_base).getFullYear()),
      mes: String(n.mes ?? new Date(n.data_base).getMonth() + 1),
      tipo: n.tipo_documento,
      arquivo: null,
      arquivo_nome: n.arquivo_nome ?? (n.pdf_path ? n.pdf_path.split("/").pop() ?? null : null),
    });
    setOpen(true);
  };

  const tipoBadgeClass = (tipo: TipoDoc) => {
    switch (tipo) {
      case "act":
        return "bg-destructive text-destructive-foreground hover:bg-destructive/90";
      case "cct":
        return "bg-primary text-primary-foreground hover:bg-primary/90";
      case "aditivo":
        return "bg-amber-500 text-white hover:bg-amber-500/90";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const patronalOptions = sindicatosPorUnidade(form.unidade_id, "patronal");
  const laboralOptions = sindicatosPorUnidade(form.unidade_id, "laboral");

  return (
    <DpPage>
      <Helmet><title>Negociações Coletivas — Pessoas 360°</title></Helmet>

      <DpPageHeader
        icon={FileText}
        title="Negociações Coletivas"
        description="Registre acordos entre sindicatos patronais e laborais, vinculados a uma unidade."
        actions={
          <Button onClick={openNew} disabled={(unidades.data ?? []).length === 0}>
            <Plus className="h-4 w-4 mr-2" /> Nova Negociação
          </Button>
        }
      />

      {list.isLoading ? (
        <DpContentCard><div className="p-6 text-sm text-muted-foreground">Carregando...</div></DpContentCard>
      ) : (list.data ?? []).length === 0 ? (
        <DpEmptyState icon={FileText} dashed>
          Nenhuma negociação cadastrada ainda.
        </DpEmptyState>
      ) : (
        <div className="space-y-3">
          {(list.data ?? []).map((n) => {
            const patronal = sindicatoMap.get(n.sindicato_id);
            const laboral = n.sindicato_laboral_id ? sindicatoMap.get(n.sindicato_laboral_id) : null;
            const unidadeNome = n.unidade_id ? unidadeMap.get(n.unidade_id) : null;
            const mesLabel = n.mes ? MESES[n.mes - 1] : null;
            const arquivoNome = n.arquivo_nome ?? (n.pdf_path ? n.pdf_path.split("/").pop() : null);
            return (
              <DpContentCard key={n.id} contentClassName="p-4 md:p-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex items-center gap-2 text-base font-semibold">
                      <Building2 className="h-4 w-4 text-primary" />
                      <span className="truncate">{unidadeNome ?? "—"}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {patronal && (
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" /> {patronal.nome}
                        </span>
                      )}
                      {laboral && (
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" /> {laboral.nome}
                        </span>
                      )}
                      {mesLabel && n.ano && (
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" /> {mesLabel}/{n.ano}
                        </span>
                      )}
                      <Badge className={tipoBadgeClass(n.tipo_documento)}>{n.tipo_documento.toUpperCase()}</Badge>
                    </div>
                  </div>
                  <div className="flex gap-1 md:justify-end">
                    {n.unidade_id && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setAplicar({
                            unidadeId: n.unidade_id!,
                            unidadeNome: unidadeNome ?? "unidade",
                            sindicatoPatronalId: n.sindicato_id ?? null,
                            vigenciaInicio: `${n.ano ?? currentYear}-${String(n.mes ?? 1).padStart(2, "0")}-01`,
                          })
                        }
                      >
                        Aplicar aos cargos
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" onClick={() => openEdit(n)} aria-label="Editar">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => setToDelete(n)} aria-label="Excluir">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>

                </div>

                {n.pdf_path && (
                  <div className="mt-3 flex flex-col gap-2 rounded-md border bg-muted/40 px-3 py-2 md:flex-row md:items-center md:justify-between">
                    <div className="flex min-w-0 items-center gap-2 text-sm">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="truncate">{arquivoNome ?? "arquivo.pdf"}</span>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => openPdf(n.pdf_path!, false)}>
                        <Eye className="h-4 w-4 mr-1.5" /> Visualizar
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => openPdf(n.pdf_path!, true)}>
                        <Download className="h-4 w-4 mr-1.5" /> Baixar
                      </Button>
                    </div>
                  </div>
                )}
              </DpContentCard>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar Negociação" : "Nova Negociação"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Unidade *</Label>
              <Select
                value={form.unidade_id}
                onValueChange={(v) => setForm({ ...form, unidade_id: v, sindicato_patronal_id: "", sindicato_laboral_id: "" })}
              >
                <SelectTrigger><SelectValue placeholder="Selecione a unidade" /></SelectTrigger>
                <SelectContent>
                  {(unidades.data ?? []).map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Sindicato Patronal *</Label>
              <Select
                value={form.sindicato_patronal_id}
                onValueChange={(v) => setForm({ ...form, sindicato_patronal_id: v })}
                disabled={!form.unidade_id}
              >
                <SelectTrigger>
                  <SelectValue placeholder={form.unidade_id ? "Selecione o patronal" : "Selecione uma unidade primeiro"} />
                </SelectTrigger>
                <SelectContent>
                  {patronalOptions.length === 0 ? (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">Nenhum sindicato patronal vinculado a esta unidade.</div>
                  ) : patronalOptions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Sindicato Laboral *</Label>
              <Select
                value={form.sindicato_laboral_id}
                onValueChange={(v) => setForm({ ...form, sindicato_laboral_id: v })}
                disabled={!form.unidade_id}
              >
                <SelectTrigger>
                  <SelectValue placeholder={form.unidade_id ? "Selecione o laboral" : "Selecione uma unidade primeiro"} />
                </SelectTrigger>
                <SelectContent>
                  {laboralOptions.length === 0 ? (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">Nenhum sindicato laboral vinculado a esta unidade.</div>
                  ) : laboralOptions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Ano Base *</Label>
                <Input type="number" min={2000} max={2100} value={form.ano} onChange={(e) => setForm({ ...form, ano: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Mês Base *</Label>
                <Select value={form.mes} onValueChange={(v) => setForm({ ...form, mes: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MESES.map((m, i) => (
                      <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Tipo *</Label>
              <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v as TipoDoc })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(TIPO_LABEL) as TipoDoc[]).map((k) => (
                    <SelectItem key={k} value={k}>{TIPO_LABEL[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Arquivo (PDF) {form.id ? "" : "*"}</Label>
              <Input
                ref={fileRef}
                type="file"
                accept="application/pdf"
                onChange={(e) => setForm({ ...form, arquivo: e.target.files?.[0] ?? null })}
              />
              {form.id && form.arquivo_nome && !form.arquivo && (
                <p className="text-xs text-muted-foreground">Atual: {form.arquivo_nome}</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => upsert.mutate()} disabled={upsert.isPending}>
              {upsert.isPending ? "Salvando..." : form.id ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover esta negociação?</AlertDialogTitle>
            <AlertDialogDescription>
              O PDF anexado no armazenamento não é excluído automaticamente. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (toDelete) { del.mutate(toDelete.id); setToDelete(null); } }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DpPage>
  );
}
