import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ColaboradorSetorField } from "@/components/dp/setores/ColaboradorSetorField";
import { useDpUnidades } from "@/hooks/useDpCadastros";
import {
  mensagemApoioUnidade, useDpApoioUnidades, useExcluirDpApoioUnidade,
  useSalvarDpApoioUnidade, type HorarioUnidadeJson,
} from "@/hooks/useDpApoioUnidades";
import { condicoesDoSocio, proLaboreTotal } from "@/lib/dp/socio-unidades";
import { moedaBR } from "@/lib/dp/cargos";

const SEM = "__sem__";
const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const paraNumero = (v: string): number | null => {
  const n = Number(v.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
};

interface Props {
  colaboradorId: string;
  /** Unidade principal do sócio: já faz parte da sociedade por natureza. */
  unidadePrincipalId?: string | null;
  setorPrincipalId?: string | null;
  cargoId?: string | null;
  /** Pró-labore da unidade principal, para o total. */
  proLaborePrincipal?: number | null;
  readOnly?: boolean;
}

/**
 * Sociedades do sócio em outras unidades da mesma empresa. Em cada unidade o
 * setor habitual, o horário e o pró-labore podem ser diferentes; o que ficar em
 * branco herda a unidade principal. Não duplica cadastro: é a mesma pessoa.
 */
export function SocioUnidadesField({
  colaboradorId, unidadePrincipalId = null, setorPrincipalId = null, cargoId = null,
  proLaborePrincipal = null, readOnly = false,
}: Props) {
  const unidades = useDpUnidades();
  const lista = useDpApoioUnidades({ colaboradorId, apenasSocio: true });
  const salvar = useSalvarDpApoioUnidade();
  const excluir = useExcluirDpApoioUnidade();

  const [novaUnidade, setNovaUnidade] = useState("");
  const [novoSetor, setNovoSetor] = useState<string | null>(null);
  const [novoProLabore, setNovoProLabore] = useState("");
  const [entrada, setEntrada] = useState("");
  const [saida, setSaida] = useState("");
  const [dias, setDias] = useState<number[]>([1, 2, 3, 4, 5]);

  const registros = lista.data ?? [];
  const nomeUnidade = (id: string) =>
    (unidades.data ?? []).find((u) => u.id === id)?.nome ?? "Unidade";

  const disponiveis = useMemo(
    () =>
      (unidades.data ?? []).filter(
        (u) => u.id !== unidadePrincipalId && !registros.some((r) => r.unidade_id === u.id),
      ),
    [unidades.data, unidadePrincipalId, registros],
  );

  const base = {
    unidade_id: unidadePrincipalId,
    setor_id: setorPrincipalId,
    cargo_id: cargoId,
    pro_labore: proLaborePrincipal,
  };
  const condicoes = condicoesDoSocio(base, registros);
  const total = proLaboreTotal(base, registros);

  const horarioNovo = (): HorarioUnidadeJson[] | null => {
    if (!entrada && !saida) return null;
    return DIAS.map((_, dow) => ({
      dow,
      trabalha: dias.includes(dow),
      entrada: dias.includes(dow) ? entrada || null : null,
      saida: dias.includes(dow) ? saida || null : null,
    }));
  };

  const adicionar = async () => {
    if (!novaUnidade) {
      toast.error("Escolha a unidade");
      return;
    }
    try {
      await salvar.mutateAsync({
        pessoa_apoio_id: null,
        colaborador_id: colaboradorId,
        unidade_id: novaUnidade,
        cargo_id: cargoId ?? null,
        setor_id: novoSetor,
        observacao: null,
        socio: true,
        pro_labore: paraNumero(novoProLabore),
        horario: horarioNovo(),
      });
      setNovaUnidade("");
      setNovoSetor(null);
      setNovoProLabore("");
      setEntrada("");
      setSaida("");
      toast.success("Sociedade adicionada");
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
        <Label>Sociedade em outras unidades</Label>
        <p className="text-xs text-muted-foreground">
          O sócio pode participar de mais de uma unidade. Em cada uma o setor, o horário e o
          pró-labore podem ser diferentes; o que ficar em branco segue a unidade principal.
        </p>
      </div>

      {registros.length === 0 ? (
        <p className="text-xs text-muted-foreground">Somente a unidade principal.</p>
      ) : (
        <ul className="grid gap-2">
          {registros.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-md bg-muted/40 p-2">
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {nomeUnidade(r.unidade_id)}
              </span>
              <Badge variant="secondary" className="text-[11px]">
                {r.pro_labore ? moedaBR(Number(r.pro_labore)) : "Pró-labore da principal"}
              </Badge>
              {!r.horario?.length && (
                <Badge variant="outline" className="text-[11px]">Horário da principal</Badge>
              )}
              {!r.ativo && <Badge variant="outline" className="text-[11px]">Encerrada</Badge>}
              {!readOnly && (
                <>
                  <Switch
                    checked={r.ativo}
                    aria-label="Sociedade ativa"
                    onCheckedChange={(v) => alternar(r.id, v)}
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label="Remover sociedade"
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

      {condicoes.length > 1 && (
        <p className="text-xs text-muted-foreground">
          Pró-labore somado nas {condicoes.length} unidades: <strong>{moedaBR(total)}</strong>
        </p>
      )}

      {!readOnly && (
        <div className="grid gap-2 border-t pt-2 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label className="text-xs">Unidade</Label>
            <Select
              value={novaUnidade || SEM}
              onValueChange={(v) => { setNovaUnidade(v === SEM ? "" : v); setNovoSetor(null); }}
            >
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
            <Label className="text-xs">Pró-labore nessa unidade</Label>
            <Input
              inputMode="decimal"
              placeholder="Igual à principal"
              value={novoProLabore}
              onChange={(e) => setNovoProLabore(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <ColaboradorSetorField
              unidadeId={novaUnidade || null}
              value={novoSetor}
              onChange={setNovoSetor}
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Entrada</Label>
            <Input type="time" value={entrada} onChange={(e) => setEntrada(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Saída</Label>
            <Input type="time" value={saida} onChange={(e) => setSaida(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-1 sm:col-span-2">
            {DIAS.map((d, dow) => (
              <Button
                key={d}
                type="button"
                size="sm"
                variant={dias.includes(dow) ? "default" : "outline"}
                onClick={() =>
                  setDias((ds) => (ds.includes(dow) ? ds.filter((x) => x !== dow) : [...ds, dow]))
                }
              >
                {d}
              </Button>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            className="sm:col-span-2"
            disabled={!novaUnidade || salvar.isPending}
            onClick={adicionar}
          >
            <Plus className="mr-2 h-4 w-4" /> Adicionar sociedade
          </Button>
        </div>
      )}
    </div>
  );
}
