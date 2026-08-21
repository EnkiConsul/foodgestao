import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Check, MessageCircle, Search, Users, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useDpSindicatos,
  useUpsertDpSindicato,
  useDeleteDpSindicato,
  useDpUnidades,
  useDpCargos,
  type DpSindicatoWithCounts as DpSindicato,
} from "@/hooks/useDpCadastros";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { maskCnpj } from "@/lib/cnpj";
import { maskPhone } from "@/lib/phone";
import { cn } from "@/lib/utils";

export type SindicatoTipo = "patronal" | "laboral";

const onlyDigits = (v: string) => v.replace(/\D/g, "");

/**
 * Cadastro de sindicatos de um tipo (patronal ou laboral).
 * Usado como aba dentro de Unidades (patronal) e Cargos e Salários (laboral).
 * Mantém a mesma lógica e vínculos da antiga tela dedicada de Sindicatos.
 */
export function SindicatosPanel({ tipo }: { tipo: SindicatoTipo }) {
  const qc = useQueryClient();
  const list = useDpSindicatos();
  const upsert = useUpsertDpSindicato();
  const del = useDeleteDpSindicato();
  const unidades = useDpUnidades();
  const cargos = useDpCargos();

  const isPatronal = tipo === "patronal";

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<DpSindicato | null>(null);
  const [toDelete, setToDelete] = useState<DpSindicato | null>(null);
  const [form, setForm] = useState({ nome: "", cnpj: "", contato_whatsapp: "" });
  const [unidadesSel, setUnidadesSel] = useState<string[]>([]);
  const [cargosSel, setCargosSel] = useState<string[]>([]);
  const [busca, setBusca] = useState("");

  // Vínculos existentes para edição
  const vinculos = useQuery({
    queryKey: ["dp_sindicato_vinculos", editing?.id, tipo],
    enabled: !!editing?.id,
    queryFn: async () => {
      if (isPatronal) {
        const { data, error } = await supabase
          .from("dp_sindicato_unidades")
          .select("unidade_id")
          .eq("sindicato_id", editing!.id);
        if (error) throw error;
        return { unidades: (data ?? []).map((r) => r.unidade_id), cargos: [] as string[] };
      }
      const { data, error } = await supabase
        .from("dp_sindicato_cargos")
        .select("cargo_id")
        .eq("sindicato_id", editing!.id);
      if (error) throw error;
      return { cargos: (data ?? []).map((r) => r.cargo_id), unidades: [] as string[] };
    },
  });

  useEffect(() => {
    if (!vinculos.data) return;
    setUnidadesSel(vinculos.data.unidades);
    setCargosSel(vinculos.data.cargos);
  }, [vinculos.data]);

  const rows = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (list.data ?? [])
      .filter((s) => ((s as any).tipo ?? "patronal") === tipo)
      .filter((s) => {
        if (!q) return true;
        return s.nome.toLowerCase().includes(q) || (s.cnpj ?? "").includes(onlyDigits(q));
      });
  }, [list.data, busca, tipo]);

  const abrirNovo = () => {
    setEditing(null);
    setForm({ nome: "", cnpj: "", contato_whatsapp: "" });
    setUnidadesSel([]);
    setCargosSel([]);
    setOpen(true);
  };

  const abrirEdicao = (s: DpSindicato) => {
    setEditing(s);
    setForm({
      nome: s.nome,
      cnpj: s.cnpj ? maskCnpj(s.cnpj) : "",
      contato_whatsapp: s.contato_telefone ? maskPhone(s.contato_telefone) : "",
    });
    setUnidadesSel([]);
    setCargosSel([]);
    setOpen(true);
  };

  const toggleUnidade = (id: string) =>
    setUnidadesSel((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const toggleCargo = (id: string) =>
    setCargosSel((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const salvar = async () => {
    if (!form.nome.trim()) {
      toast.error("Nome do sindicato é obrigatório");
      return;
    }
    if (isPatronal && unidadesSel.length === 0) {
      toast.error("Selecione pelo menos uma unidade");
      return;
    }
    if (!isPatronal && cargosSel.length === 0) {
      toast.error("Selecione pelo menos um cargo");
      return;
    }

    try {
      const sindicatoId = await upsert.mutateAsync({
        id: editing?.id,
        nome: form.nome.trim(),
        cnpj: form.cnpj ? onlyDigits(form.cnpj) : null,
        contato_telefone: form.contato_whatsapp ? onlyDigits(form.contato_whatsapp) : null,
        tipo,
      } as any);

      if (!sindicatoId) throw new Error("Não foi possível identificar o sindicato salvo.");

      if (isPatronal) {
        await supabase.from("dp_sindicato_unidades").delete().eq("sindicato_id", sindicatoId);
        if (unidadesSel.length) {
          await supabase
            .from("dp_sindicato_unidades")
            .insert(unidadesSel.map((unidade_id) => ({ sindicato_id: sindicatoId, unidade_id })));
        }
      } else {
        await supabase.from("dp_sindicato_cargos").delete().eq("sindicato_id", sindicatoId);
        if (cargosSel.length) {
          await supabase
            .from("dp_sindicato_cargos")
            .insert(cargosSel.map((cargo_id) => ({ sindicato_id: sindicatoId, cargo_id })));
        }
      }

      qc.invalidateQueries({ queryKey: ["dp_sindicatos"] });
      qc.invalidateQueries({ queryKey: ["dp_sindicato_vinculos"] });
      qc.invalidateQueries({ queryKey: ["dp_unidades"] });
      qc.invalidateQueries({ queryKey: ["dp_cargos"] });
      toast.success(editing ? "Sindicato atualizado" : "Sindicato cadastrado");
      setOpen(false);
    } catch (e) {
      toast.error("Erro ao salvar", { description: e instanceof Error ? e.message : String(e) });
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      await del.mutateAsync(toDelete.id);
      toast.success("Sindicato removido");
    } catch (e) {
      toast.error("Erro ao remover", { description: e instanceof Error ? e.message : String(e) });
    }
    setToDelete(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar por nome ou CNPJ..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <Button onClick={abrirNovo} className="rounded-full px-6">
          <Plus className="size-4 mr-2" /> {isPatronal ? "Novo Sindicato Patronal" : "Novo Sindicato Laboral"}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        {isPatronal
          ? "O sindicato patronal representa a empresa em cada unidade e define o piso salarial usado nos cargos. Um mesmo sindicato pode representar várias unidades."
          : "O sindicato laboral representa a categoria dos colaboradores e é vinculado aos cargos. Um mesmo sindicato pode representar vários cargos."}
      </p>

      {list.isLoading ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          Carregando…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          Nenhum sindicato {isPatronal ? "patronal" : "laboral"} {busca ? "encontrado" : "cadastrado"}.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {rows.map((s) => (
            <Card key={s.id} className="border-border shadow-sm">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{s.nome}</CardTitle>
                  <Badge
                    variant="outline"
                    className={
                      isPatronal
                        ? "bg-primary/15 text-primary border-primary/30 hover:bg-primary/20"
                        : "bg-accent text-accent-foreground border-accent hover:bg-accent/80"
                    }
                  >
                    {isPatronal ? "Patronal" : "Laboral"}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <Badge variant="secondary" className="text-[10px] gap-1">
                    {isPatronal ? (
                      <>
                        <Users className="size-3" /> {s.unidades_count} unidade{s.unidades_count === 1 ? "" : "s"}
                      </>
                    ) : (
                      <>
                        <Briefcase className="size-3" /> {s.cargos_count} cargo{s.cargos_count === 1 ? "" : "s"}
                      </>
                    )}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {s.cnpj && (
                  <div>
                    <span className="font-medium">CNPJ:</span> {maskCnpj(s.cnpj)}
                  </div>
                )}
                {s.contato_telefone && (
                  <div>
                    <span className="font-medium">WhatsApp:</span> {maskPhone(s.contato_telefone)}
                  </div>
                )}
                <div className="flex flex-wrap gap-2 mt-2">
                  <Button variant="ghost" size="sm" onClick={() => abrirEdicao(s)}>
                    <Pencil className="size-4 mr-1" /> Editar
                  </Button>
                  <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setToDelete(s)}>
                    <Trash2 className="size-4 mr-1" /> Excluir
                  </Button>
                  {s.contato_telefone && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(`https://wa.me/55${onlyDigits(s.contato_telefone!)}`, "_blank")}
                    >
                      <MessageCircle className="size-4 mr-1" /> WhatsApp
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Editar" : "Novo"} Sindicato {isPatronal ? "Patronal" : "Laboral"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="Nome do sindicato"
                maxLength={150}
              />
            </div>
            <div className="space-y-2">
              <Label>CNPJ</Label>
              <Input
                value={form.cnpj}
                onChange={(e) => setForm({ ...form, cnpj: maskCnpj(e.target.value) })}
                placeholder="00.000.000/0000-00"
                maxLength={18}
              />
            </div>
            <div className="space-y-2">
              <Label>WhatsApp</Label>
              <Input
                value={form.contato_whatsapp}
                onChange={(e) => setForm({ ...form, contato_whatsapp: maskPhone(e.target.value) })}
                placeholder="(62) 99999-9999"
                maxLength={15}
              />
            </div>

            {isPatronal ? (
              <div className="space-y-3">
                <Label className="text-base font-semibold">Unidades Representadas *</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto border border-border rounded-lg p-3">
                  {(unidades.data ?? []).map((un) => (
                    <div key={un.id} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleUnidade(un.id)}
                        className={cn(
                          "size-5 shrink-0 rounded border-2 flex items-center justify-center transition-all",
                          unidadesSel.includes(un.id)
                            ? "bg-primary border-primary text-primary-foreground"
                            : "border-muted-foreground/30 hover:border-primary/50",
                        )}
                      >
                        {unidadesSel.includes(un.id) && <Check className="size-3" />}
                      </button>
                      <Label className="text-sm cursor-pointer" onClick={() => toggleUnidade(un.id)}>
                        {un.nome}
                      </Label>
                    </div>
                  ))}
                  {(unidades.data ?? []).length === 0 && (
                    <p className="sm:col-span-2 text-xs text-muted-foreground">Cadastre unidades primeiro.</p>
                  )}
                </div>
                {unidadesSel.length === 0 && (
                  <p className="text-xs text-destructive">* Selecione pelo menos uma unidade</p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <Label className="text-base font-semibold">Cargos Representados *</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto border border-border rounded-lg p-3">
                  {(cargos.data ?? []).map((cg) => (
                    <div key={cg.id} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleCargo(cg.id)}
                        className={cn(
                          "size-5 shrink-0 rounded border-2 flex items-center justify-center transition-all",
                          cargosSel.includes(cg.id)
                            ? "bg-primary border-primary text-primary-foreground"
                            : "border-muted-foreground/30 hover:border-primary/50",
                        )}
                      >
                        {cargosSel.includes(cg.id) && <Check className="size-3" />}
                      </button>
                      <Label className="text-sm cursor-pointer" onClick={() => toggleCargo(cg.id)}>
                        {cg.nome}
                      </Label>
                    </div>
                  ))}
                  {(cargos.data ?? []).length === 0 && (
                    <p className="sm:col-span-2 text-xs text-muted-foreground">Cadastre cargos primeiro.</p>
                  )}
                </div>
                {cargosSel.length === 0 && <p className="text-xs text-destructive">* Selecione pelo menos um cargo</p>}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={upsert.isPending || (!!editing && vinculos.isFetching)}>
              {editing && vinculos.isFetching
                ? "Carregando vínculos..."
                : upsert.isPending
                  ? "Salvando..."
                  : editing
                    ? "Atualizar"
                    : "Cadastrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover sindicato "{toDelete?.nome}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação também removerá os vínculos com unidades ou cargos. Negociações e acordos vinculados serão
              mantidos, mas ficarão órfãos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
