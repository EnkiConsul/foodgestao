import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeftRight, Clock, Home, Store, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useMeuVinculoPortal } from "@/hooks/useMeuVinculoPortal";
import { toUpperCadastro } from "@/lib/text/upperCadastro";
import { nomeExibicao } from "@/lib/dp/nomeExibicao";
import { hhmm as hhmmBase } from "@/lib/dp/formato";

const hhmm = (v?: string | null) => hhmmBase(v) || null;
const SEM_TURNO = "sem-turno";

type Pessoa = {
  id: string;
  nome: string;
  cargo: string;
  setor: string | null;
  entrada: string | null;
  saida: string | null;
  origem: string | null;
  turnoChave: string;
  turnoNome: string | null;
};

const ORIGEM_LABEL: Record<string, string> = {
  escala: "Escala publicada",
  convocacao: "Convocação aceita",
  habitual: "Jornada habitual",
};

/**
 * Rotina do dia no calendário do colaborador. Somente leitura: reaproveita a RPC
 * `dp_portal_rotina_dia`, que identifica colaborador, empresa e unidade no servidor
 * e já aplica escala publicada > convocação aceita > jornada habitual.
 * Ausências de colegas nunca mostram motivo — só folgas já visíveis no calendário.
 */
const SITUACAO_FORA: Record<string, { texto: string; tom: string }> = {
  folga: { texto: "Folga", tom: "bg-amber-500/15 text-amber-700 border-amber-500/30" },
  ferias: { texto: "Férias", tom: "bg-sky-500/15 text-sky-700 border-sky-500/30" },
  ausente: { texto: "Ausente", tom: "bg-muted text-muted-foreground" },
};

