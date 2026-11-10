import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, Loader2, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { GrupoOrganizacaoInput } from "@/hooks/useDpFichaImportacao";
import { normalizeCargoNome } from "@/lib/dp/ficha-registro/cargo-match";
import {
  SETORES_FOOD, cargoGenerico, setorExistenteNaUnidade, type GrupoCargoLote, type OrganizacaoLote, type SetorCadastrado,
} from "@/lib/dp/ficha-registro/organizacao-lote";
import { cn } from "@/lib/utils";

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

  const pendentesGenericos = grupos.filter((g) => g.generico && !escolhas[g.chave]?.cargo).length;
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
  const totalFichas = grupos.reduce((s, g) => s + g.itemIds.length, 0);
  const qtdCargosNovos = novosDoLote.length;
  const qtdSetoresNovos = new Set(
    grupos
      .map((g) => escolhas[g.chave])
      .filter(Boolean)
      .map((e) => (e.setor.startsWith("novo:") ? e.setor.slice(5) : e.setor === OUTRO_SETOR ? e.setorOutro.trim() : ""))
      .filter((n) => n && !setorExistenteNaUnidade(n, setoresUnidade, unidadeId))
      .map((n) => normalizeCargoNome(n)),
  ).size;

  const salvar = () => {
    const payload: GrupoOrganizacaoInput[] = grupos.map((g) => {
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

  return (
    <div className="space-y-3">
      <Card className="bg-muted/30">
        <CardContent className="space-y-1 p-4 text-sm">
          <p className="font-semibold">{grupos.length} grupos de cargo em {totalFichas} fichas</p>
          <p className="text-muted-foreground">
            Escolha uma vez para cada cargo: todas as fichas do grupo já chegam na conferência com o cargo e o setor certos.
            {qtdCargosNovos > 0 || qtdSetoresNovos > 0
              ? ` Serão criados ${qtdCargosNovos} cargo(s) e ${qtdSetoresNovos} setor(es).`
              : ""}
          </p>
          <p className="text-xs text-muted-foreground">
            O salário de cada pessoa continua o da ficha. O piso do cargo fica no cadastro de cargos.
          </p>
        </CardContent>
      </Card>

      {grupos.map((g) => {
        const e = escolhas[g.chave];
        if (!e) return null;
        const faixa = faixaSalario(g);
        return (
          <Card key={g.chave} className={cn(g.generico && !e.cargo && "border-warning")}>
            <CardContent className="space-y-3 p-3 sm:p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  {g.generico ? (
                    <>
                      <p className="flex items-center gap-1.5 text-sm font-semibold">
                        <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
                        <span className="truncate">{g.nomes[0]}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        A ficha traz "{g.cargoNome || "sem cargo"}", que não é um cargo. Escolha o cargo real.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="truncate text-sm font-semibold">{g.cargoNome || "Cargo sem nome"}</p>
                      <p className="text-xs text-muted-foreground">
                        {[g.cbo ? `CBO ${g.cbo}` : null, faixa].filter(Boolean).join(" · ")}
                      </p>
                    </>
                  )}
                </div>
                {!g.generico && (
                  <Badge variant="secondary" className="shrink-0">
                    {g.itemIds.length} {g.itemIds.length === 1 ? "pessoa" : "pessoas"}
                  </Badge>
                )}
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">Cargo</Label>
                  <Select value={e.cargo || undefined} onValueChange={(v) => set(g.chave, { cargo: v })}>
                    <SelectTrigger className="h-10"><SelectValue placeholder="Escolha o cargo" /></SelectTrigger>
                    <SelectContent>
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
                      placeholder={g.generico ? "Nome da função real, ex.: AUXILIAR DE COZINHA" : "Nome do cargo"}
                      onChange={(ev) => set(g.chave, { cargoNome: ev.target.value })}
                    />
                  )}
                  {nomeInvalido(g) && (
                    <p className="text-xs text-destructive">
                      {e.cargo === NOVO
                        ? "Esse nome não é um cargo. Digite a função real da pessoa."
                        : "Esse cargo novo não está mais no lote. Escolha outro."}
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Setor</Label>
                  <Select value={e.setor} onValueChange={(v) => set(g.chave, { setor: v })}>
                    <SelectTrigger className="h-10"><SelectValue placeholder="Escolha o setor" /></SelectTrigger>
                    <SelectContent>
                      {setoresUnidade.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                      ))}
                      {setoresNovos.map((n) => (
                        <SelectItem key={`s-${n}`} value={`novo:${n}`}>{n} (criar)</SelectItem>
                      ))}
                      <SelectItem value={OUTRO_SETOR}>Outro setor…</SelectItem>
                      <SelectItem value={SEM_SETOR}>Sem setor</SelectItem>
                    </SelectContent>
                  </Select>
                  {e.setor === OUTRO_SETOR && (
                    <Input
                      className="h-10"
                      placeholder="Nome do setor"
                      value={e.setorOutro}
                      onChange={(ev) => set(g.chave, { setorOutro: ev.target.value })}
                    />
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}

      <div className="sticky bottom-[calc(76px+env(safe-area-inset-bottom)+0.5rem)] z-10 flex gap-2 rounded-xl border bg-card p-2 shadow-lg md:bottom-4">
        <Button variant="outline" className="h-11" onClick={onVoltar} aria-label="Voltar para unidade">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Button className="h-11 flex-1" disabled={salvando || pendentesGenericos > 0 || semNome > 0 || invalidos > 0} onClick={salvar}>
          {salvando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          {pendentesGenericos > 0
            ? `Escolha o cargo de ${pendentesGenericos} ficha(s)`
            : semNome > 0
              ? `Digite o nome de ${semNome} cargo(s) novo(s)`
              : invalidos > 0
                ? "Corrija os cargos destacados"
                : "Salvar e vincular ao lote"}
        </Button>
      </div>
    </div>
  );
}
