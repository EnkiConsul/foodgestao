import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ColaboradorSetorField } from "@/components/dp/setores/ColaboradorSetorField";
import { useDpCargos, useDpUnidades } from "@/hooks/useDpCadastros";
import {
  mensagemApoioUnidade, useDpApoioUnidades, useExcluirDpApoioUnidade,
  useSalvarDpApoioUnidade,
} from "@/hooks/useDpApoioUnidades";

const SEM = "__sem__";

interface Props {
  /** Folguista / pessoa em teste. */
  pessoaApoioId?: string | null;
  /** Colaborador já cadastrado que também pode apoiar outras unidades. */
  colaboradorId?: string | null;
  /** Unidade principal, que já está disponível por natureza. */
  unidadeHabitualId?: string | null;
  /** Somente leitura quando o usuário não pode gerenciar. */
  readOnly?: boolean;
}

/**
 * Unidades em que a pessoa pode ser escalada como apoio, com cargo e setor
 * próprios de cada unidade. Não muda vínculo, contrato, remuneração nem a
 * unidade principal: é só uma liberação operacional. Desativar bloqueia novas
 * escalas sem apagar o histórico já registrado.
 */
export function ApoioUnidadesField({
  pessoaApoioId = null, colaboradorId = null, unidadeHabitualId = null, readOnly = false,
}: Props) {
  const unidades = useDpUnidades();
  const cargos = useDpCargos();
  const lista = useDpApoioUnidades({ pessoaApoioId, colaboradorId });
  const salvar = useSalvarDpApoioUnidade();
  const excluir = useExcluirDpApoioUnidade();

  const [novaUnidade, setNovaUnidade] = useState("");
  const [novoCargo, setNovoCargo] = useState("");
  const [novoSetor, setNovoSetor] = useState<string | null>(null);

  const registros = lista.data ?? [];
  const nomeUnidade = (id: string) =>
    (unidades.data ?? []).find((u) => u.id === id)?.nome ?? "Unidade";
  const nomeCargo = (id: string | null) =>
    id ? ((cargos.data ?? []).find((c) => c.id === id)?.nome ?? null) : null;

  const disponiveis = useMemo(
    () =>
      (unidades.data ?? []).filter(
        (u) =>
          u.id !== unidadeHabitualId && !registros.some((r) => r.unidade_id === u.id),
      ),
    [unidades.data, unidadeHabitualId, registros],
  );

  const adicionar = async () => {
    if (!novaUnidade) {
      toast.error("Escolha a unidade");
      return;
    }
    try {
      await salvar.mutateAsync({
        pessoa_apoio_id: pessoaApoioId,
        colaborador_id: colaboradorId,
        unidade_id: novaUnidade,
        cargo_id: novoCargo || null,
        setor_id: novoSetor,
        observacao: null,
      });
      setNovaUnidade("");
      setNovoCargo("");
      setNovoSetor(null);
      toast.success("Unidade liberada para apoio");
    } catch (e) {
      toast.error(mensagemApoioUnidade(e));
    }
  };

  const alternar = async (id: string, ativo: boolean) => {
    const atual = registros.find((r) => r.id === id);
    if (!atual) return;
    try {
      await salvar.mutateAsync({ ...atual, ativo });
    } catch (e) {
      toast.error(mensagemApoioUnidade(e));
    }
  };

  return (
    <div className="grid gap-2 rounded-md border p-3">
      <div className="grid gap-0.5">
        <Label>Pode atuar em outras unidades</Label>
        <p className="text-xs text-muted-foreground">
          Libere só as unidades onde essa pessoa realmente pode trabalhar. A unidade
          principal continua liberada e nada do contrato muda.
        </p>
      </div>

      {registros.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhuma unidade extra liberada.</p>
      ) : (
        <ul className="grid gap-2">
          {registros.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-md bg-muted/40 p-2">
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {nomeUnidade(r.unidade_id)}
              </span>
              {nomeCargo(r.cargo_id) && (
                <Badge variant="secondary" className="text-[11px]">{nomeCargo(r.cargo_id)}</Badge>
              )}
              {!r.ativo && <Badge variant="outline" className="text-[11px]">Inativa</Badge>}
              {!readOnly && (
                <>
                  <Switch
                    checked={r.ativo}
                    aria-label="Disponibilidade ativa"
                    onCheckedChange={(v) => alternar(r.id, v)}
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label="Remover unidade"
                    onClick={() => excluir.mutate(r.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {!readOnly && (
        <div className="grid gap-2 border-t pt-2 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label className="text-xs">Unidade</Label>
            <Select value={novaUnidade || SEM} onValueChange={(v) => {
              setNovaUnidade(v === SEM ? "" : v);
              setNovoSetor(null);
            }}>
              <SelectTrigger><SelectValue placeholder="Escolher" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM}>Escolher</SelectItem>
                {disponiveis.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Cargo nessa unidade</Label>
            <Select value={novoCargo || SEM} onValueChange={(v) => setNovoCargo(v === SEM ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Igual ao habitual" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM}>Igual ao habitual</SelectItem>
                {(cargos.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <ColaboradorSetorField
              unidadeId={novaUnidade || null}
              value={novoSetor}
              onChange={setNovoSetor}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            className="sm:col-span-2"
            disabled={!novaUnidade || salvar.isPending}
            onClick={adicionar}
          >
            <Plus className="mr-2 h-4 w-4" /> Liberar unidade
          </Button>
        </div>
      )}
    </div>
  );
}
