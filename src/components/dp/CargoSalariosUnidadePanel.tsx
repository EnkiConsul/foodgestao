import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Building2, Plus, Trash2, Landmark, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useDpUnidades,
  useDpSindicatos,
  useDpCargoSalarios,
  useDpPatronalPorUnidade,
  useUpsertDpCargoSalario,
  useDeleteDpCargoSalario,
} from "@/hooks/useDpCadastros";
import { moedaBR } from "@/lib/dp/cargos";
import { numeroBR } from "@/components/dp/RemuneracaoFields";
import {
  pisoDoPatronal, validarOverrideUnidade, linhaEmAberto, diaAnterior, statusVigencia,
  mensagemErroPiso, type CargoSalarioLinha,
} from "@/lib/dp/cargoSalarios";

interface Props {
  cargoId: string;
}

const dataBR = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR");

const STATUS_LABEL: Record<string, string> = {
  vigente: "vigente",
  futuro: "futuro",
  encerrado: "encerrado",
};

/**
 * Piso salarial do cargo por sindicato patronal (o patronal é da unidade), com
 * ajustes opcionais por unidade que precisam respeitar o piso do patronal.
 * Um novo valor no mesmo escopo é um reajuste: encerra a vigência anterior e
 * mantém o histórico, em vez de duplicar a linha em aberto.
 */
