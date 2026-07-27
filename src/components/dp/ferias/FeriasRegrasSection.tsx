import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Palmtree, CalendarOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { DpContentCard } from "@/components/dp/DpPage";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useDpUnidades, useDpCargos } from "@/hooks/useDpCadastros";
import {
  useDpFeriasRegras, type FeriasRegraInput, type FeriasBloqueioInput,
} from "@/hooks/useDpFeriasRegras";

const TURNOS = [
  { value: "matutino", label: "Matutino" },
  { value: "vespertino", label: "Vespertino" },
  { value: "noturno", label: "Noturno" },
  { value: "misto", label: "Misto" },
] as const;

const ALL = "__todos__";

const emptyRegra: FeriasRegraInput = {
  unidade_id: null, cargo_id: null, turno: null,
  max_simultaneos: 1, ativo: true, observacao: null,
};

const emptyBloqueio = (): FeriasBloqueioInput => ({
  unidade_id: null, nome: "", data_inicio: "", data_fim: "",
  recorrente_anual: true, permite_excecao: false, ativo: true, observacao: null,
});

function Card({ title, description, icon: Icon, children }: {
  title: string; description: string; icon: typeof Palmtree; children: React.ReactNode;
}) {
  return (
    <DpContentCard contentClassName="space-y-4 p-4 md:p-5">
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      {children}
    </DpContentCard>
  );
}

