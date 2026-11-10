import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, Loader2, Pencil, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { GrupoOrganizacaoInput } from "@/hooks/useDpFichaImportacao";
import { normalizeCargoNome } from "@/lib/dp/ficha-registro/cargo-match";
import {
  SETORES_FOOD, cargoGenerico, setorExistenteNaUnidade, type GrupoCargoLote, type OrganizacaoLote, type SetorCadastrado,
} from "@/lib/dp/ficha-registro/organizacao-lote";

const NOVO = "__novo";
const SEM_SETOR = "__none";
const OUTRO_SETOR = "__outro";

type Escolha = { cargo: string; cargoNome: string; setor: string; setorOutro: string };

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function faixaSalario(g: GrupoCargoLote): string | null {
  if (g.salarioMin === null) return null;
  if (g.salarioMax === null || g.salarioMax === g.salarioMin) return brl(g.salarioMin);
  return `${brl(g.salarioMin)} a ${brl(g.salarioMax)}`;
}

interface Props {
  grupos: GrupoCargoLote[];
  cargos: Array<{ id: string; nome: string; cbo?: string | null }>;
  setores: SetorCadastrado[];
  unidadeId: string;
  organizacao: OrganizacaoLote | null;
  salvando: boolean;
  onVoltar: () => void;
  onSalvar: (grupos: GrupoOrganizacaoInput[]) => void;
}

