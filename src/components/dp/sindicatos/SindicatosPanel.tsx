import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Check, MessageCircle, Search, Users, Briefcase, AlertCircle, Link2, Loader2 } from "lucide-react";
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
  useDpPatronalPorUnidade,
  type DpSindicatoWithCounts as DpSindicato,
} from "@/hooks/useDpCadastros";
import {
  useAdotarSindicatoCatalogo,
  useDpVinculosCargosLaborais,
  useSugestoesSindicato,
  useVincularCargosSemLaboral,
} from "@/hooks/useDpSindicatosCatalogo";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { SindicatoCatalogoSugestaoCard } from "@/components/dp/sindicatos/SindicatoCatalogoOpcoes";
import { cargosSemLaboral, chaveMunicipio, type SugestaoSindicato } from "@/lib/dp/sindicatos-catalogo";
import { notifyError } from "@/lib/notifyError";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { maskCnpj } from "@/lib/cnpj";
import { maskPhone } from "@/lib/phone";
import { cn } from "@/lib/utils";
import { somenteDigitos as onlyDigits } from "@/lib/dp/formato";

export type SindicatoTipo = "patronal" | "laboral";


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
  const { selectedCompanyId } = useCompanyContext();
  const { data: patronais = {} } = useDpPatronalPorUnidade();
  const unidadesEmpresa = useMemo(
    () => (unidades.data ?? []).filter((u) => !selectedCompanyId || u.company_id === selectedCompanyId),
    [unidades.data, selectedCompanyId],
  );
  const locais = useMemo(
    () => unidadesEmpresa.map((u) => ({ cidade: u.cidade ?? null, uf: u.uf ?? null })),
    [unidadesEmpresa],
  );
  const sugestoes = useSugestoesSindicato(tipo, locais);
  const adotar = useAdotarSindicatoCatalogo();
  const [adotandoId, setAdotandoId] = useState<string | null>(null);
  const vinculosLaborais = useDpVinculosCargosLaborais();
  const vincularLote = useVincularCargosSemLaboral();
  const [confirmarLote, setConfirmarLote] = useState<DpSindicato | null>(null);
  /** Pré-seleção usada quando o sindicato acabou de ser adotado e ainda não tem vínculos. */
  const [preSelecao, setPreSelecao] = useState<{ unidades: string[]; cargos: string[] } | null>(null);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<DpSindicato | null>(null);
  const [toDelete, setToDelete] = useState<DpSindicato | null>(null);
  const [form, setForm] = useState({ nome: "", cnpj: "", contato_whatsapp: "", data_base: "", contato_nome: "", contato_email: "" });
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
    setUnidadesSel(vinculos.data.unidades.length ? vinculos.data.unidades : preSelecao?.unidades ?? []);
    setCargosSel(vinculos.data.cargos.length ? vinculos.data.cargos : preSelecao?.cargos ?? []);
  }, [vinculos.data, preSelecao]);

  const doTipo = useMemo(
    () => (list.data ?? []).filter((s) => ((s as any).tipo ?? "patronal") === tipo),
    [list.data, tipo],
  );
  const laboraisAtivos = useMemo(
    () => (isPatronal ? [] : doTipo.filter((s) => s.ativo !== false)),
    [doTipo, isPatronal],
  );
  const semLaboral = useMemo(
    () =>
      isPatronal || !vinculosLaborais.isSuccess || !cargos.isSuccess
        ? []
        : cargosSemLaboral(cargos.data ?? [], vinculosLaborais.data ?? [], vinculosLaborais.laboralIds),
    [isPatronal, vinculosLaborais.isSuccess, vinculosLaborais.data, vinculosLaborais.laboralIds, cargos.isSuccess, cargos.data],
  );
  // Com cidade atendida pela base, mostramos só as recomendadas; sem nenhuma
  // cadastrada do tipo, mostramos as da UF para não cair num formulário em branco.
  const sugestoesVisiveis = useMemo(() => {
    const recomendadas = sugestoes.filter((s) => s.recomendado);
    if (recomendadas.length > 0) return recomendadas;
    return doTipo.length === 0 ? sugestoes.slice(0, 3) : [];
  }, [sugestoes, doTipo.length]);

  const adotarDaBase = async (sugestao: SugestaoSindicato) => {
    setAdotandoId(sugestao.item.id);
    try {
      const sindicatoId = await adotar.mutateAsync(sugestao.item.id);
      if (isPatronal) {
        // Patronal: o usuário confirma as unidades (pode haver dois patronais na mesma cidade).
        const chaves = new Set(sugestao.item.municipios.map(chaveMunicipio));
        const sugeridas = unidadesEmpresa
          .filter((u) => !patronais[u.id] && chaves.has(chaveMunicipio(u.cidade)))
          .map((u) => u.id);
        const { data } = await list.refetch();
        const adotado = (data ?? []).find((s) => s.id === sindicatoId);
        toast.success(`${sugestao.item.nome} adotado na empresa`, {
          description: "Confirme as unidades que ele representa.",
        });
        if (adotado) abrirEdicao(adotado, { unidades: sugeridas, cargos: [] });
      } else {
        toast.success(`${sugestao.item.nome} adotado na empresa`, {
          description: "Agora vincule os cargos que ele representa.",
        });
      }
    } catch (e) {
      notifyError(e as Error, { surface: "Sindicatos", action: "adotar o sindicato da base" });
    } finally {
      setAdotandoId(null);
    }
  };

  const vincularTodos = async () => {
    if (!confirmarLote) return;
    const alvo = confirmarLote;
    try {
      const total = await vincularLote.mutateAsync(alvo.id);
      toast.success(
        total === 0
          ? "Todos os cargos já estavam com sindicato"
          : `${total} cargo${total === 1 ? "" : "s"} vinculado${total === 1 ? "" : "s"} ao ${alvo.nome}`,
      );
    } catch (e) {
      notifyError(e as Error, { surface: "Sindicatos", action: "vincular cargos ao sindicato" });
    } finally {
      setConfirmarLote(null);
    }
  };

  const rows = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return doTipo
      .filter((s) => {
        if (!q) return true;
        return s.nome.toLowerCase().includes(q) || (s.cnpj ?? "").includes(onlyDigits(q));
      });
  }, [doTipo, busca]);

  const abrirNovo = () => {
    setEditing(null);
    setPreSelecao(null);
    setForm({ nome: "", cnpj: "", contato_whatsapp: "", data_base: "", contato_nome: "", contato_email: "" });
    setUnidadesSel([]);
    setCargosSel([]);
    setOpen(true);
  };

  const abrirEdicao = (s: DpSindicato, pre: { unidades: string[]; cargos: string[] } | null = null) => {
    setEditing(s);
    setPreSelecao(pre);
    setForm({
      nome: s.nome,
      cnpj: s.cnpj ? maskCnpj(s.cnpj) : "",
      contato_whatsapp: s.contato_telefone ? maskPhone(s.contato_telefone) : "",
      data_base: (() => { const m = /^\d{4}-(\d{2})-(\d{2})/.exec(String((s as any).data_base ?? "")); return m ? `${m[2]}/${m[1]}` : ""; })(),
      contato_nome: (s as any).contato_nome ?? "",
      contato_email: (s as any).contato_email ?? "",
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

    const mDb = /^(\d{2})\/(\d{2})$/.exec(form.data_base.trim());
    if (form.data_base.trim() && (!mDb || Number(mDb[2]) < 1 || Number(mDb[2]) > 12 || Number(mDb[1]) < 1 || Number(mDb[1]) > 31)) {
      toast.error("Data-base inválida", { description: "Use dia/mês, ex.: 01/05" });
      return;
    }
    if (form.contato_email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contato_email.trim())) {
      toast.error("E-mail do contato inválido");
      return;
    }

    try {
      const sindicatoId = await upsert.mutateAsync({
        id: editing?.id,
        nome: form.nome.trim(),
        cnpj: form.cnpj ? onlyDigits(form.cnpj) : null,
        contato_telefone: form.contato_whatsapp ? onlyDigits(form.contato_whatsapp) : null,
        contato_nome: form.contato_nome.trim() || null,
        contato_email: form.contato_email.trim() || null,
        data_base: mDb ? `2000-${mDb[2]}-${mDb[1]}` : null,
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
      qc.invalidateQueries({ queryKey: ["dp_patronal_por_unidade"] });
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

      {!busca && sugestoesVisiveis.length > 0 && (
        <section className="space-y-2" aria-label="Sindicatos sugeridos da base Aveto 360">
          <p className="text-sm font-semibold">Sugeridos para as suas unidades</p>
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {sugestoesVisiveis.map((s) => (
              <SindicatoCatalogoSugestaoCard
                key={s.item.id}
                sugestao={s}
                acao="Adotar na empresa"
                carregando={adotandoId === s.item.id}
                onUsar={() => adotarDaBase(s)}
              />
            ))}
          </div>
        </section>
      )}

      {!isPatronal && semLaboral.length > 0 && (
        <section
          className="space-y-3 rounded-xl border border-warning/50 bg-warning/10 p-3"
          aria-label="Cargos sem sindicato laboral"
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
            <div className="min-w-0 space-y-0.5">
              <p className="text-sm font-semibold">
                {semLaboral.length} cargo{semLaboral.length === 1 ? "" : "s"} sem sindicato laboral
              </p>
              <p className="text-xs text-muted-foreground break-words">
                {semLaboral.slice(0, 4).map((c) => c.nome).join(", ")}
                {semLaboral.length > 4 ? ` e mais ${semLaboral.length - 4}` : ""}
              </p>
            </div>
          </div>
          {laboraisAtivos.length > 0 ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {laboraisAtivos.map((s) => (
                <Button
                  key={s.id}
                  type="button"
                  className="min-h-11 w-full whitespace-normal sm:w-auto"
                  onClick={() => setConfirmarLote(s)}
                  disabled={vincularLote.isPending}
                >
                  <Link2 className="mr-2 h-4 w-4 shrink-0" aria-hidden="true" />
                  Vincular todos ao {s.nome}
                </Button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Adote ou cadastre o sindicato laboral da categoria para enquadrar esses cargos de uma vez.
            </p>
          )}
        </section>
      )}

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
            <div className="space-y-2">
              <Label>Data-base (dia/mês)</Label>
              <Input
                value={form.data_base}
                onChange={(e) => setForm({ ...form, data_base: e.target.value })}
                placeholder="01/05"
                maxLength={5}
                inputMode="numeric"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Nome do contato</Label>
                <Input
                  value={form.contato_nome}
                  onChange={(e) => setForm({ ...form, contato_nome: e.target.value })}
                  maxLength={120}
                />
              </div>
              <div className="space-y-2">
                <Label>E-mail do contato</Label>
                <Input
                  type="email"
                  value={form.contato_email}
                  onChange={(e) => setForm({ ...form, contato_email: e.target.value })}
                  maxLength={160}
                />
              </div>
            </div>

            {isPatronal ? (
              <div className="space-y-3">
                <Label className="text-base font-semibold">Unidades Representadas *</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto border border-border rounded-lg p-3">
                  {unidadesEmpresa.map((un) => (
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
                  {unidadesEmpresa.length === 0 && (
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

      <AlertDialog open={!!confirmarLote} onOpenChange={(o) => !o && !vincularLote.isPending && setConfirmarLote(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Vincular {semLaboral.length} cargo{semLaboral.length === 1 ? "" : "s"} ao {confirmarLote?.nome}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Só entram os cargos ativos que ainda não têm sindicato laboral. Cargos já vinculados a outro
              sindicato continuam como estão. Dá para ajustar cargo por cargo depois.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {semLaboral.length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">
                Cargos que entram agora ({semLaboral.length})
              </p>
              <ul
                className="max-h-56 space-y-0.5 overflow-y-auto overscroll-contain rounded-lg border border-border bg-muted/40 p-1.5"
                aria-label="Cargos que serão vinculados ao sindicato"
              >
                {semLaboral.map((c) => (
                  <li key={c.id} className="flex items-start gap-2 rounded-md px-2 py-1.5 text-sm">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                    <span className="min-w-0 break-words">{c.nome}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
              Nenhum cargo aguardando enquadramento neste momento.
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={vincularLote.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); void vincularTodos(); }}
              disabled={vincularLote.isPending}
            >
              {vincularLote.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Vincular todos
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
