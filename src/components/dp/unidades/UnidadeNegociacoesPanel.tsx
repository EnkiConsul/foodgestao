import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Calendar, Download, Eye, FileText, Pencil, Plus, Trash2, Users } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { sanitizeStorageFilename } from "@/lib/storage";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useDpSindicatos } from "@/hooks/useDpCadastros";
import { AplicarPisoUnidadeDialog } from "@/components/dp/AplicarPisoUnidadeDialog";
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
  sindicato_patronal_id: "",
  sindicato_laboral_id: "",
  ano: String(currentYear),
  mes: String(new Date().getMonth() + 1),
  tipo: "act",
  arquivo: null,
  arquivo_nome: null,
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

interface Props {
  /** Unidade em edição. Quando ausente, a unidade ainda não foi salva. */
  unidadeId?: string | null;
  unidadeNome?: string;
}

/**
 * Negociações coletivas (ACT/CCT/aditivos) da unidade em edição.
 * Fica na aba Sindicato do cadastro da unidade — mesma tabela e mesmos
 * vínculos usados no piso salarial e no enquadramento sindical.
 */
export function UnidadeNegociacoesPanel({ unidadeId, unidadeNome }: Props) {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();
  const sindicatos = useDpSindicatos();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [toDelete, setToDelete] = useState<Negociacao | null>(null);
  const [aplicar, setAplicar] = useState<{ sindicatoPatronalId: string | null; vigenciaInicio: string } | null>(null);

  const list = useQuery({
    queryKey: ["dp_sindicato_negociacoes", selectedCompanyId, unidadeId],
    enabled: !!selectedCompanyId && !!unidadeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_sindicato_negociacoes")
        .select("*")
        .eq("company_id", selectedCompanyId!)
        .eq("unidade_id", unidadeId!)
        .order("ano", { ascending: false })
        .order("mes", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Negociacao[];
    },
  });

  // Vínculos sindicato ↔ unidade, para filtrar os selects pela unidade atual.
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
    (sindicatos.data ?? []).forEach((s) => m.set(s.id, { nome: s.nome, tipo: (s as any).tipo ?? "patronal" }));
    return m;
  }, [sindicatos.data]);

  const opcoes = (tipo: "patronal" | "laboral") => {
    const todosDoTipo = (sindicatos.data ?? []).filter((s) => ((s as any).tipo ?? "patronal") === tipo);
    if (!unidadeId) return todosDoTipo;
    const idsVinculados = new Set(
      (vinculos.data ?? []).filter((v) => v.unidade_id === unidadeId).map((v) => v.sindicato_id),
    );
    const vinculados = todosDoTipo.filter((s) => idsVinculados.has(s.id));
    // Fallback: sem vínculo cadastrado, mostra todos os sindicatos do tipo.
    return vinculados.length > 0 ? vinculados : todosDoTipo;
  };

  const upsert = useMutation({
    mutationFn: async () => {
      if (!selectedCompanyId) throw new Error("Empresa não selecionada");
      if (!unidadeId) throw new Error("Salve a unidade primeiro");
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
        const path = `${selectedCompanyId}/sindicato-negociacoes/${unidadeId}/${Date.now()}-${sanitizeStorageFilename(file.name)}`;
        const { error: upErr } = await supabase.storage
          .from("dp-documentos")
          .upload(path, file, { upsert: true, contentType: file.type || "application/pdf" });
        if (upErr) throw upErr;
        pdf_path = path;
        arquivo_nome = file.name;
      }

      const payload: any = {
        company_id: selectedCompanyId,
        unidade_id: unidadeId,
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
    const { data, error } = await supabase.storage.from("dp-documentos").createSignedUrl(path, 60, { download });
    if (error || !data) return toast.error(error?.message ?? "Erro ao gerar link");
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

  if (!unidadeId) {
    return (
      <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
        Salve a unidade primeiro para cadastrar as negociações coletivas.
      </div>
    );
  }

  const rows = list.data ?? [];
  const patronalOptions = opcoes("patronal");
  const laboralOptions = opcoes("laboral");

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <Label className="flex items-center gap-1.5">
            <FileText className="h-4 w-4" aria-hidden="true" />
            Negociações Coletivas
          </Label>
          <p className="text-xs text-muted-foreground">
            Acordos ACT/CCT e aditivos desta unidade, entre o sindicato patronal e o laboral.
          </p>
        </div>
        <Button variant="outline" className="h-11" onClick={openNew}>
          <Plus className="mr-2 size-4" /> Nova Negociação
        </Button>
      </div>

      {list.isLoading ? (
        <div className="rounded-xl border border-border p-4 text-sm text-muted-foreground">Carregando...</div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          Nenhuma negociação cadastrada para {unidadeNome || "esta unidade"}.
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((n) => {
            const patronal = sindicatoMap.get(n.sindicato_id);
            const laboral = n.sindicato_laboral_id ? sindicatoMap.get(n.sindicato_laboral_id) : null;
            const mesLabel = n.mes ? MESES[n.mes - 1] : null;
            const arquivoNome = n.arquivo_nome ?? (n.pdf_path ? n.pdf_path.split("/").pop() : null);
            return (
              <div key={n.id} className="rounded-xl border border-border bg-muted/30 p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Badge className={tipoBadgeClass(n.tipo_documento)}>{n.tipo_documento.toUpperCase()}</Badge>
                      {mesLabel && n.ano && (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar className="h-3.5 w-3.5" /> {mesLabel}/{n.ano}
                        </span>
                      )}
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
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="min-h-10"
                      onClick={() =>
                        setAplicar({
                          sindicatoPatronalId: n.sindicato_id ?? null,
                          vigenciaInicio: `${n.ano ?? currentYear}-${String(n.mes ?? 1).padStart(2, "0")}-01`,
                        })
                      }
                    >
                      Aplicar Aos Cargos
                    </Button>
                    <Button size="icon" variant="ghost" className="min-h-10" onClick={() => openEdit(n)} aria-label="Editar">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="min-h-10" onClick={() => setToDelete(n)} aria-label="Excluir">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>

                {n.pdf_path && (
                  <div className="mt-3 flex flex-col gap-2 rounded-md border bg-background px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-2 text-sm">
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{arquivoNome ?? "arquivo.pdf"}</span>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="min-h-10" onClick={() => openPdf(n.pdf_path!, false)}>
                        <Eye className="mr-1.5 h-4 w-4" /> Visualizar
                      </Button>
                      <Button size="sm" variant="outline" className="min-h-10" onClick={() => openPdf(n.pdf_path!, true)}>
                        <Download className="mr-1.5 h-4 w-4" /> Baixar
                      </Button>
                    </div>
                  </div>
                )}
              </div>
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
            <p className="text-xs text-muted-foreground">Unidade: {unidadeNome || "—"}</p>

            <div className="space-y-1.5">
              <Label>Sindicato Patronal *</Label>
              <Select
                value={form.sindicato_patronal_id}
                onValueChange={(v) => setForm({ ...form, sindicato_patronal_id: v })}
              >
                <SelectTrigger><SelectValue placeholder="Selecione o patronal" /></SelectTrigger>
                <SelectContent>
                  {patronalOptions.length === 0 ? (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">Nenhum sindicato patronal cadastrado.</div>
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
              >
                <SelectTrigger><SelectValue placeholder="Selecione o laboral" /></SelectTrigger>
                <SelectContent>
                  {laboralOptions.length === 0 ? (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">Nenhum sindicato laboral cadastrado.</div>
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

      {aplicar && (
        <AplicarPisoUnidadeDialog
          open
          onOpenChange={(v) => { if (!v) setAplicar(null); }}
          unidadeId={unidadeId}
          unidadeNome={unidadeNome || "unidade"}
          sindicatoPatronalId={aplicar.sindicatoPatronalId}
          vigenciaInicio={aplicar.vigenciaInicio}
        />
      )}
    </div>
  );
}
