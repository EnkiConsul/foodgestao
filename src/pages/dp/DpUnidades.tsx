import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Building2, ListChecks, Users, Search, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import {
  useDpUnidades,
  useUpsertDpUnidade,
  useDeleteDpUnidade,
  useToggleDpUnidadeAtivo,
  type DpUnidadeWithCounts,
} from "@/hooks/useDpCadastros";
import { DpPage, DpPageHeader } from "@/components/dp/DpPage";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const onlyNumbers = (v: string) => v.replace(/\D/g, "");
const formatCNPJ = (value: string) => {
  const c = onlyNumbers(value);
  if (c.length <= 2) return c;
  if (c.length <= 5) return c.replace(/^(\d{2})(\d{0,3})/, "$1.$2");
  if (c.length <= 8) return c.replace(/^(\d{2})(\d{3})(\d{0,3})/, "$1.$2.$3");
  if (c.length <= 12) return c.replace(/^(\d{2})(\d{3})(\d{3})(\d{0,4})/, "$1.$2.$3/$4");
  return c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})/, "$1.$2.$3/$4-$5");
};

const blank = {
  company_id: "",
  nome: "",
  cnpj: "",
  endereco: "",
  cidade: "",
  uf: "",
  ativo: true,
  telefone: "",
  possui_relogio_ponto: false,
  tem_adiantamento: false,
  dia_adiantamento: "" as string,
};

