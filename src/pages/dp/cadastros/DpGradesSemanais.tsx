import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarRange, Pencil, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { DpPage, DpPageHeader, DpFilterCard, DpEmptyState } from "@/components/dp/DpPage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useDpTurnos } from "@/hooks/useDpTurnos";
import {
  useDpGradesSemanais, GRADE_FORM_DEFAULT, gradeDiasPadrao,
  type GradeSemanal, type GradeSemanalForm,
} from "@/hooks/useDpGradesSemanais";
import { DOW_LABEL } from "@/lib/dp/config-trabalho";
import { formatarFaixaTurno } from "@/lib/dp/turno-utils";

const TODAS = "todas";
const SEM_UNIDADE = "none";

/**
 * Grades semanais: a semana padrão da operação (ex.: Seg–Qui no jantar e
 * Sex–Dom no horário estendido). Serve de base para o horário de trabalho dos
 * colaboradores, sem tratar cada variação como exceção pessoal.
 */
export default function DpGradesSemanais() {
  const { selectedCompanyId } = useCompanyContext();
  const { todas, isLoading, error, criar, atualizar, remover, alternarAtivo, saving } = useDpGradesSemanais();
  const { turnos } = useDpTurnos();

  const [unidadeFiltro, setUnidadeFiltro] = useState(TODAS);
  const [formOpen, setFormOpen] = useState(false);
  const [editando, setEditando] = useState<GradeSemanal | null>(null);
  const [form, setForm] = useState<GradeSemanalForm>(GRADE_FORM_DEFAULT);
  const [aRemover, setARemover] = useState<GradeSemanal | null>(null);

  const unidades = useQuery({
    queryKey: ["dp_unidades_simples", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from("dp_unidades")
        .select("id, nome")
        .eq("company_id", selectedCompanyId!)
        .eq("ativo", true)
        .order("nome");
      if (err) throw err;
      return data ?? [];
    },
  });
  const listaUnidades = unidades.data ?? [];
  const nomeUnidade = (id: string | null) => listaUnidades.find((u) => u.id === id)?.nome ?? "Todas as unidades";

  const turnosDaForm = useMemo(
    () => turnos.filter((t) => t.ativo && (!form.unidade_id || !t.unidade_id || t.unidade_id === form.unidade_id)),
    [turnos, form.unidade_id],
  );

  const filtradas = useMemo(
    () => todas.filter((g) => unidadeFiltro === TODAS || g.unidade_id === unidadeFiltro),
    [todas, unidadeFiltro],
  );

  const abrirNova = () => {
    setEditando(null);
    setForm({
      ...GRADE_FORM_DEFAULT,
      unidade_id: unidadeFiltro === TODAS ? null : unidadeFiltro,
      dias: gradeDiasPadrao(),
    });
    setFormOpen(true);
  };

  const abrirEdicao = (g: GradeSemanal) => {
    setEditando(g);
    setForm({
      nome: g.nome,
      descricao: g.descricao,
      unidade_id: g.unidade_id,
      folga_variavel: g.folga_variavel,
      ativo: g.ativo,
      dias: g.dias.map((d) => ({ ...d })),
    });
    setFormOpen(true);
  };

  const salvar = async () => {
    if (!form.nome.trim()) {
      toast.error("Informe o nome da grade.");
      return;
    }
    if (!form.dias.some((d) => d.trabalha)) {
      toast.error("Marque ao menos um dia de trabalho.");
      return;
    }
    try {
      if (editando) await atualizar.mutateAsync({ id: editando.id, form });
      else await criar.mutateAsync(form);
      toast.success("Grade salva");
      setFormOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar a grade.");
    }
  };

  const confirmarRemocao = async () => {
    if (!aRemover) return;
    try {
      await remover.mutateAsync(aRemover.id);
      toast.success("Grade excluída");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível excluir.");
    } finally {
      setARemover(null);
    }
  };

  const alterarDia = (dow: number, patch: Partial<GradeSemanalForm["dias"][number]>) => {
    setForm((f) => ({ ...f, dias: f.dias.map((d) => (d.dow === dow ? { ...d, ...patch } : d)) }));
  };

  const resumo = (g: GradeSemanal) => g.dias
    .map((d) => {
      if (!d.trabalha) return `${DOW_LABEL[d.dow].slice(0, 3)}: folga`;
      const t = turnos.find((x) => x.id === d.turno_id);
      return `${DOW_LABEL[d.dow].slice(0, 3)}: ${t ? `${(t.entrada ?? "").slice(0, 5)}–${(t.saida ?? "").slice(0, 5)}` : "sem horário"}`;
    })
    .join(" · ");

  return (
    <DpPage>
      <Helmet>
        <title>Grades semanais | Pessoas 360°FOOD</title>
        <meta
          name="description"
          content="Cadastre a semana padrão da operação por unidade e use como base do horário de trabalho dos colaboradores."
        />
      </Helmet>

      <DpPageHeader
        icon={CalendarRange}
        title="Grades semanais"
        description="A semana padrão da unidade. Horário diferente no fim de semana entra aqui, não como exceção do colaborador."
        actions={(
          <Button onClick={abrirNova} className="gap-1.5">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Nova grade
          </Button>
        )}
      />

      <DpFilterCard>
        <div className="space-y-1">
          <Label className="text-xs">Unidade</Label>
          <Select value={unidadeFiltro} onValueChange={setUnidadeFiltro}>
            <SelectTrigger className="h-9 w-full sm:w-64"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={TODAS}>Todas</SelectItem>
              {listaUnidades.map((u) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </DpFilterCard>

      {isLoading && <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>}
      {error && <p className="text-sm text-destructive">Não foi possível carregar as grades.</p>}

      {!isLoading && filtradas.length === 0 && (
        <DpEmptyState icon={CalendarRange} dashed>
          <p className="font-medium text-foreground">Nenhuma grade cadastrada</p>
          <p>Crie a semana padrão da unidade para reaproveitar nos cadastros de colaboradores.</p>
        </DpEmptyState>
      )}

      <ul className="space-y-2">
        {filtradas.map((g) => (
          <li key={g.id} className="rounded-lg border p-3">
            <div className="flex flex-wrap items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{g.nome}</span>
                  <Badge variant="outline" className="text-[10px]">{nomeUnidade(g.unidade_id)}</Badge>
                  {g.folga_variavel && <Badge variant="secondary" className="text-[10px]">Folga variável</Badge>}
                  {!g.ativo && <Badge variant="secondary" className="text-[10px]">Inativa</Badge>}
                </div>
                {g.descricao && <p className="mt-0.5 text-xs text-muted-foreground">{g.descricao}</p>}
                <p className="mt-1 text-xs text-muted-foreground">{resumo(g)}</p>
              </div>
              <div className="flex items-center gap-1">
                <Switch
                  checked={g.ativo}
                  onCheckedChange={(v) => alternarAtivo.mutate({ id: g.id, ativo: v })}
                  aria-label={`Ativar grade ${g.nome}`}
                />
                <Button size="icon" variant="ghost" onClick={() => abrirEdicao(g)} aria-label={`Editar ${g.nome}`}>
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => setARemover(g)} aria-label={`Excluir ${g.nome}`}>
                  <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editando ? "Editar grade" : "Nova grade semanal"}</DialogTitle>
            <DialogDescription>
              Escolha o horário da loja que vale em cada dia da semana.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
            <div className="space-y-1">
              <Label htmlFor="grade-nome">Nome</Label>
              <Input
                id="grade-nome" value={form.nome}
                placeholder="Ex.: Semana do salão"
                onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
              />
            </div>

            <div className="space-y-1">
              <Label>Unidade</Label>
              <Select
                value={form.unidade_id ?? SEM_UNIDADE}
                onValueChange={(v) => setForm((f) => ({ ...f, unidade_id: v === SEM_UNIDADE ? null : v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM_UNIDADE}>Todas as unidades</SelectItem>
                  {listaUnidades.map((u) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="grade-desc">Observações</Label>
              <Textarea
                id="grade-desc" rows={2} value={form.descricao ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value || null }))}
              />
            </div>

            <ul className="divide-y rounded-lg border">
              {form.dias.map((d) => (
                <li key={d.dow} className="flex flex-wrap items-center gap-3 p-3">
                  <Switch
                    checked={d.trabalha}
                    onCheckedChange={(v) => alterarDia(d.dow, { trabalha: v, turno_id: v ? d.turno_id : null })}
                    aria-label={`Trabalha ${DOW_LABEL[d.dow]}`}
                  />
                  <span className="w-24 shrink-0 text-sm font-medium">{DOW_LABEL[d.dow]}</span>
                  {d.trabalha ? (
                    <Select
                      value={d.turno_id ?? SEM_UNIDADE}
                      onValueChange={(v) => alterarDia(d.dow, { turno_id: v === SEM_UNIDADE ? null : v })}
                    >
                      <SelectTrigger className="ml-auto h-9 w-full sm:w-56"><SelectValue placeholder="Horário" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={SEM_UNIDADE}>Sem horário definido</SelectItem>
                        {turnosDaForm.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.nome} · {formatarFaixaTurno({
                              entrada: (t.entrada ?? "").slice(0, 5),
                              saida: (t.saida ?? "").slice(0, 5),
                            })}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant="secondary" className="ml-auto">Folga</Badge>
                  )}
                </li>
              ))}
            </ul>

            <label className="flex items-center gap-3 rounded-lg border p-3 text-sm">
              <Switch
                checked={form.folga_variavel}
                onCheckedChange={(v) => setForm((f) => ({ ...f, folga_variavel: v }))}
              />
              A folga varia conforme a escala do mês
            </label>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button>
            <Button onClick={() => void salvar()} disabled={saving}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!aRemover} onOpenChange={(v) => { if (!v) setARemover(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir a grade "{aRemover?.nome}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Os colaboradores já configurados continuam com o horário atual. A grade só deixa de aparecer como atalho.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmarRemocao()}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DpPage>
  );
}