export function CargoSalariosUnidadePanel({ cargoId }: Props) {
  const unidades = useDpUnidades();
  const sindicatos = useDpSindicatos();
  const patronalPorUnidade = useDpPatronalPorUnidade();
  const linhas = useDpCargoSalarios(cargoId);
  const upsert = useUpsertDpCargoSalario();
  const del = useDeleteDpCargoSalario();

  const hoje = new Date().toISOString().slice(0, 10);
  const [novoPiso, setNovoPiso] = useState({ patronal_id: "", salario_base: "", vigencia_inicio: hoje });
  const [novoAjuste, setNovoAjuste] = useState({ unidade_id: "", salario_base: "", vigencia_inicio: hoje });
  const [salvando, setSalvando] = useState(false);

  const patronais = useMemo(
    () => (sindicatos.data ?? []).filter((s) => s.tipo === "patronal"),
    [sindicatos.data],
  );
  const nomePatronal = (id: string) => patronais.find((s) => s.id === id)?.nome ?? "Sindicato patronal";
  const nomeUnidade = (id: string) => (unidades.data ?? []).find((u) => u.id === id)?.nome ?? "Unidade";

  const todas = (linhas.data ?? []) as CargoSalarioLinha[];
  /** Linhas em aberto: o que vale hoje ou passará a valer. */
  const pisos = todas.filter((p) => !p.unidade_id && p.sindicato_patronal_id && !p.vigencia_fim);
  const ajustes = todas.filter((p) => !!p.unidade_id && !p.vigencia_fim);
  const historico = todas.filter((p) => !!p.vigencia_fim);

  /** Unidades por patronal, para mostrar quem compartilha cada piso. */
  const unidadesDoPatronal = (patronalId: string) =>
    (unidades.data ?? []).filter((u) => patronalPorUnidade.data?.[u.id]?.id === patronalId);

  const semPatronal = (unidades.data ?? []).filter((u) => !patronalPorUnidade.data?.[u.id]);

  const patronaisComPiso = patronais.filter((s) => pisos.some((p) => p.sindicato_patronal_id === s.id));
  const unidadesComPatronal = (unidades.data ?? []).filter((u) => !!patronalPorUnidade.data?.[u.id]);

  const pisoAbertoDoPatronal = (patronalId: string) =>
    linhaEmAberto(todas, { patronalId });
  const ajusteAbertoDaUnidade = (unidadeId: string) =>
    linhaEmAberto(todas, { unidadeId });

  /** Encerra a linha anterior (dia anterior ao novo início) e grava o novo valor. */
  const gravarComHistorico = async (
    anterior: CargoSalarioLinha | null,
    nova: {
      unidade_id: string | null;
      sindicato_patronal_id: string | null;
      salario_base: number;
      vigencia_inicio: string;
    },
  ) => {
    if (anterior?.id) {
      const fim = diaAnterior(nova.vigencia_inicio);
      if (fim < anterior.vigencia_inicio) {
        throw new Error("A nova vigência precisa começar depois do início do valor atual.");
      }
      await upsert.mutateAsync({
        id: anterior.id,
        cargo_id: cargoId,
        unidade_id: anterior.unidade_id ?? null,
        sindicato_patronal_id: anterior.sindicato_patronal_id ?? null,
        salario_base: Number(anterior.salario_base),
        vigencia_inicio: anterior.vigencia_inicio,
        vigencia_fim: fim,
      } as any);
    }
    await upsert.mutateAsync({ cargo_id: cargoId, ...nova });
  };

  const salvarPiso = async () => {
    const valor = numeroBR(novoPiso.salario_base);
    if (!novoPiso.patronal_id) return toast.error("Escolha o sindicato patronal.");
    if (!valor || valor <= 0) return toast.error("Informe o piso negociado.");
    const anterior = pisoAbertoDoPatronal(novoPiso.patronal_id);
    setSalvando(true);
    try {
      await gravarComHistorico(anterior, {
        unidade_id: null,
        sindicato_patronal_id: novoPiso.patronal_id,
        salario_base: valor,
        vigencia_inicio: novoPiso.vigencia_inicio || hoje,
      });
      setNovoPiso({ patronal_id: "", salario_base: "", vigencia_inicio: hoje });
      toast.success(anterior ? "Reajuste do piso registrado." : "Piso do sindicato patronal registrado.");
    } catch (e) {
      toast.error("Não foi possível salvar", { description: mensagemErroPiso(e) });
    } finally {
      setSalvando(false);
    }
  };

  const salvarAjuste = async () => {
    const valor = numeroBR(novoAjuste.salario_base);
    const patronalId = novoAjuste.unidade_id
      ? patronalPorUnidade.data?.[novoAjuste.unidade_id]?.id ?? null
      : null;
    if (!novoAjuste.unidade_id) return toast.error("Escolha a unidade.");
    const piso = pisoDoPatronal(todas, patronalId, novoAjuste.vigencia_inicio || hoje);
    const pisoValor = piso ? Number(piso.salario_base) : null;
    const check = validarOverrideUnidade(valor, pisoValor);
    if (check.ok === false) {
      if (check.motivo === "abaixo_do_piso") {
        return toast.error(`O valor não pode ficar abaixo do piso do patronal (${moedaBR(check.piso)}).`);
      }
      if (check.motivo === "sem_piso_patronal") {
        return toast.error("Cadastre primeiro o piso do sindicato patronal desta unidade.");
      }
      return toast.error("Informe um salário válido.");
    }

    const anterior = ajusteAbertoDaUnidade(novoAjuste.unidade_id);
    setSalvando(true);
    try {
      await gravarComHistorico(anterior, {
        unidade_id: novoAjuste.unidade_id,
        sindicato_patronal_id: patronalId,
        salario_base: valor,
        vigencia_inicio: novoAjuste.vigencia_inicio || hoje,
      });
      setNovoAjuste({ unidade_id: "", salario_base: "", vigencia_inicio: hoje });
      toast.success(anterior ? "Reajuste da unidade registrado." : "Salário da unidade registrado.");
    } catch (e) {
      toast.error("Não foi possível salvar", { description: mensagemErroPiso(e) });
    } finally {
      setSalvando(false);
    }
  };

  const remover = async (id: string) => {
    try {
      await del.mutateAsync(id);
      toast.success("Registro removido.");
    } catch (e) {
      toast.error("Não foi possível remover", { description: mensagemErroPiso(e) });
    }
  };

  const patronalSelecionadoTemPiso = !!novoPiso.patronal_id && !!pisoAbertoDoPatronal(novoPiso.patronal_id);
  const unidadeSelecionadaTemAjuste =
    !!novoAjuste.unidade_id && !!ajusteAbertoDaUnidade(novoAjuste.unidade_id);

  return (
    <div className="space-y-5">
      {/* Piso por sindicato patronal */}
      <div className="space-y-3">
        <div>
          <Label className="text-xs text-muted-foreground">Piso por sindicato patronal</Label>
          <p className="text-xs text-muted-foreground">
            O piso é negociado pelo patronal, que é vinculado à unidade. Unidades com o mesmo
            patronal usam o mesmo piso; patronais diferentes exigem cadastro próprio.
          </p>
        </div>

        {pisos.length > 0 ? (
          <ul className="divide-y rounded-lg border">
            {pisos.map((p) => {
              const compart = unidadesDoPatronal(p.sindicato_patronal_id!);
              const status = statusVigencia(p, hoje);
              return (
                <li key={p.id} className="flex items-center gap-2 p-2">
                  <Landmark className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{nomePatronal(p.sindicato_patronal_id!)}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {status === "futuro" ? "A partir de " : "Desde "}
                      {dataBR(p.vigencia_inicio)}
                      {compart.length > 0 ? ` · ${compart.map((u) => u.nome).join(", ")}` : " · sem unidades vinculadas"}
                    </p>
                  </div>
                  {status === "futuro" && <Badge variant="outline">futuro</Badge>}
                  <Badge variant="secondary" className="tabular-nums">
                    {moedaBR(Number(p.salario_base))}
                  </Badge>
                  <Button
                    size="icon" variant="ghost" className="shrink-0"
                    aria-label={`Remover piso de ${nomePatronal(p.sindicato_patronal_id!)}`}
                    onClick={() => remover(p.id!)}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nenhum piso cadastrado. Sem piso, a folha fica pendente de remuneração para este cargo.
          </p>
        )}

        <div className="grid gap-2 rounded-lg border border-dashed p-2 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
          <div>
            <Label className="text-xs">Sindicato patronal</Label>
            <Select value={novoPiso.patronal_id} onValueChange={(v) => setNovoPiso({ ...novoPiso, patronal_id: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {patronais.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.nome}
                    {patronaisComPiso.some((p) => p.id === s.id) ? " (já tem piso)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Piso</Label>
            <Input
              inputMode="decimal" placeholder="0,00" className="sm:w-28"
              value={novoPiso.salario_base}
              onChange={(e) => setNovoPiso({ ...novoPiso, salario_base: e.target.value })}
            />
          </div>
          <div>
            <Label className="text-xs">Vigência</Label>
            <Input
              type="date" className="sm:w-40"
              value={novoPiso.vigencia_inicio}
              onChange={(e) => setNovoPiso({ ...novoPiso, vigencia_inicio: e.target.value })}
            />
          </div>
          <Button onClick={salvarPiso} disabled={salvando || upsert.isPending}>
            <Plus className="size-4 mr-1" />
            {patronalSelecionadoTemPiso ? "Novo reajuste" : "Adicionar"}
          </Button>
          {patronalSelecionadoTemPiso && (
            <p className="text-xs text-muted-foreground sm:col-span-4">
              Este patronal já tem piso em aberto. O valor atual será encerrado no dia anterior à nova
              vigência e ficará no histórico.
            </p>
          )}
        </div>
      </div>

      {/* Ajuste por unidade (acima do piso) */}
      <div className="space-y-3">
        <div>
          <Label className="text-xs text-muted-foreground">Salário maior em uma unidade (opcional)</Label>
          <p className="text-xs text-muted-foreground">
            Mesmo com o patronal igual, uma unidade pode pagar mais — nunca abaixo do piso.
          </p>
        </div>

        {ajustes.length > 0 && (
          <ul className="divide-y rounded-lg border">
            {ajustes.map((p) => (
              <li key={p.id} className="flex items-center gap-2 p-2">
                <Building2 className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{nomeUnidade(p.unidade_id!)}</p>
                  <p className="text-xs text-muted-foreground">
                    {statusVigencia(p, hoje) === "futuro" ? "A partir de " : "Desde "}
                    {dataBR(p.vigencia_inicio)}
                  </p>
                </div>
                <Badge variant="secondary" className="tabular-nums">
                  {moedaBR(Number(p.salario_base))}
                </Badge>
                <Button
                  size="icon" variant="ghost" className="shrink-0"
                  aria-label={`Remover salário de ${nomeUnidade(p.unidade_id!)}`}
                  onClick={() => remover(p.id!)}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        {unidadesComPatronal.length > 0 && (
          <div className="grid gap-2 rounded-lg border border-dashed p-2 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
            <div>
              <Label className="text-xs">Unidade</Label>
              <Select value={novoAjuste.unidade_id} onValueChange={(v) => setNovoAjuste({ ...novoAjuste, unidade_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {unidadesComPatronal.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.nome}
                      {ajusteAbertoDaUnidade(u.id) ? " (já tem ajuste)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Salário</Label>
              <Input
                inputMode="decimal" placeholder="0,00" className="sm:w-28"
                value={novoAjuste.salario_base}
                onChange={(e) => setNovoAjuste({ ...novoAjuste, salario_base: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Vigência</Label>
              <Input
                type="date" className="sm:w-40"
                value={novoAjuste.vigencia_inicio}
                onChange={(e) => setNovoAjuste({ ...novoAjuste, vigencia_inicio: e.target.value })}
              />
            </div>
            <Button variant="outline" onClick={salvarAjuste} disabled={salvando || upsert.isPending}>
              <Plus className="size-4 mr-1" />
              {unidadeSelecionadaTemAjuste ? "Novo reajuste" : "Adicionar"}
            </Button>
          </div>
        )}
      </div>

      {/* Histórico de valores encerrados */}
      {historico.length > 0 && (
        <div className="space-y-2">
          <Label className="flex items-center gap-1 text-xs text-muted-foreground">
            <History className="size-3.5" /> Histórico
          </Label>
          <ul className="divide-y rounded-lg border">
            {historico.map((p) => (
              <li key={p.id} className="flex items-center gap-2 p-2 text-xs text-muted-foreground">
                <div className="min-w-0 flex-1">
                  <p className="truncate">
                    {p.unidade_id
                      ? nomeUnidade(p.unidade_id)
                      : nomePatronal(p.sindicato_patronal_id ?? "")}
                  </p>
                  <p>
                    {dataBR(p.vigencia_inicio)} a {dataBR(p.vigencia_fim!)} ·{" "}
                    {STATUS_LABEL[statusVigencia(p, hoje)]}
                  </p>
                </div>
                <Badge variant="outline" className="tabular-nums">
                  {moedaBR(Number(p.salario_base))}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      )}

      {semPatronal.length > 0 && (
        <p className="text-xs text-amber-600 dark:text-amber-500">
          Sem sindicato patronal vinculado: {semPatronal.map((u) => u.nome).join(", ")}. Vincule o
          patronal da unidade para o sistema saber qual piso aplicar.
        </p>
      )}
    </div>
  );
}
