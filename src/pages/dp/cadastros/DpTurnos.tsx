import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Clock, Plus, Search, Store } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { DpPage, DpPageHeader, DpFilterCard, DpEmptyState } from "@/components/dp/DpPage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { TurnoCard } from "@/components/dp/TurnoCard";
import { TurnoForm, type TurnoSubmitPayload } from "@/components/dp/TurnoForm";
import { HorarioFuncionamentoEditor } from "@/components/dp/HorarioFuncionamentoEditor";
import {
  useDpTurnos, turnoParaForm, TURNO_FORM_DEFAULT,
  type CienciaTurno, type DpTurnoForm, type DpTurnoRow,
} from "@/hooks/useDpTurnos";

const TODAS = "todas";

export default function DpTurnos() {
  const { selectedCompanyId } = useCompanyContext();
  const { turnos, isLoading, error, criar, atualizar, novaVersao, alternarAtivo, remover } = useDpTurnos();

  const [busca, setBusca] = useState("");
  const [unidadeFiltro, setUnidadeFiltro] = useState(TODAS);
  const [unidadeFuncionamento, setUnidadeFuncionamento] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editando, setEditando] = useState<DpTurnoRow | null>(null);
  const [inicial, setInicial] = useState<DpTurnoForm | null>(null);
  const [pendente, setPendente] = useState<{ atual: DpTurnoRow; form: DpTurnoForm; ciencia?: CienciaTurno | null } | null>(null);
  const [aRemover, setARemover] = useState<DpTurnoRow | null>(null);

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
  const nomeUnidade = (id: string | null) => listaUnidades.find((u) => u.id === id)?.nome ?? null;

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return turnos.filter((t) => {
      if (unidadeFiltro !== TODAS && t.unidade_id !== unidadeFiltro) return false;
      if (!termo) return true;
      return `${t.nome} ${t.descricao ?? ""}`.toLowerCase().includes(termo);
    });
  }, [turnos, busca, unidadeFiltro]);

  const abrirNovo = () => {
    setEditando(null);
    setInicial({ ...TURNO_FORM_DEFAULT, unidade_id: unidadeFiltro === TODAS ? null : unidadeFiltro });
    setFormOpen(true);
  };

  const abrirEdicao = (t: DpTurnoRow) => {
    setEditando(t);
    setInicial(turnoParaForm(t));
    setFormOpen(true);
  };

  const duplicar = (t: DpTurnoRow) => {
    setEditando(null);
    setInicial({ ...turnoParaForm(t), nome: `${t.nome} (cópia)` });
    setFormOpen(true);
  };

  const submeter = async ({ form, ciencia }: TurnoSubmitPayload) => {
    try {
      if (!editando) {
        await criar.mutateAsync({ form, ciencia });
        toast.success("Turno criado.");
        setFormOpen(false);
        return;
      }
      // Turno em uso: o gestor escolhe entre editar ou versionar preservando o histórico.
      setPendente({ atual: editando, form, ciencia });
      setFormOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar o turno.");
    }
  };

  const confirmarEdicao = async () => {
    if (!pendente) return;
    try {
      await atualizar.mutateAsync({
        id: pendente.atual.id,
        form: pendente.form,
        anterior: pendente.atual,
        ciencia: pendente.ciencia,
      });
      toast.success("Turno atualizado.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível atualizar.");
    } finally {
      setPendente(null);
    }
  };

  const confirmarVersao = async () => {
    if (!pendente) return;
    try {
      await novaVersao.mutateAsync(pendente);
      toast.success("Nova versão do turno criada. As escalas anteriores mantêm o horário original.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível versionar o turno.");
    } finally {
      setPendente(null);
    }
  };

  return (
    <DpPage>
      <Helmet>
        <title>Turnos | DP 360°FOOD</title>
        <meta name="description" content="Cadastre os horários mais usados na sua operação e reaproveite em toda a escala." />
      </Helmet>

      <DpPageHeader
        icon={Clock}
        title="Turnos"
        description="Cadastre os horários mais usados na operação e reaproveite na escala."
        actions={
          <Button className="h-11" onClick={abrirNovo}>
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            Novo turno
          </Button>
        }
      />

      <Tabs defaultValue="turnos" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="turnos" className="h-11">Turnos</TabsTrigger>
          <TabsTrigger value="funcionamento" className="h-11">Funcionamento</TabsTrigger>
        </TabsList>

        <TabsContent value="turnos" className="space-y-4">
          <DpFilterCard>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="busca-turno" className="text-xs">Buscar</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input
                    id="busca-turno"
                    className="h-11 pl-9"
                    placeholder="Nome do turno"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Unidade</Label>
                <Select value={unidadeFiltro} onValueChange={setUnidadeFiltro}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={TODAS}>Todas as unidades</SelectItem>
                    {listaUnidades.map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </DpFilterCard>

          {isLoading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-36 w-full rounded-xl" />)}
            </div>
          ) : error ? (
            <DpEmptyState dashed>Não foi possível carregar os turnos.</DpEmptyState>
          ) : filtrados.length === 0 ? (
            <DpEmptyState icon={Clock} dashed>
              <p className="font-medium text-foreground">Nenhum turno cadastrado</p>
              <p className="mt-1">Comece pelos horários que você mais usa: almoço, jantar, abertura e fechamento.</p>
              <Button className="mt-3 h-11" onClick={abrirNovo}>
                <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                Criar primeiro turno
              </Button>
            </DpEmptyState>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {filtrados.map((t) => (
                <TurnoCard
                  key={t.id}
                  turno={t}
                  unidadeNome={nomeUnidade(t.unidade_id)}
                  onEdit={() => abrirEdicao(t)}
                  onDuplicar={() => duplicar(t)}
                  onDelete={() => setARemover(t)}
                  onToggleAtivo={(ativo) => alternarAtivo.mutate({ id: t.id, ativo })}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="funcionamento" className="space-y-4">
          <DpFilterCard>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-xs">
                <Store className="h-3.5 w-3.5" aria-hidden="true" />
                Unidade
              </Label>
              <Select
                value={unidadeFuncionamento ?? ""}
                onValueChange={(v) => setUnidadeFuncionamento(v)}
              >
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Selecione a unidade" />
                </SelectTrigger>
                <SelectContent>
                  {listaUnidades.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </DpFilterCard>

          <HorarioFuncionamentoEditor unidadeId={unidadeFuncionamento} />
        </TabsContent>
      </Tabs>

      <TurnoForm
        open={formOpen}
        onOpenChange={setFormOpen}
        initial={inicial}
        unidades={listaUnidades}
        saving={criar.isPending}
        titulo={editando ? "Editar Turno" : "Novo Turno"}
        onSubmit={submeter}
      />

      <AlertDialog open={!!pendente} onOpenChange={(o) => !o && setPendente(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Como aplicar a alteração?</AlertDialogTitle>
            <AlertDialogDescription>
              Escalas já publicadas sempre mantêm o horário original. Escolha como tratar as próximas escalas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
            <AlertDialogAction className="h-11 w-full" onClick={confirmarEdicao}>
              Aplicar apenas às novas escalas
            </AlertDialogAction>
            <Button variant="outline" className="h-11 w-full" onClick={confirmarVersao}>
              Criar uma nova versão do turno
            </Button>
            <AlertDialogCancel className="h-11 w-full">Cancelar</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!aRemover} onOpenChange={(o) => !o && setARemover(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir turno?</AlertDialogTitle>
            <AlertDialogDescription>
              O turno {aRemover?.nome} deixará de aparecer na escala. Escalas já criadas mantêm o horário registrado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="h-11"
              onClick={async () => {
                if (!aRemover) return;
                try {
                  await remover.mutateAsync(aRemover.id);
                  toast.success("Turno excluído.");
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Não foi possível excluir.");
                } finally {
                  setARemover(null);
                }
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DpPage>
  );
}
