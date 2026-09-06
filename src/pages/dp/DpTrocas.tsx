import { Helmet } from "react-helmet-async";
import { useMemo, useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { DpPage, DpPageHeader, useDpEmbedded } from "@/components/dp/DpPage";
import { DpFilters, DpFilterField } from "@/components/dp/DpFilters";
import { RecusaDialog } from "@/components/dp/RecusaDialog";
import { TrocaCard } from "@/components/dp/TrocaCard";
import { TrocaDetalheDialog } from "@/components/dp/TrocaDetalheDialog";
import { useDpTrocas } from "@/hooks/useDpTrocas";
import { useDpUnidades, useDpCargos } from "@/hooks/useDpCadastros";
import {
  FILTROS_TROCA_PADRAO,
  contarFiltrosAtivos,
  type TrocaFiltros,
} from "@/lib/dp/trocas-filtros";

const STATUS_OPCOES: { value: string; label: string }[] = [
  { value: "todos", label: "Todos os status" },
  { value: "pendente_colega", label: "Aguardando colega" },
  { value: "pendente_gestor", label: "Aguardando gestor" },
  { value: "aprovada", label: "Aprovadas" },
  { value: "recusada", label: "Recusadas" },
  { value: "cancelada", label: "Canceladas" },
  { value: "expirada", label: "Expiradas" },
];

export default function DpTrocas() {
  const embedded = useDpEmbedded();
  const [filtros, setFiltros] = useState<TrocaFiltros>(FILTROS_TROCA_PADRAO);
  const [recusa, setRecusa] = useState<string | null>(null);
  const [cancelamento, setCancelamento] = useState<string | null>(null);
  const [detalheId, setDetalheId] = useState<string | null>(null);

  const {
    rows,
    total,
    isLoading,
    responder: responderMut,
    cancelar: cancelarMut,
  } = useDpTrocas(filtros);

  const { data: unidades = [] } = useDpUnidades();
  const { data: cargos = [] } = useDpCargos();

  const set = <K extends keyof TrocaFiltros>(campo: K, valor: TrocaFiltros[K]) =>
    setFiltros((f) => ({ ...f, [campo]: valor }));

  const ativos = contarFiltrosAtivos(filtros);
  const detalhe = useMemo(
    () => rows.find((r) => r.id === detalheId) ?? null,
    [rows, detalheId],
  );

  const aprovar = (id: string) => {
    setDetalheId(null);
    responderMut.mutate({ id, aceito: true });
  };
  const abrirRecusa = (id: string) => {
    setDetalheId(null);
    setRecusa(id);
  };
  const abrirCancelamento = (id: string) => {
    setDetalheId(null);
    setCancelamento(id);
  };

  return (
    <DpPage>
      {!embedded && (
        <Helmet><title>Trocas — Pessoas 360°</title></Helmet>
      )}
      <DpPageHeader
        icon={ArrowLeftRight}
        title="Histórico de Trocas Inteligentes"
        description="Acompanhe as permutas temporárias entre colaboradores."
      />

      <DpFilters
        search={{
          value: filtros.busca,
          onChange: (v) => set("busca", v),
          placeholder: "Buscar por nome ou matrícula...",
        }}
        activeCount={ativos}
        onClear={() => setFiltros(FILTROS_TROCA_PADRAO)}
        columns={4}
      >
        <DpFilterField label="Unidade">
          <Select value={filtros.unidadeId} onValueChange={(v) => set("unidadeId", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as unidades</SelectItem>
              {unidades.map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </DpFilterField>

        <DpFilterField label="Cargo">
          <Select value={filtros.cargoId} onValueChange={(v) => set("cargoId", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os cargos</SelectItem>
              {cargos.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </DpFilterField>

        <DpFilterField label="Situação">
          <Select value={filtros.status} onValueChange={(v) => set("status", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_OPCOES.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </DpFilterField>

        <DpFilterField label="Período das folgas">
          <Select
            value={filtros.periodo}
            onValueChange={(v) => set("periodo", v as TrocaFiltros["periodo"])}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Qualquer data</SelectItem>
              <SelectItem value="mes_atual">Mês atual</SelectItem>
              <SelectItem value="proximo_mes">Próximo mês</SelectItem>
              <SelectItem value="personalizado">Período personalizado</SelectItem>
            </SelectContent>
          </Select>
        </DpFilterField>

        {filtros.periodo === "personalizado" && (
          <>
            <DpFilterField label="De">
              <Input type="date" value={filtros.de} onChange={(e) => set("de", e.target.value)} />
            </DpFilterField>
            <DpFilterField label="Até">
              <Input type="date" value={filtros.ate} onChange={(e) => set("ate", e.target.value)} />
            </DpFilterField>
          </>
        )}

        <DpFilterField label="Ordenar por">
          <Select
            value={filtros.ordem}
            onValueChange={(v) => set("ordem", v as TrocaFiltros["ordem"])}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="recentes">Mais recentes</SelectItem>
              <SelectItem value="data_folga">Folga mais próxima</SelectItem>
            </SelectContent>
          </Select>
        </DpFilterField>

        <DpFilterField label="Atalho">
          <div className="flex h-10 items-center gap-2 rounded-md border border-input px-3">
            <Switch
              id="pendentes-gestor"
              checked={filtros.pendentesGestor}
              onCheckedChange={(v) => set("pendentesGestor", v)}
            />
            <Label htmlFor="pendentes-gestor" className="cursor-pointer text-sm font-normal">
              Só aguardando minha decisão
            </Label>
          </div>
        </DpFilterField>
      </DpFilters>

      <div className="flex items-center justify-between gap-2 px-1">
        <span className="text-sm text-muted-foreground">
          {isLoading ? "Carregando…" : `${rows.length} de ${total} troca${total === 1 ? "" : "s"}`}
        </span>
        {ativos > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setFiltros(FILTROS_TROCA_PADRAO)}>
            Limpar filtros
          </Button>
        )}
      </div>

      <div className="grid gap-4">
        {isLoading ? (
          <div className="rounded-2xl border border-border bg-card p-12 text-center text-muted-foreground">
            Carregando…
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-12 text-center text-muted-foreground">
            Nenhuma troca encontrada com estes filtros.
          </div>
        ) : (
          rows.map((r) => (
            <TrocaCard
              key={r.id}
              troca={r}
              onOpen={() => setDetalheId(r.id)}
              onAprovar={() => aprovar(r.id)}
              onRecusar={() => abrirRecusa(r.id)}
              onCancelar={() => abrirCancelamento(r.id)}
            />
          ))
        )}
      </div>

      <TrocaDetalheDialog
        troca={detalhe}
        onOpenChange={(v) => !v && setDetalheId(null)}
        onAprovar={aprovar}
        onRecusar={abrirRecusa}
        onCancelar={abrirCancelamento}
      />

      <RecusaDialog
        open={!!recusa}
        onOpenChange={(v) => !v && setRecusa(null)}
        title="Recusar troca"
        description="Informe o motivo da recusa. Ele fica registrado e visível aos dois colaboradores envolvidos."
        motivoObrigatorio
        loading={responderMut.isPending}
        onConfirm={(motivo) =>
          recusa &&
          responderMut.mutate(
            { id: recusa, aceito: false, obs: motivo },
            { onSuccess: () => setRecusa(null) },
          )
        }
      />

      <RecusaDialog
        open={!!cancelamento}
        onOpenChange={(v) => !v && setCancelamento(null)}
        title="Cancelar troca aprovada"
        description="Informe o motivo do cancelamento. As folgas voltam ao estado anterior e os dois colaboradores são avisados."
        motivoObrigatorio
        loading={cancelarMut.isPending}
        onConfirm={(motivo) =>
          cancelamento &&
          cancelarMut.mutate(
            { id: cancelamento, motivo },
            { onSuccess: () => setCancelamento(null) },
          )
        }
      />
    </DpPage>
  );
}
