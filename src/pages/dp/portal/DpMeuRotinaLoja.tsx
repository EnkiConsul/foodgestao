import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Store, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DpEmptyState, DpFilterCard, DpPage, DpPageHeader } from "@/components/dp/DpPage";
import { DpErrorState } from "@/components/dp/DpErrorState";
import { CardListSkeleton } from "@/components/dp/DpSkeletons";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMeuVinculoPortal } from "@/hooks/useMeuVinculoPortal";
import { toUpperCadastro } from "@/lib/text/upperCadastro";
import { nomeExibicao } from "@/lib/dp/nomeExibicao";
import { hojeIsoLocal } from "@/lib/dp/dataLocal";
import { hhmm as hhmmBase } from "@/lib/dp/formato";

const hhmm = (v?: string | null) => hhmmBase(v) || null;

type Pessoa = {
  id: string;
  nome: string;
  cargo: string;
  setor: string | null;
  entrada: string | null;
  saida: string | null;
  turnoChave: string;
  turnoNome: string | null;
};

const hojeIso = () => hojeIsoLocal();

const SEM_TURNO = "sem-turno";

/** Rotina da loja: quem trabalha no dia, separado por turno. Somente leitura. */
export default function DpMeuRotinaLoja() {
  const { data: vinculo } = useMeuVinculoPortal();
  const [data, setData] = useState(hojeIso);
  const [turnoSelecionado, setTurnoSelecionado] = useState<string | null>(null);

  const escala = useQuery({
    queryKey: ["dp_meu_rotina_loja", vinculo?.unidadeId, data],
    enabled: !!vinculo?.unidadeId,
    queryFn: async (): Promise<Pessoa[]> => {
      // Uma única consulta segura: usa a escala publicada e, quando o mês ainda
      // não foi publicado, monta a equipe pelo horário habitual de cada colega.
      const { data: linhas, error } = await supabase.rpc("dp_portal_rotina_dia", {
        p_data: data,
      });
      if (error) throw error;
      const vistos = new Set<string>();
      const out: Pessoa[] = [];
      for (const l of (linhas ?? []) as any[]) {
        if (!l?.colaborador_id || vistos.has(l.colaborador_id)) continue;
        vistos.add(l.colaborador_id);
        const entrada = hhmm(l.entrada);
        const saida = hhmm(l.saida);
        const turnoNome = l.turno_nome ? toUpperCadastro(l.turno_nome) : null;
        out.push({
          id: l.colaborador_id,
          nome: toUpperCadastro(nomeExibicao(l)),
          cargo: l.cargo || "Sem função definida",
          setor: l.setor_nome || null,
          entrada,
          saida,
          turnoChave: l.turno_id || (entrada ? `h:${entrada}-${saida ?? ""}` : SEM_TURNO),
          turnoNome,
        });
      }
      return out.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    },
  });

  const lista = escala.data ?? [];

  /** Turnos do dia, com rótulo e horário, ordenados pelo início. */
  const turnos = useMemo(() => {
    const m = new Map<string, { chave: string; nome: string; entrada: string | null; pessoas: Pessoa[] }>();
    for (const p of lista) {
      const atual = m.get(p.turnoChave);
      if (atual) {
        atual.pessoas.push(p);
        continue;
      }
      const horario = p.entrada && p.saida ? `${p.entrada} às ${p.saida}` : null;
      const nome = p.turnoNome ? (horario ? `${p.turnoNome} · ${horario}` : p.turnoNome) : (horario ?? "Horário a confirmar");
      m.set(p.turnoChave, { chave: p.turnoChave, nome, entrada: p.entrada, pessoas: [p] });
    }
    return Array.from(m.values()).sort((a, b) =>
      (a.entrada ?? "99:99").localeCompare(b.entrada ?? "99:99"),
    );
  }, [lista]);

  const meuTurno = useMemo(
    () => lista.find((p) => p.id === vinculo?.colaboradorId)?.turnoChave ?? null,
    [lista, vinculo?.colaboradorId],
  );

  // Por padrão o colaborador vê apenas o turno dele.
  useEffect(() => {
    setTurnoSelecionado(meuTurno);
  }, [meuTurno, data]);

  const turnosVisiveis = useMemo(() => {
    if (!turnoSelecionado) return turnos;
    const so = turnos.filter((t) => t.chave === turnoSelecionado);
    return so.length > 0 ? so : turnos;
  }, [turnos, turnoSelecionado]);

  const pessoasVisiveis = useMemo(
    () => turnosVisiveis.flatMap((t) => t.pessoas),
    [turnosVisiveis],
  );

  /**
   * Como no painel do gestor: quando a loja usa setores, a equipe é agrupada por
   * setor dentro do turno; sem setor cadastrado, continua agrupada por função.
   */
  const usaSetores = useMemo(() => pessoasVisiveis.some((p) => !!p.setor), [pessoasVisiveis]);

  const gruposDoTurno = (pessoas: Pessoa[]) => {
    const m = new Map<string, Pessoa[]>();
    for (const p of pessoas) {
      const chave = usaSetores ? (p.setor ?? "Sem setor definido") : p.cargo;
      const atual = m.get(chave) ?? [];
      atual.push(p);
      m.set(chave, atual);
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0], "pt-BR"));
  };

  return (
    <DpPage>
      <DpPageHeader
        icon={Store}
        title="Rotina da loja"
        description={
          vinculo?.unidadeNome
            ? `Equipe escalada em ${vinculo.unidadeNome}`
            : "Equipe escalada na sua unidade"
        }
      />
      <DpFilterCard>
        <div className="max-w-xs">
          <Label className="text-xs">Dia</Label>
          <Input type="date" value={data} onChange={(e) => setData(e.target.value || hojeIso())} />
        </div>
      </DpFilterCard>

      {!vinculo?.unidadeId ? (
        <DpEmptyState icon={Store}>
          Seu cadastro ainda não tem uma unidade definida. Fale com o responsável pela sua loja.
        </DpEmptyState>
      ) : escala.isError ? (
        <DpErrorState onRetry={() => escala.refetch()} />
      ) : escala.isLoading ? (
        <CardListSkeleton rows={3} />
      ) : turnos.length === 0 ? (
        <DpEmptyState icon={Users}>Nenhuma equipe prevista para este dia.</DpEmptyState>
      ) : (
        <div className="space-y-4">
          {turnos.length > 1 && meuTurno ? (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={turnoSelecionado ? "default" : "outline"}
                onClick={() => setTurnoSelecionado(meuTurno)}
              >
                Meu turno
              </Button>
              <Button
                size="sm"
                variant={turnoSelecionado ? "outline" : "default"}
                onClick={() => setTurnoSelecionado(null)}
              >
                Todos os turnos do dia
              </Button>
            </div>
          ) : null}

          {turnosVisiveis.map((turno) => (
            <Card key={turno.chave} className="dp-content-card">
              <CardContent className="p-4">
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <Users className="size-4 text-primary" />
                  <p className="font-medium min-w-0 break-words">{turno.nome}</p>
                  <Badge variant="outline">{turno.pessoas.length}</Badge>
                  {turno.chave === meuTurno ? <Badge>Meu turno</Badge> : null}
                </div>
                <div className="space-y-3">
                  {gruposDoTurno(turno.pessoas).map(([titulo, pessoas]) => (
                    <div key={titulo}>
                      <p className="text-xs uppercase text-muted-foreground mb-1">{titulo}</p>
                      <ul className="space-y-2">
                        {pessoas.map((p) => (
                          <li
                            key={p.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 px-3 py-2"
                          >
                            <span className="text-sm min-w-0 break-words">
                              {p.nome}
                              {usaSetores ? (
                                <span className="block text-xs text-muted-foreground">{p.cargo}</span>
                              ) : null}
                            </span>
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              {p.entrada && p.saida
                                ? `${p.entrada} às ${p.saida}`
                                : "Horário a confirmar"}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </DpPage>
  );
}