export function RotinaDoDiaPanel({
  iso,
  minhaFolga,
  trocaveis = [],
  onTrocar,
}: {
  iso: string;
  /** Rótulo da minha folga no dia (vem do próprio calendário), ou null. */
  minhaFolga: string | null;
  /** Colegas de folga cuja folga pode ser trocada neste dia (regras do calendário). */
  trocaveis?: string[];
  onTrocar?: (colaboradorId: string, nome: string) => void;
}) {
  const { data: vinculo } = useMeuVinculoPortal();

  const q = useQuery({
    queryKey: ["dp_meu_rotina_loja", vinculo?.unidadeId, iso],
    enabled: !!vinculo?.unidadeId,
    queryFn: async (): Promise<Pessoa[]> => {
      const { data, error } = await supabase.rpc("dp_portal_rotina_dia", { p_data: iso });
      if (error) throw error;
      const vistos = new Set<string>();
      const out: Pessoa[] = [];
      for (const l of (data ?? []) as any[]) {
        if (!l?.colaborador_id || vistos.has(l.colaborador_id)) continue;
        vistos.add(l.colaborador_id);
        const entrada = hhmm(l.entrada);
        const saida = hhmm(l.saida);
        out.push({
          id: l.colaborador_id,
          nome: toUpperCadastro(nomeExibicao(l)),
          cargo: l.cargo || "Sem função definida",
          setor: l.setor_nome || null,
          entrada,
          saida,
          origem: l.origem ?? null,
          turnoChave: l.turno_id || (entrada ? `h:${entrada}-${saida ?? ""}` : SEM_TURNO),
          turnoNome: l.turno_nome ? toUpperCadastro(l.turno_nome) : null,
        });
      }
      return out.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    },
  });

  // Fora da operação: o servidor devolve só situação pública (folga/férias/ausente), nunca o motivo.
  const foraQ = useQuery({
    queryKey: ["dp_portal_equipe_fora_dia", vinculo?.unidadeId, iso],
    enabled: !!vinculo?.unidadeId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dp_portal_equipe_fora_dia" as any, { p_data: iso });
      if (error) throw error;
      return ((data ?? []) as any[]).map((l) => ({
        id: l.colaborador_id as string,
        nome: toUpperCadastro(nomeExibicao(l)),
        cargo: (l.cargo as string) || "Sem função definida",
        situacao: l.situacao as string,
      }));
    },
  });

  const situacaoQ = useQuery({
    queryKey: ["dp_minha_situacao_dia", vinculo?.colaboradorId, iso],
    enabled: !!vinculo?.unidadeId,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase.rpc("dp_portal_minha_situacao_dia" as any, { p_data: iso });
      if (error) throw error;
      return (data as string | null) ?? null;
    },
  });

  const lista = q.data ?? [];
  const fora = foraQ.data ?? [];
  const meuId = vinculo?.colaboradorId;
  const eu = lista.find((p) => p.id === meuId) ?? null;
  const dependeConvocacao = !!vinculo?.podeSerConvocado;

  const turnos = useMemo(() => {
    const m = new Map<string, { chave: string; nome: string; entrada: string | null; pessoas: Pessoa[] }>();
    for (const p of lista) {
      const atual = m.get(p.turnoChave);
      if (atual) { atual.pessoas.push(p); continue; }
      const horario = p.entrada && p.saida ? `${p.entrada} às ${p.saida}` : null;
      const nome = p.turnoNome ? (horario ? `${p.turnoNome} · ${horario}` : p.turnoNome) : (horario ?? "Horário a confirmar");
      m.set(p.turnoChave, { chave: p.turnoChave, nome, entrada: p.entrada, pessoas: [p] });
    }
    return Array.from(m.values()).sort((a, b) => (a.entrada ?? "99:99").localeCompare(b.entrada ?? "99:99"));
  }, [lista]);

  const usaSetores = lista.some((p) => !!p.setor);
  const grupos = (pessoas: Pessoa[]) => {
    const m = new Map<string, Pessoa[]>();
    for (const p of pessoas) {
      const k = usaSetores ? (p.setor ?? "Sem setor definido") : p.cargo;
      m.set(k, [...(m.get(k) ?? []), p]);
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0], "pt-BR"));
  };

  if (!vinculo?.unidadeId) return null;

  const minha = situacaoQ.data;
  let situacao: { texto: string; tom: string };
  if (minha === "ferias") situacao = { texto: "Minhas férias", tom: "bg-sky-500/15 text-sky-700 border-sky-500/30" };
  else if (minha === "afastado") situacao = { texto: "Estou afastado", tom: "bg-muted text-muted-foreground" };
  else if (minhaFolga) situacao = { texto: minhaFolga, tom: "bg-amber-500/15 text-amber-700 border-amber-500/30" };
  else if (eu) situacao = { texto: eu.entrada && eu.saida ? `Trabalho ${eu.entrada}–${eu.saida}` : "Trabalho previsto", tom: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30" };
  else if (dependeConvocacao) situacao = { texto: "Sem convocação aceita", tom: "bg-muted text-muted-foreground" };
  else situacao = { texto: "Sem horário previsto", tom: "bg-muted text-muted-foreground" };

  return (
    <section className="rounded-2xl border bg-card" aria-label="Rotina da loja">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2.5">
        <span className="flex min-w-0 items-center gap-1.5 text-sm font-bold">
          <Store className="h-4 w-4 shrink-0 text-primary" />
          <span className="break-words">Rotina da loja{vinculo.unidadeNome ? ` · ${vinculo.unidadeNome}` : ""}</span>
          <Badge variant="outline" className="text-[10px]">{lista.length}</Badge>
        </span>
        <Badge variant="outline" className={cn("text-[10px] uppercase", situacao.tom)}>{situacao.texto}</Badge>
      </div>
      <div className="space-y-3 p-3">
        {q.isError ? (
          <p className="text-xs text-destructive">Não foi possível carregar a equipe. Tente novamente.</p>
        ) : q.isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : turnos.length === 0 ? (
          <p className="text-xs text-muted-foreground">Ninguém previsto para trabalhar neste dia.</p>
        ) : (
          turnos.map((t) => (
            <div key={t.chave} className="overflow-hidden rounded-xl border">
              <div className="flex items-center gap-2 bg-foreground px-3 py-1.5 text-background">
                <Users className="h-3.5 w-3.5" />
                <span className="min-w-0 flex-1 break-words text-xs font-bold uppercase tracking-wide">{t.nome}</span>
                <span className="text-[10px] font-semibold">{t.pessoas.length}</span>
              </div>
              <div className="space-y-2 p-2">
                {grupos(t.pessoas).map(([titulo, pessoas]) => (
                  <div key={titulo}>
                    <p className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">{titulo}</p>
                    <ul className="space-y-1">
                      {pessoas.map((p) => {
                        const souEu = p.id === meuId;
                        return (
                          <li
                            key={p.id}
                            className={cn(
                              "flex flex-wrap items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-xs",
                              souEu ? "border-primary bg-primary/10 ring-1 ring-primary/30" : "border-border/60",
                            )}
                          >
                            <span className={cn("min-w-0 break-words", souEu ? "font-bold text-primary" : "font-medium")}>
                              {p.nome}
                              {souEu && <Badge className="ml-1.5 align-middle text-[9px]">Você</Badge>}
                              {usaSetores && <span className="block text-[10px] font-normal text-muted-foreground">{p.cargo}</span>}
                            </span>
                            <span className="flex items-center gap-1 whitespace-nowrap text-muted-foreground">
                              {souEu && <Clock className="h-3 w-3" />}
                              {p.entrada && p.saida ? `${p.entrada}–${p.saida}` : "A confirmar"}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
        {fora.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-dashed">
            <p className="flex items-center gap-1 border-b px-3 py-1.5 text-[10px] font-semibold uppercase text-muted-foreground">
              <Home className="h-3 w-3" /> Fora da operação
              <span className="ml-auto">{fora.length}</span>
            </p>
            <ul className="space-y-1 p-2">
              {fora.map((p) => {
                const souEu = p.id === meuId;
                const s = SITUACAO_FORA[p.situacao] ?? SITUACAO_FORA.ausente;
                return (
                  <li
                    key={p.id}
                    className={cn(
                      "flex flex-wrap items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-xs",
                      souEu ? "border-primary bg-primary/10 ring-1 ring-primary/30" : "border-border/60",
                    )}
                  >
                    <span className={cn("min-w-0 break-words", souEu ? "font-bold text-primary" : "font-medium")}>
                      {p.nome}
                      {souEu && <Badge className="ml-1.5 align-middle text-[9px]">Você</Badge>}
                      <span className="block text-[10px] font-normal text-muted-foreground">{p.cargo}</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Badge variant="outline" className={cn("text-[10px] uppercase", s.tom)}>{s.texto}</Badge>
                      {!souEu && p.situacao === "folga" && trocaveis.includes(p.id) && onTrocar && (
                        <Button size="sm" variant="outline" className="h-7 rounded-full px-2 text-[11px]" onClick={() => onTrocar(p.id, p.nome)}>
                          <ArrowLeftRight className="mr-1 h-3 w-3" /> Trocar
                        </Button>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