export function FeriasRegrasSection() {
  const { data: unidades = [] } = useDpUnidades();
  const { data: cargos = [] } = useDpCargos();
  const { regras, bloqueios, saveRegra, deleteRegra, saveBloqueio, deleteBloqueio } = useDpFeriasRegras();

  const [novaRegra, setNovaRegra] = useState<FeriasRegraInput>(emptyRegra);
  const [novoBloqueio, setNovoBloqueio] = useState<FeriasBloqueioInput>(emptyBloqueio());

  const nomeUnidade = (id: string | null) => unidades.find((u) => u.id === id)?.nome ?? "Todas as unidades";
  const nomeCargo = (id: string | null) => cargos.find((c) => c.id === id)?.nome ?? "Todos os cargos";

  const addRegra = async () => {
    try {
      await saveRegra.mutateAsync(novaRegra);
      setNovaRegra(emptyRegra);
      toast.success("Regra de férias criada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar a regra");
    }
  };

  const addBloqueio = async () => {
    if (!novoBloqueio.nome.trim() || !novoBloqueio.data_inicio || !novoBloqueio.data_fim) {
      toast.error("Informe nome, data inicial e data final.");
      return;
    }
    try {
      await saveBloqueio.mutateAsync(novoBloqueio);
      setNovoBloqueio(emptyBloqueio());
      toast.success("Período bloqueado criado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar o bloqueio");
    }
  };

  return (
    <>
      <Card
        icon={Palmtree}
        title="Férias — Limite De Simultâneos"
        description="Quantos colaboradores podem estar de férias ao mesmo tempo. A regra mais específica (unidade + cargo + turno) prevalece."
      >
        {regras.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma regra cadastrada — sem limite de simultâneos.</p>
        ) : (
          <ul className="divide-y">
            {regras.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <Badge variant="secondary">Máx. {r.max_simultaneos}</Badge>
                <span>{nomeUnidade(r.unidade_id)}</span>
                <span className="text-muted-foreground">·</span>
                <span>{nomeCargo(r.cargo_id)}</span>
                {r.turno && <Badge variant="outline">{TURNOS.find((t) => t.value === r.turno)?.label}</Badge>}
                {!r.ativo && <Badge variant="outline">Inativa</Badge>}
                <Button
                  variant="ghost" size="icon" className="ml-auto h-8 w-8"
                  aria-label="Excluir regra"
                  onClick={() => void deleteRegra.mutateAsync(r.id)}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1">
            <Label className="text-xs">Unidade</Label>
            <Select
              value={novaRegra.unidade_id ?? ALL}
              onValueChange={(v) => setNovaRegra((f) => ({ ...f, unidade_id: v === ALL ? null : v }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todas</SelectItem>
                {unidades.map((u) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Cargo</Label>
            <Select
              value={novaRegra.cargo_id ?? ALL}
              onValueChange={(v) => setNovaRegra((f) => ({ ...f, cargo_id: v === ALL ? null : v }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos</SelectItem>
                {cargos.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Turno</Label>
            <Select
              value={novaRegra.turno ?? ALL}
              onValueChange={(v) => setNovaRegra((f) => ({ ...f, turno: v === ALL ? null : (v as FeriasRegraInput["turno"]) }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos</SelectItem>
                {TURNOS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs" htmlFor="max-simultaneos">Máx. simultâneos</Label>
            <Input
              id="max-simultaneos" type="number" min={0}
              value={novaRegra.max_simultaneos}
              onChange={(e) => setNovaRegra((f) => ({ ...f, max_simultaneos: Number(e.target.value) || 0 }))}
            />
          </div>
          <div className="flex items-end">
            <Button className="w-full" onClick={() => void addRegra()} disabled={saveRegra.isPending}>
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> Adicionar
            </Button>
          </div>
        </div>
      </Card>

      <Card
        icon={CalendarOff}
        title="Férias — Períodos Bloqueados"
        description="Datas em que férias não podem ocorrer (Natal, Ano Novo, alta temporada, eventos). Marque repetir todo ano para feriados fixos."
      >
        {bloqueios.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum período bloqueado cadastrado.</p>
        ) : (
          <ul className="divide-y">
            {bloqueios.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <span className="font-medium">{b.nome}</span>
                <span className="text-muted-foreground">
                  {new Date(`${b.data_inicio}T12:00:00`).toLocaleDateString("pt-BR")} a{" "}
                  {new Date(`${b.data_fim}T12:00:00`).toLocaleDateString("pt-BR")}
                </span>
                {b.recorrente_anual && <Badge variant="secondary">Todo ano</Badge>}
                {b.permite_excecao && <Badge variant="outline">Permite exceção</Badge>}
                <Badge variant="outline">{nomeUnidade(b.unidade_id)}</Badge>
                <Button
                  variant="ghost" size="icon" className="ml-auto h-8 w-8"
                  aria-label="Excluir período bloqueado"
                  onClick={() => void deleteBloqueio.mutateAsync(b.id)}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1">
            <Label className="text-xs" htmlFor="bloq-nome">Nome</Label>
            <Input
              id="bloq-nome" value={novoBloqueio.nome}
              placeholder="Ex.: Natal e Ano Novo"
              onChange={(e) => setNovoBloqueio((f) => ({ ...f, nome: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs" htmlFor="bloq-ini">Início</Label>
            <Input
              id="bloq-ini" type="date" value={novoBloqueio.data_inicio}
              onChange={(e) => setNovoBloqueio((f) => ({ ...f, data_inicio: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs" htmlFor="bloq-fim">Fim</Label>
            <Input
              id="bloq-fim" type="date" value={novoBloqueio.data_fim}
              onChange={(e) => setNovoBloqueio((f) => ({ ...f, data_fim: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Unidade</Label>
            <Select
              value={novoBloqueio.unidade_id ?? ALL}
              onValueChange={(v) => setNovoBloqueio((f) => ({ ...f, unidade_id: v === ALL ? null : v }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todas</SelectItem>
                {unidades.map((u) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button className="w-full" onClick={() => void addBloqueio()} disabled={saveBloqueio.isPending}>
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> Adicionar
            </Button>
          </div>
          <div className="flex items-center justify-between gap-2 sm:col-span-2">
            <Label htmlFor="bloq-recorrente" className="text-xs">Repetir todo ano</Label>
            <Switch
              id="bloq-recorrente"
              checked={novoBloqueio.recorrente_anual}
              onCheckedChange={(v) => setNovoBloqueio((f) => ({ ...f, recorrente_anual: v }))}
            />
          </div>
          <div className="flex items-center justify-between gap-2 sm:col-span-2">
            <Label htmlFor="bloq-excecao" className="text-xs">Permitir exceção do gestor</Label>
            <Switch
              id="bloq-excecao"
              checked={novoBloqueio.permite_excecao}
              onCheckedChange={(v) => setNovoBloqueio((f) => ({ ...f, permite_excecao: v }))}
            />
          </div>
        </div>
      </Card>
    </>
  );
}
