import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Clock, Home, Store, Users } from "lucide-react";
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
export function RotinaDoDiaPanel({
  iso,
  minhaFolga,
  colegasDeFolga,
}: {
  iso: string;
  /** Rótulo da minha folga no dia (vem do próprio calendário), ou null. */
  minhaFolga: string | null;
  /** Colegas de folga no dia, já exibidos no calendário. */
  colegasDeFolga: string[];
}) {
  const { data: vinculo } = useMeuVinculoPortal();
  const [aberto, setAberto] = useState(false);

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

  const lista = q.data ?? [];
  const eu = lista.find((p) => p.id === vinculo?.colaboradorId) ?? null;
  const colegas = lista.filter((p) => p.id !== vinculo?.colaboradorId);
  const dependeConvocacao = !!vinculo?.podeSerConvocado;

  const turnos = useMemo(() => {
    const m = new Map<string, { chave: string; nome: string; entrada: string | null; pessoas: Pessoa[] }>();
    for (const p of colegas) {
      const atual = m.get(p.turnoChave);
      if (atual) { atual.pessoas.push(p); continue; }
      const horario = p.entrada && p.saida ? `${p.entrada} às ${p.saida}` : null;
      const nome = p.turnoNome ? (horario ? `${p.turnoNome} · ${horario}` : p.turnoNome) : (horario ?? "Horário a confirmar");
      m.set(p.turnoChave, { chave: p.turnoChave, nome, entrada: p.entrada, pessoas: [p] });
    }
    return Array.from(m.values()).sort((a, b) => (a.entrada ?? "99:99").localeCompare(b.entrada ?? "99:99"));
  }, [colegas]);

  const usaSetores = colegas.some((p) => !!p.setor);
  const grupos = (pessoas: Pessoa[]) => {
    const m = new Map<string, Pessoa[]>();
    for (const p of pessoas) {
      const k = usaSetores ? (p.setor ?? "Sem setor definido") : p.cargo;
      m.set(k, [...(m.get(k) ?? []), p]);
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0], "pt-BR"));
  };

  if (!vinculo?.unidadeId) return null;

  // Minha situação: folga vem do calendário; trabalho só se a RPC me retornou.
  let situacao: { texto: string; tom: string };
  if (minhaFolga) situacao = { texto: minhaFolga, tom: "bg-amber-500/15 text-amber-700 border-amber-500/30" };
  else if (eu) situacao = { texto: "Trabalho previsto", tom: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30" };
  else if (dependeConvocacao) situacao = { texto: "Sem convocação aceita", tom: "bg-muted text-muted-foreground" };
  else situacao = { texto: "Sem horário previsto", tom: "bg-muted text-muted-foreground" };

  return (
    <section className="space-y-3" aria-label="Rotina do dia">
      <div className="rounded-2xl border border-primary/30 bg-primary/5 p-3 text-sm space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-bold flex items-center gap-1.5"><Clock className="h-4 w-4 text-primary" /> Minha rotina</span>
          <Badge variant="outline" className={cn("text-[10px] uppercase", situacao.tom)}>{situacao.texto}</Badge>
        </div>
        {q.isLoading ? (
          <Skeleton className="h-10 w-full" />
        ) : (
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            <dt className="text-muted-foreground">Unidade</dt>
            <dd className="font-medium break-words">{vinculo.unidadeNome ?? "—"}</dd>
            {eu && (<>
              <dt className="text-muted-foreground">Setor · Função</dt>
              <dd className="font-medium break-words">{[eu.setor, eu.cargo].filter(Boolean).join(" · ")}</dd>
              <dt className="text-muted-foreground">Turno</dt>
              <dd className="font-medium break-words">{eu.turnoNome ?? "—"}</dd>
              <dt className="text-muted-foreground">Horário</dt>
              <dd className="font-medium">{eu.entrada && eu.saida ? `${eu.entrada} às ${eu.saida}` : "A confirmar"}</dd>
              <dt className="text-muted-foreground">Origem</dt>
              <dd className="font-medium">{ORIGEM_LABEL[eu.origem ?? ""] ?? "—"}</dd>
            </>)}
          </dl>
        )}
      </div>

      <div className="rounded-2xl border bg-card">
        <Button
          type="button"
          variant="ghost"
          className="w-full justify-between rounded-2xl px-3"
          onClick={() => setAberto((v) => !v)}
          aria-expanded={aberto}
        >
          <span className="flex items-center gap-1.5 font-bold text-sm">
            <Store className="h-4 w-4 text-primary" /> Rotina da loja
            <Badge variant="outline" className="text-[10px]">{colegas.length}</Badge>
          </span>
          <ChevronDown className={cn("h-4 w-4 transition-transform", aberto && "rotate-180")} />
        </Button>
        {aberto && (
          <div className="space-y-3 px-3 pb-3">
            {q.isError ? (
              <p className="text-xs text-destructive">Não foi possível carregar a equipe. Tente novamente.</p>
            ) : q.isLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : turnos.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum colega previsto para este dia.</p>
            ) : (
              turnos.map((t) => (
                <div key={t.chave} className="rounded-xl border overflow-hidden">
                  <div className="flex items-center gap-2 bg-foreground px-3 py-1.5 text-background">
                    <Users className="h-3.5 w-3.5" />
                    <span className="text-xs font-bold uppercase tracking-wide min-w-0 break-words flex-1">{t.nome}</span>
                    <span className="text-[10px] font-semibold">{t.pessoas.length}</span>
                    {eu && t.chave === eu.turnoChave && <Badge className="text-[9px]">Meu turno</Badge>}
                  </div>
                  <div className="space-y-2 p-2">
                    {grupos(t.pessoas).map(([titulo, pessoas]) => (
                      <div key={titulo}>
                        <p className="text-[10px] font-semibold uppercase text-muted-foreground mb-1">{titulo}</p>
                        <ul className="space-y-1">
                          {pessoas.map((p) => (
                            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 px-2 py-1.5 text-xs">
                              <span className="min-w-0 break-words font-medium">
                                {p.nome}
                                {usaSetores && <span className="block text-[10px] font-normal text-muted-foreground">{p.cargo}</span>}
                              </span>
                              <span className="text-muted-foreground whitespace-nowrap">
                                {p.entrada && p.saida ? `${p.entrada}–${p.saida}` : "A confirmar"}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
            {colegasDeFolga.length > 0 && (
              <div className="rounded-xl border border-dashed p-2">
                <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase text-muted-foreground">
                  <Home className="h-3 w-3" /> De folga
                </p>
                <p className="text-xs break-words">{colegasDeFolga.join(", ")}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