/** Etapa 2: decide cargo e setor uma vez por grupo; todas as fichas do grupo herdam. */
export function FichaLoteCargos({ grupos, cargos, setores, unidadeId, organizacao, salvando, onVoltar, onSalvar }: Props) {
  const setoresUnidade = useMemo(() => setores.filter((s) => s.unidade_id === unidadeId), [setores, unidadeId]);

  const inicial = (g: GrupoCargoLote): Escolha => {
    const salvo = g.generico ? organizacao?.itens?.[g.itemIds[0]] : organizacao?.grupos?.[g.chave];
    const cargoSalvo = salvo?.cargo_id && cargos.some((c) => c.id === salvo.cargo_id) ? salvo.cargo_id : null;
    const setorSalvo = salvo?.setor_id && setoresUnidade.some((s) => s.id === salvo.setor_id) ? salvo.setor_id : null;
    const existente = setorExistenteNaUnidade(g.setorSugerido, setoresUnidade, unidadeId);
    return {
      cargo: cargoSalvo ?? g.cargoExistenteId ?? (g.generico ? "" : NOVO),
      cargoNome: g.generico ? "" : g.cargoNome.toUpperCase(),
      setor: setorSalvo ?? existente?.id ?? (g.setorSugerido ? `novo:${g.setorSugerido}` : SEM_SETOR),
      setorOutro: "",
    };
  };

  const [escolhas, setEscolhas] = useState<Record<string, Escolha>>({});
  useEffect(() => {
    setEscolhas((prev) => {
      const next = { ...prev };
      for (const g of grupos) if (!next[g.chave]) next[g.chave] = inicial(g);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grupos, cargos.length, setoresUnidade.length]);

  const set = (chave: string, patch: Partial<Escolha>) =>
    setEscolhas((p) => ({ ...p, [chave]: { ...p[chave], ...patch } }));

  /** Cargos que serão criados nesta etapa: as fichas genéricas também podem escolhê-los. */
  const novosDoLote = useMemo(() => {
    const nomes = new Set<string>();
    for (const g of grupos) {
      const e = escolhas[g.chave];
      const nome = e?.cargo === NOVO ? e.cargoNome.trim().toUpperCase() : "";
      if (nome && !cargoGenerico(nome)) nomes.add(nome);
    }
    return [...nomes].filter((n) => !cargos.some((c) => normalizeCargoNome(c.nome) === normalizeCargoNome(n)));
  }, [grupos, escolhas, cargos]);
  /** Novos cargos vindos de outros grupos (o próprio grupo já tem o campo digitado). */
  const novosDeOutros = (chave: string) => {
    const proprio = escolhas[chave]?.cargo === NOVO ? escolhas[chave].cargoNome.trim().toUpperCase() : "";
    return novosDoLote.filter((n) => n !== proprio);
  };

  const setoresNovos = SETORES_FOOD.filter((n) => !setorExistenteNaUnidade(n, setoresUnidade, unidadeId));

  const genericos = grupos.filter((g) => g.generico);
  const comCargo = grupos.filter((g) => !g.generico);
  /** Fichas sem cargo que ficam para a conferência individual (não travam o salvamento). */
  const paraDepois = genericos.filter((g) => !escolhas[g.chave]?.cargo).length;
  const semNome = grupos.filter((g) => escolhas[g.chave]?.cargo === NOVO && !escolhas[g.chave]?.cargoNome.trim()).length;
  /** Nome digitado que não é cargo (ex.: "Importação eSocial") ou cargo novo que deixou de existir. */
  const nomeInvalido = (g: GrupoCargoLote) => {
    const e = escolhas[g.chave];
    if (!e) return false;
    if (e.cargo === NOVO) return !!e.cargoNome.trim() && cargoGenerico(e.cargoNome);
    if (e.cargo.startsWith("nome:")) return !novosDoLote.includes(e.cargo.slice(5));
    return false;
  };
  const invalidos = grupos.filter(nomeInvalido).length;
  const fichasComCargo = comCargo.reduce((s, g) => s + g.itemIds.length, 0);
  const qtdCargosNovos = novosDoLote.length;
  const qtdSetoresNovos = new Set(
    grupos
      .map((g) => escolhas[g.chave])
      .filter(Boolean)
      .map((e) => (e.setor.startsWith("novo:") ? e.setor.slice(5) : e.setor === OUTRO_SETOR ? e.setorOutro.trim() : ""))
      .filter((n) => n && !setorExistenteNaUnidade(n, setoresUnidade, unidadeId))
      .map((n) => normalizeCargoNome(n)),
  ).size;
  const [ajustando, setAjustando] = useState<string | null>(null);

  const salvar = () => {
    const payload: GrupoOrganizacaoInput[] = grupos
      .filter((g) => !g.generico || !!(escolhas[g.chave] ?? inicial(g)).cargo)
      .map((g) => {
      const e = escolhas[g.chave] ?? inicial(g);
      const base: GrupoOrganizacaoInput = g.generico ? { item_ids: g.itemIds } : { chave: g.chave };
      if (e.cargo === NOVO) {
        base.cargo_nome = e.cargoNome.trim();
        base.cbo = g.cbo;
      } else if (e.cargo.startsWith("nome:")) {
        base.cargo_nome = e.cargo.slice(5);
      } else if (e.cargo) {
        base.cargo_id = e.cargo;
      }
      if (e.setor.startsWith("novo:")) base.setor_nome = e.setor.slice(5);
      else if (e.setor === OUTRO_SETOR) base.setor_nome = e.setorOutro.trim() || null;
      else if (e.setor !== SEM_SETOR) base.setor_id = e.setor;
      return base;
    });
    onSalvar(payload);
  };

  const seletorCargo = (g: GrupoCargoLote, e: Escolha) => (
    <div className="space-y-1">
      <Select
        value={e.cargo || (g.generico ? "__depois" : undefined)}
        onValueChange={(v) => set(g.chave, { cargo: v === "__depois" ? "" : v })}
      >
        <SelectTrigger className="h-10" aria-label={`Cargo de ${g.generico ? g.nomes[0] : g.cargoNome}`}>
          <SelectValue placeholder="Escolha o cargo" />
        </SelectTrigger>
        <SelectContent>
          {g.generico && <SelectItem value="__depois">Definir na conferência</SelectItem>}
          <SelectItem value={NOVO}>Criar cargo novo</SelectItem>
          {g.generico && novosDeOutros(g.chave).map((n) => (
            <SelectItem key={`n-${n}`} value={`nome:${n}`}>{n} (novo)</SelectItem>
          ))}
          {cargos.map((c) => (
            <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {e.cargo === NOVO && (
        <Input
          className="h-10"
          value={e.cargoNome}
          aria-label="Nome do cargo novo"
          placeholder={g.generico ? "Função real, ex.: AUXILIAR DE COZINHA" : "Nome do cargo"}
          onChange={(ev) => set(g.chave, { cargoNome: ev.target.value })}
        />
      )}
      {nomeInvalido(g) && (
        <p className="text-xs text-destructive">
          {e.cargo === NOVO ? "Esse nome não é um cargo. Digite a função real." : "Esse cargo novo saiu do lote. Escolha outro."}
        </p>
      )}
    </div>
  );

  const seletorSetor = (g: GrupoCargoLote, e: Escolha) => (
    <div className="space-y-1">
      <Select value={e.setor} onValueChange={(v) => set(g.chave, { setor: v })}>
        <SelectTrigger className="h-9 text-xs" aria-label={`Setor de ${g.generico ? g.nomes[0] : g.cargoNome}`}>
          <SelectValue placeholder="Setor" />
        </SelectTrigger>
        <SelectContent>
          {setoresUnidade.map((s) => (
            <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
          ))}
          {setoresNovos.map((n) => (
            <SelectItem key={`s-${n}`} value={`novo:${n}`}>{n}</SelectItem>
          ))}
          <SelectItem value={OUTRO_SETOR}>Outro setor…</SelectItem>
          <SelectItem value={SEM_SETOR}>Sem setor</SelectItem>
        </SelectContent>
      </Select>
      {e.setor === OUTRO_SETOR && (
        <Input
          className="h-9"
          placeholder="Nome do setor"
          value={e.setorOutro}
          onChange={(ev) => set(g.chave, { setorOutro: ev.target.value })}
        />
      )}
    </div>
  );

  const nomeDoCargo = (g: GrupoCargoLote, e: Escolha) => {
    if (e.cargo === NOVO) return e.cargoNome.trim() || g.cargoNome;
    if (e.cargo.startsWith("nome:")) return e.cargo.slice(5);
    return cargos.find((c) => c.id === e.cargo)?.nome ?? g.cargoNome;
  };

  return (
    <div className="space-y-3">
      <p className="px-1 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{comCargo.length} cargos</span> em {fichasComCargo} fichas.
        Confira o setor de cada um e salve.
      </p>

      {comCargo.length > 0 && (
        <Card>
          <CardContent className="divide-y p-0">
            {comCargo.map((g) => {
              const e = escolhas[g.chave];
              if (!e) return null;
              const faixa = faixaSalario(g);
              const aberto = ajustando === g.chave;
              const novo = e.cargo === NOVO || e.cargo.startsWith("nome:");
              return (
                <div key={g.chave} className="space-y-2 px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => setAjustando(aberto ? null : g.chave)}
                      aria-expanded={aberto}
                    >
                      <p className="flex items-center gap-1.5 text-sm font-medium">
                        <span className="truncate">{nomeDoCargo(g, e) || "Cargo sem nome"}</span>
                        <Pencil className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[
                          `${g.itemIds.length} ${g.itemIds.length === 1 ? "pessoa" : "pessoas"}`,
                          faixa,
                          novo ? "novo" : "já cadastrado",
                        ].filter(Boolean).join(" · ")}
                      </p>
                    </button>
                    <div className="w-36 shrink-0 sm:w-48">{seletorSetor(g, e)}</div>
                  </div>
                  {aberto && <div className="pb-1">{seletorCargo(g, e)}</div>}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {genericos.length > 0 && (
        <Card className="border-warning/50">
          <CardContent className="space-y-3 p-3">
            <div className="flex gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {genericos.length} {genericos.length === 1 ? "ficha sem cargo" : "fichas sem cargo"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Se não souber agora, deixe para a conferência: quem concluir o cadastro escolhe o cargo.
                </p>
              </div>
            </div>
            {genericos.map((g) => {
              const e = escolhas[g.chave];
              if (!e) return null;
              return (
                <div key={g.chave} className="space-y-1.5 rounded-lg bg-muted/30 p-2">
                  <p className="truncate text-sm font-medium">{g.nomes[0]}</p>
                  <div className="grid gap-2 sm:grid-cols-[1fr_12rem]">
                    {seletorCargo(g, e)}
                    {e.cargo ? seletorSetor(g, e) : null}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {(qtdCargosNovos > 0 || qtdSetoresNovos > 0) && (
        <p className="px-1 text-xs text-muted-foreground">
          Ao salvar: {qtdCargosNovos} {qtdCargosNovos === 1 ? "cargo novo" : "cargos novos"} e {qtdSetoresNovos}{" "}
          {qtdSetoresNovos === 1 ? "setor novo" : "setores novos"}. O salário de cada pessoa continua o da ficha.
        </p>
      )}

      <div className="sticky bottom-[calc(76px+env(safe-area-inset-bottom)+0.5rem)] z-10 flex gap-2 rounded-xl border bg-card p-2 shadow-lg md:bottom-4">
        <Button variant="outline" className="h-11" onClick={onVoltar} aria-label="Voltar para unidade">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Button className="h-11 flex-1" disabled={salvando || semNome > 0 || invalidos > 0} onClick={salvar}>
          {salvando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          {semNome > 0
            ? `Digite o nome de ${semNome} cargo(s) novo(s)`
            : invalidos > 0
              ? "Corrija os cargos destacados"
              : paraDepois > 0
                ? `Salvar · ${paraDepois} para a conferência`
                : "Salvar e vincular ao lote"}
        </Button>
      </div>
    </div>
  );
}
