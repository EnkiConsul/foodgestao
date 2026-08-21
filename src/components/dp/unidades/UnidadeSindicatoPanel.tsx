import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Scale, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDpSindicatos, useUpsertDpSindicato } from "@/hooks/useDpCadastros";
import { supabase } from "@/integrations/supabase/client";
import { maskCnpj } from "@/lib/cnpj";
import { maskPhone } from "@/lib/phone";

const onlyDigits = (v: string) => v.replace(/\D/g, "");
const SEM_VINCULO = "__sem__";

interface Campos {
  nome: string;
  cnpj: string;
  whatsapp: string;
}

const vazio: Campos = { nome: "", cnpj: "", whatsapp: "" };

interface Props {
  /** Unidade em edição. Quando ausente, a unidade ainda não foi salva. */
  unidadeId?: string | null;
  unidadeNome?: string;
}

/**
 * Sindicato patronal da unidade: o admin escolhe entre os sindicatos já
 * cadastrados da empresa (um mesmo sindicato pode representar várias unidades),
 * cria um novo na hora ou edita os dados do que está vinculado.
 */
export function UnidadeSindicatoPanel({ unidadeId, unidadeNome }: Props) {
  const qc = useQueryClient();
  const list = useDpSindicatos();
  const upsert = useUpsertDpSindicato();

  const patronais = useMemo(
    () => (list.data ?? []).filter((s) => ((s as any).tipo ?? "patronal") === "patronal"),
    [list.data],
  );

  // Vínculo atual da unidade.
  const vinculo = useQuery({
    queryKey: ["dp_unidade_patronal", unidadeId],
    enabled: !!unidadeId,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase
        .from("dp_sindicato_unidades")
        .select("sindicato_id, dp_sindicatos!inner(tipo)")
        .eq("unidade_id", unidadeId!)
        .eq("dp_sindicatos.tipo", "patronal")
        .limit(1);
      if (error) throw error;
      return (data ?? [])[0]?.sindicato_id ?? null;
    },
  });

  const [modo, setModo] = useState<"lista" | "form">("lista");
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState<Campos>(vazio);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    setModo("lista");
    setEditandoId(null);
    setForm(vazio);
  }, [unidadeId]);

  const vinculadoId = vinculo.data ?? null;
  const vinculado = patronais.find((s) => s.id === vinculadoId) ?? null;

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ["dp_sindicatos"] });
    qc.invalidateQueries({ queryKey: ["dp_sindicato_vinculos"] });
    qc.invalidateQueries({ queryKey: ["dp_unidade_patronal"] });
    qc.invalidateQueries({ queryKey: ["dp_patronal_por_unidade"] });
    qc.invalidateQueries({ queryKey: ["dp_sindicato_unidades_all"] });
    qc.invalidateQueries({ queryKey: ["dp_unidades"] });
    qc.invalidateQueries({ queryKey: ["dp_cargo_salarios"] });
  };

  /** Troca o sindicato patronal da unidade (um por unidade). */
  const vincular = async (sindicatoId: string | null) => {
    if (!unidadeId) return;
    setSalvando(true);
    try {
      const atuais = patronais.map((s) => s.id);
      if (atuais.length) {
        await supabase
          .from("dp_sindicato_unidades")
          .delete()
          .eq("unidade_id", unidadeId)
          .in("sindicato_id", atuais);
      }
      if (sindicatoId) {
        const { error } = await supabase
          .from("dp_sindicato_unidades")
          .insert({ unidade_id: unidadeId, sindicato_id: sindicatoId });
        if (error) throw error;
      }
      invalidar();
      toast.success(sindicatoId ? "Sindicato patronal vinculado" : "Vínculo removido");
    } catch (e) {
      toast.error("Erro ao vincular", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSalvando(false);
    }
  };

  const abrirNovo = () => {
    setEditandoId(null);
    setForm(vazio);
    setModo("form");
  };

  const abrirEdicao = () => {
    if (!vinculado) return;
    setEditandoId(vinculado.id);
    setForm({
      nome: vinculado.nome,
      cnpj: vinculado.cnpj ? maskCnpj(vinculado.cnpj) : "",
      whatsapp: vinculado.contato_telefone ? maskPhone(vinculado.contato_telefone) : "",
    });
    setModo("form");
  };

  const salvarForm = async () => {
    if (!form.nome.trim()) {
      toast.error("Nome do sindicato é obrigatório");
      return;
    }
    setSalvando(true);
    try {
      const id = await upsert.mutateAsync({
        id: editandoId ?? undefined,
        nome: form.nome.trim(),
        cnpj: form.cnpj ? onlyDigits(form.cnpj) : null,
        contato_telefone: form.whatsapp ? onlyDigits(form.whatsapp) : null,
        tipo: "patronal",
      } as any);
      if (!editandoId && unidadeId && id) {
        await supabase
          .from("dp_sindicato_unidades")
          .delete()
          .eq("unidade_id", unidadeId)
          .in("sindicato_id", patronais.map((s) => s.id).concat(id));
        const { error } = await supabase
          .from("dp_sindicato_unidades")
          .insert({ unidade_id: unidadeId, sindicato_id: id });
        if (error) throw error;
      }
      invalidar();
      toast.success(editandoId ? "Sindicato atualizado" : "Sindicato cadastrado e vinculado");
      setModo("lista");
    } catch (e) {
      toast.error("Erro ao salvar", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSalvando(false);
    }
  };

  if (!unidadeId) {
    return (
      <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
        Salve a unidade primeiro para vincular o sindicato patronal.
      </div>
    );
  }

  if (modo === "form") {
    return (
      <div className="space-y-4">
        <div className="space-y-1">
          <Label className="flex items-center gap-1.5">
            <Scale className="h-4 w-4" aria-hidden="true" />
            {editandoId ? "Editar Sindicato Patronal" : "Novo Sindicato Patronal"}
          </Label>
          <p className="text-xs text-muted-foreground">
            O sindicato patronal representa a empresa em {unidadeNome || "esta unidade"} e define o piso salarial usado nos cargos.
          </p>
        </div>

        <div className="space-y-2">
          <Label>Nome *</Label>
          <Input
            value={form.nome}
            onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
            placeholder="Ex.: SINDIBARES"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>CNPJ</Label>
            <Input
              value={form.cnpj}
              onChange={(e) => setForm((f) => ({ ...f, cnpj: maskCnpj(e.target.value) }))}
              placeholder="00.000.000/0000-00"
              inputMode="numeric"
            />
          </div>
          <div className="space-y-2">
            <Label>WhatsApp</Label>
            <Input
              value={form.whatsapp}
              onChange={(e) => setForm((f) => ({ ...f, whatsapp: maskPhone(e.target.value) }))}
              placeholder="(00) 00000-0000"
              inputMode="tel"
            />
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" className="h-11" onClick={() => setModo("lista")} disabled={salvando}>
            Voltar
          </Button>
          <Button className="h-11" onClick={salvarForm} disabled={salvando}>
            {salvando ? "Salvando..." : editandoId ? "Salvar Sindicato" : "Cadastrar e Vincular"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label className="flex items-center gap-1.5">
          <Scale className="h-4 w-4" aria-hidden="true" />
          Sindicato patronal desta unidade
        </Label>
        <p className="text-xs text-muted-foreground">
          O sindicato patronal representa a empresa nesta unidade e define o piso salarial usado nos cargos.
          Um mesmo sindicato pode representar várias unidades.
        </p>
      </div>

      <div className="space-y-2">
        <Label>Sindicato vinculado</Label>
        <Select
          value={vinculadoId ?? SEM_VINCULO}
          onValueChange={(v) => vincular(v === SEM_VINCULO ? null : v)}
          disabled={salvando || vinculo.isLoading}
        >
          <SelectTrigger>
            <SelectValue placeholder="Selecione o sindicato patronal" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SEM_VINCULO}>Sem sindicato patronal</SelectItem>
            {patronais.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.nome}
                {s.cnpj ? ` — ${maskCnpj(s.cnpj)}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {vinculado ? (
        <div className="rounded-xl border border-border bg-muted/30 p-3 text-sm">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate font-semibold">{vinculado.nome}</span>
                <Badge variant="secondary" className="shrink-0">Patronal</Badge>
              </div>
              <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                <div>CNPJ: {vinculado.cnpj ? maskCnpj(vinculado.cnpj) : "—"}</div>
                <div>WhatsApp: {vinculado.contato_telefone ? maskPhone(vinculado.contato_telefone) : "—"}</div>
                <div>Representa {vinculado.unidades_count} unidade(s)</div>
              </div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="min-h-10" onClick={abrirEdicao}>
              <Pencil className="mr-1 size-4" /> Editar Dados
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="min-h-10 text-destructive hover:bg-destructive/10"
              onClick={() => vincular(null)}
              disabled={salvando}
            >
              <Trash2 className="mr-1 size-4" /> Remover Vínculo
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border p-3 text-sm text-muted-foreground">
          Esta unidade ainda não tem sindicato patronal vinculado.
        </div>
      )}

      <Button variant="outline" className="h-11 w-full sm:w-auto" onClick={abrirNovo}>
        <Plus className="mr-2 size-4" /> Novo Sindicato Patronal
      </Button>
    </div>
  );
}