export default function DpUnidades() {
  const { companies } = useCompanyContext();
  const list = useDpUnidades();
  const upsert = useUpsertDpUnidade();
  const del = useDeleteDpUnidade();
  const toggle = useToggleDpUnidadeAtivo();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<DpUnidadeWithCounts | null>(null);
  const [toDelete, setToDelete] = useState<DpUnidadeWithCounts | null>(null);
  const [form, setForm] = useState(blank);
  const [busca, setBusca] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "ativa" | "inativa">("all");
  const [loadingBrasilApi, setLoadingBrasilApi] = useState(false);

  const [viewOpen, setViewOpen] = useState(false);
  const [viewing, setViewing] = useState<DpUnidadeWithCounts | null>(null);

  const openNew = () => {
    setEditing(null);
    const only = companies.length === 1 ? companies[0].id : "";
    setForm({ ...blank, company_id: only });
    setOpen(true);
    if (only) void applyCompanyData(only, true);
  };

  const applyCompanyData = async (companyId: string, force = false) => {
    if (!companyId) return;
    try {
      const { data, error } = await supabase
        .from("companies")
        .select("name, trade_name, cnpj, phone, whatsapp, cep, logradouro, numero, complemento, bairro, cidade, uf, address")
        .eq("id", companyId)
        .maybeSingle();
      if (error || !data) return;
      const enderecoMontado =
        [
          [data.logradouro, data.numero].filter(Boolean).join(", "),
          data.complemento,
          data.bairro,
          data.cep,
        ]
          .filter(Boolean)
          .join(" - ") || data.address || "";
      let cidade = data.cidade || "";
      let uf = data.uf || "";
      let endereco = enderecoMontado;
      let telefone = data.phone || data.whatsapp || "";

      // Fallback: se a empresa não tem cidade/UF estruturados, consulta CNPJ na BrasilAPI
      const cnpjDigits = onlyNumbers(data.cnpj || "");
      if ((!cidade || !uf) && cnpjDigits.length === 14) {
        setLoadingBrasilApi(true);
        try {
          const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpjDigits}`);
          if (res.ok) {
            const info: any = await res.json();
            if (!cidade) cidade = info.municipio || "";
            if (!uf) uf = info.uf || "";
            if (!endereco) {
              endereco = [
                [info.logradouro, info.numero].filter(Boolean).join(", "),
                info.complemento,
                info.bairro,
                info.cep,
              ].filter(Boolean).join(" - ");
            }
            if (!telefone) telefone = info.ddd_telefone_1 || "";
          }
        } catch { /* ignore */ }
        finally { setLoadingBrasilApi(false); }
      }

      setForm((prev) => ({
        ...prev,
        nome: force || !prev.nome ? (data.trade_name || data.name || prev.nome) : prev.nome,
        cnpj: force || !prev.cnpj ? cnpjDigits : prev.cnpj,
        endereco: force || !prev.endereco ? endereco : prev.endereco,
        cidade: force || !prev.cidade ? cidade : prev.cidade,
        uf: force || !prev.uf ? (uf || "").toUpperCase().slice(0, 2) : prev.uf,
        telefone: force || !prev.telefone ? telefone : prev.telefone,
      }));
    } catch {
      /* ignore */
    }
  };

  const openEdit = (u: DpUnidadeWithCounts) => {
    setEditing(u);
    const anyU = u as any;
    setForm({
      company_id: (u as any).company_id ?? "",
      nome: u.nome,
      cnpj: u.cnpj ?? "",
      endereco: u.endereco ?? "",
      cidade: u.cidade ?? "",
      uf: u.uf ?? "",
      ativo: u.ativo,
      telefone: anyU.telefone ?? "",
      possui_relogio_ponto: anyU.possui_relogio_ponto ?? false,
      tem_adiantamento: anyU.tem_adiantamento ?? false,
      dia_adiantamento: anyU.dia_adiantamento != null ? String(anyU.dia_adiantamento) : "",
    });
    setOpen(true);
  };

  const openView = (u: DpUnidadeWithCounts) => {
    setViewing(u);
    setViewOpen(true);
  };

  const save = async () => {
    if (!form.company_id) {
      toast.error("Selecione a empresa vinculada");
      return;
    }
    if (!form.nome.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }
    try {
      await upsert.mutateAsync({
        id: editing?.id,
        company_id: form.company_id,
        nome: form.nome.trim(),
        cnpj: onlyNumbers(form.cnpj) || null,
        endereco: form.endereco.trim() || null,
        cidade: form.cidade.trim() || null,
        uf: form.uf.trim().toUpperCase() || null,
        ativo: form.ativo,
        telefone: form.telefone.trim() || null,
        possui_relogio_ponto: form.possui_relogio_ponto,
        tem_adiantamento: form.tem_adiantamento,
        dia_adiantamento: form.dia_adiantamento ? Number(form.dia_adiantamento) : null,
      } as any);
      toast.success(editing ? "Unidade atualizada" : "Unidade criada");
      setOpen(false);
    } catch (e) {
      toast.error("Erro ao salvar", { description: e instanceof Error ? e.message : String(e) });
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      await del.mutateAsync(toDelete.id);
      toast.success("Unidade removida");
    } catch (e: any) {
      const msg = e?.code === "23503"
        ? "Existem registros vinculados a esta unidade."
        : (e instanceof Error ? e.message : String(e));
      toast.error("Erro ao remover", { description: msg });
    }
    setToDelete(null);
  };

  const handleToggle = async (u: DpUnidadeWithCounts) => {
    try {
      await toggle.mutateAsync({ id: u.id, ativo: !u.ativo });
    } catch (e) {
      toast.error("Erro ao atualizar status", { description: e instanceof Error ? e.message : String(e) });
    }
  };

  const rows = useMemo(() => {
    const all = list.data ?? [];
    const q = busca.trim().toLowerCase();
    return all.filter((u) => {
      if (statusFilter === "ativa" && !u.ativo) return false;
      if (statusFilter === "inativa" && u.ativo) return false;
      if (!q) return true;
      return u.nome.toLowerCase().includes(q) || (u.cnpj ?? "").includes(onlyNumbers(q));
    });
  }, [list.data, busca, statusFilter]);

  return (
    <DpPage narrow>
      <Helmet><title>Unidades — Pessoas 360°</title></Helmet>

      <DpPageHeader
        icon={Building2}
        title="Unidades"
        description="Cadastre e gerencie as unidades, seus cargos e sindicatos patronais."
        actions={
          <>
            <Button onClick={openNew} className="rounded-full px-6">
              <Plus className="size-4 mr-2" /> Nova Unidade
            </Button>
          </>
        }
      />

      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar por nome ou CNPJ..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
          <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="ativa">Ativas</SelectItem>
            <SelectItem value="inativa">Inativas</SelectItem>
          </SelectContent>
        </Select>
      </div>


      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm hidden md:block">
        <div>
          <table className="w-full table-fixed text-sm">
            <thead className="bg-muted/50 text-muted-foreground border-b border-border">
              <tr>
                <th className="text-left p-4 font-bold uppercase tracking-wider text-[10px] w-[26%]">Unidade</th>
                <th className="text-left p-4 font-bold uppercase tracking-wider text-[10px] hidden lg:table-cell w-[16%]">Empresa</th>
                <th className="text-left p-4 font-bold uppercase tracking-wider text-[10px] hidden md:table-cell w-[14%]">CNPJ</th>
                <th className="text-center p-4 font-bold uppercase tracking-wider text-[10px] w-[10%]">Cargos</th>
                <th className="text-center p-4 font-bold uppercase tracking-wider text-[10px] w-[14%]">Sind. Patronais</th>
                <th className="text-center p-4 font-bold uppercase tracking-wider text-[10px] w-[10%]">Status</th>
                <th className="text-right p-4 font-bold uppercase tracking-wider text-[10px] w-[10%]">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {list.isLoading && (
                <tr><td colSpan={7} className="p-12 text-center text-muted-foreground">Carregando...</td></tr>
              )}
              {!list.isLoading && rows.length === 0 && (
                <tr><td colSpan={7} className="p-12 text-center text-muted-foreground">
                  {(list.data ?? []).length === 0 ? "Nenhuma unidade cadastrada." : "Nenhuma unidade encontrada com os filtros atuais."}
                </td></tr>
              )}
              {rows.map((u) => (
                <tr
                  key={u.id}
                  className="hover:bg-muted/20 transition-colors cursor-pointer"
                  onClick={() => openView(u)}
                >
                  <td className="p-4">
                    <div className="font-bold truncate" title={u.nome}>{u.nome}</div>
                    {u.endereco && <div className="text-xs text-muted-foreground truncate" title={u.endereco}>{u.endereco}</div>}
                  </td>
                  <td className="p-4 hidden lg:table-cell text-xs truncate">
                    {u.company_name ?? "—"}
                  </td>
                  <td className="p-4 hidden md:table-cell font-mono text-xs">
                    {u.cnpj ? formatCNPJ(u.cnpj) : "—"}
                  </td>
                  <td className="p-4 text-center">
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                      <ListChecks className="size-3" /> {u.cargos_count}
                    </span>
                  </td>
                  <td className="p-4 text-center">
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-accent text-accent-foreground">
                      <Users className="size-3" /> {u.sindicatos_patronais_count}
                    </span>
                  </td>
                  <td className="p-4 text-center" onClick={(e) => e.stopPropagation()}>
                    <Switch checked={u.ativo} onCheckedChange={() => handleToggle(u)} />
                  </td>
                  <td className="p-4 text-right whitespace-nowrap">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={(e) => { e.stopPropagation(); openEdit(u); }}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={(e) => { e.stopPropagation(); setToDelete(u); }}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile: lista de cards */}
      <div className="md:hidden space-y-3">
        {list.isLoading && (
          <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">Carregando…</div>
        )}
        {!list.isLoading && rows.length === 0 && (
          <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            {(list.data ?? []).length === 0 ? "Nenhuma unidade cadastrada." : "Nenhuma unidade encontrada com os filtros atuais."}
          </div>
        )}
        {!list.isLoading && rows.map((u) => (
          <div
            key={u.id}
            onClick={() => openView(u)}
            className="rounded-2xl border border-border bg-card p-4 space-y-3 active:scale-[0.98] transition-transform"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="font-bold truncate">{u.nome}</div>
                {u.company_name && <div className="text-[11px] text-muted-foreground truncate">{u.company_name}</div>}
                {u.cnpj && <div className="font-mono text-[11px] text-muted-foreground">{formatCNPJ(u.cnpj)}</div>}
                {u.endereco && <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{u.endereco}</div>}
              </div>
              <div onClick={(e) => e.stopPropagation()}>
                <Switch checked={u.ativo} onCheckedChange={() => handleToggle(u)} />
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 text-[11px]">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium bg-primary/10 text-primary">
                <ListChecks className="size-3" /> {u.cargos_count} cargos
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium bg-accent text-accent-foreground">
                <Users className="size-3" /> {u.sindicatos_patronais_count} sind.
              </span>
            </div>
            <div className="flex gap-1 pt-1 border-t border-border/60" onClick={(e) => e.stopPropagation()}>
              <Button size="sm" variant="ghost" className="min-h-11 flex-1" onClick={() => openEdit(u)}>
                <Pencil className="size-4 mr-1" /> Editar
              </Button>
              <Button size="sm" variant="ghost" className="min-h-11 flex-1 text-destructive hover:bg-destructive/10" onClick={() => setToDelete(u)}>
                <Trash2 className="size-4 mr-1" /> Excluir
              </Button>
            </div>
          </div>
        ))}
      </div>


      {/* View dialog */}
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="size-5 text-primary" />
              {viewing?.nome || "Unidade"}
            </DialogTitle>
          </DialogHeader>
          {viewing && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
              <div className="md:col-span-2">
                <Label className="text-xs text-muted-foreground uppercase">Empresa vinculada</Label>
                <p className="font-semibold">{viewing.company_name ?? "—"}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground uppercase">Nome</Label>
                <p className="font-semibold">{viewing.nome}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground uppercase">CNPJ</Label>
                <p className="font-mono">{viewing.cnpj ? formatCNPJ(viewing.cnpj) : "—"}</p>
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs text-muted-foreground uppercase">Endereço</Label>
                <p>{viewing.endereco || "—"}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground uppercase">Cidade / UF</Label>
                <p>{[viewing.cidade, viewing.uf].filter(Boolean).join(" / ") || "—"}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground uppercase">Telefone</Label>
                <p>{(viewing as any).telefone || "—"}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground uppercase">Status</Label>
                <p>{viewing.ativo ? "Ativa" : "Inativa"}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground uppercase">Relógio de Ponto</Label>
                <p>{(viewing as any).possui_relogio_ponto ? "Sim" : "Não"}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground uppercase">Adiantamento</Label>
                <p>
                  {(viewing as any).tem_adiantamento
                    ? `Sim (Dia ${(viewing as any).dia_adiantamento || "—"})`
                    : "Não"}
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setViewOpen(false)}>Fechar</Button>
            {viewing && (
              <Button onClick={() => { const u = viewing; setViewOpen(false); openEdit(u); }}>
                <Pencil className="size-4 mr-2" /> Editar
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create/Edit dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar unidade" : "Nova unidade"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Empresa vinculada *</Label>
              {companies.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-3 text-sm text-muted-foreground">
                  Nenhuma empresa cadastrada.{" "}
                  <Link to="/empresas" className="text-primary underline">
                    Cadastre em Minhas Empresas
                  </Link>{" "}
                  antes de criar unidades.
                </div>
              ) : (
                <Select
                  value={form.company_id}
                  onValueChange={(v) => {
                    setForm((prev) => ({ ...prev, company_id: v }));
                    if (!editing) void applyCompanyData(v, true);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a empresa" />
                  </SelectTrigger>
                  <SelectContent>
                    {companies.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.trade_name || c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <p className="text-[11px] text-muted-foreground">
                A cobrança do plano é por empresa. Uma empresa pode ter várias unidades sem custo extra.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Nome da Unidade *</Label>
              <Input
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="Ex: Unidade Garavelo"
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                CNPJ
                {loadingBrasilApi && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-normal text-muted-foreground">
                    <Loader2 className="size-3 animate-spin" /> Buscando dados na BrasilAPI...
                  </span>
                )}
              </Label>
              <Input
                value={formatCNPJ(form.cnpj)}
                onChange={(e) => setForm({ ...form, cnpj: onlyNumbers(e.target.value) })}
                placeholder="00.000.000/0000-00"
                maxLength={18}
              />
            </div>
            <div className="space-y-2">
              <Label>Endereço</Label>
              <Input
                value={form.endereco}
                onChange={(e) => setForm({ ...form, endereco: e.target.value })}
                placeholder="Ex: R 9 A, SN"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-2 col-span-2">
                <Label>Cidade</Label>
                <Input
                  value={form.cidade}
                  onChange={(e) => setForm({ ...form, cidade: e.target.value })}
                  placeholder="Ex: Aparecida de Goiânia"
                />
              </div>
              <div className="space-y-2">
                <Label>UF</Label>
                <Input
                  value={form.uf}
                  onChange={(e) => setForm({ ...form, uf: e.target.value.toUpperCase() })}
                  placeholder="GO"
                  maxLength={2}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input
                value={form.telefone}
                onChange={(e) => setForm({ ...form, telefone: e.target.value })}
                placeholder="Ex: (62) 99999-9999"
              />
            </div>
            <div className="flex items-center space-x-2 rounded-xl border border-border p-3">
              <Switch
                id="possui_relogio_ponto"
                checked={form.possui_relogio_ponto}
                onCheckedChange={(v) => setForm({ ...form, possui_relogio_ponto: v })}
              />
              <Label htmlFor="possui_relogio_ponto">Possui relógio de ponto</Label>
            </div>
            <div className="flex items-center space-x-2 rounded-xl border border-border p-3">
              <Switch
                id="tem_adiantamento"
                checked={form.tem_adiantamento}
                onCheckedChange={(v) =>
                  setForm({ ...form, tem_adiantamento: v, dia_adiantamento: v ? form.dia_adiantamento : "" })
                }
              />
              <Label htmlFor="tem_adiantamento">Tem adiantamento salarial</Label>
            </div>
            {form.tem_adiantamento && (
              <div className="space-y-2">
                <Label>Dia do Adiantamento</Label>
                <Select
                  value={form.dia_adiantamento || ""}
                  onValueChange={(v) => setForm({ ...form, dia_adiantamento: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o dia" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 28 }, (_, i) => i + 1).map((dia) => (
                      <SelectItem key={dia} value={dia.toString()}>{dia}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={upsert.isPending}>
              {upsert.isPending ? "Salvando..." : editing ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover unidade "{toDelete?.nome}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Colaboradores, folgas, escalas e vínculos sindicais associados a esta unidade ficarão sem referência.
              Se houver registros vinculados, a exclusão será bloqueada pelo banco de dados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DpPage>
  );
}
