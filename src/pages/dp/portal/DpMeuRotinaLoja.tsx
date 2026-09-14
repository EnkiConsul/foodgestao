import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Store, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DpEmptyState, DpFilterCard, DpPage, DpPageHeader } from "@/components/dp/DpPage";
import { DpErrorState } from "@/components/dp/DpErrorState";
import { CardListSkeleton } from "@/components/dp/DpSkeletons";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMeuVinculoPortal } from "@/hooks/useMeuVinculoPortal";
import { toUpperCadastro } from "@/lib/text/upperCadastro";
import { nomeExibicao } from "@/lib/dp/nomeExibicao";
import { hojeIsoLocal, horariosSobrepostos } from "@/lib/dp/dataLocal";
import { hhmm as hhmmBase } from "@/lib/dp/formato";

const hhmm = (v?: string | null) => hhmmBase(v) || null;

type Pessoa = {
  id: string;
  nome: string;
  cargo: string;
  setor: string | null;
  entrada: string | null;
  saida: string | null;
};

const hojeIso = () => hojeIsoLocal();

/** Rotina da loja: quem trabalha no dia, por função. Somente leitura. */
export default function DpMeuRotinaLoja() {
  const { data: vinculo } = useMeuVinculoPortal();
  const [data, setData] = useState(hojeIso);

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
        out.push({
          id: l.colaborador_id,
          nome: toUpperCadastro(nomeExibicao(l)),
          cargo: l.cargo || "Sem função definida",
          setor: l.setor_nome || null,
          entrada: hhmm(l.entrada),
          saida: hhmm(l.saida),
        });
      }
      return out.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    },
  });

  /**
   * Só interessa quem trabalha no mesmo horário do colaborador: quem entra à
   * noite não precisa ver a equipe do almoço.
   */
  const equipeDoMeuTurno = useMemo(() => {
    const lista = escala.data ?? [];
    const eu = lista.find((p) => p.id === vinculo?.colaboradorId);
    if (!eu || !eu.entrada) return lista;
    return lista.filter((p) => p.id === eu.id || horariosSobrepostos(eu, p));
  }, [escala.data, vinculo?.colaboradorId]);

  /**
   * Como no painel do gestor: quando a loja usa setores, a equipe do dia é
   * agrupada por setor; sem setor cadastrado, continua agrupada por função.
   */
  const usaSetores = useMemo(
    () => equipeDoMeuTurno.some((p) => !!p.setor),
    [equipeDoMeuTurno],
  );

  const grupos = useMemo(() => {
    const m = new Map<string, Pessoa[]>();
    for (const p of equipeDoMeuTurno) {
      const chave = usaSetores ? (p.setor ?? "Sem setor definido") : p.cargo;
      const lista = m.get(chave) ?? [];
      lista.push(p);
      m.set(chave, lista);
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0], "pt-BR"));
  }, [equipeDoMeuTurno, usaSetores]);

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
      ) : grupos.length === 0 ? (
        <DpEmptyState icon={Users}>Nenhuma equipe prevista para este dia.</DpEmptyState>

      ) : (
        <div className="space-y-4">
          {grupos.map(([titulo, pessoas]) => (
            <Card key={titulo} className="dp-content-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Users className="size-4 text-primary" />
                  <p className="font-medium">{titulo}</p>
                  <Badge variant="outline">{pessoas.length}</Badge>
                </div>
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
                        {p.entrada && p.saida ? `${p.entrada} às ${p.saida}` : "Horário a confirmar"}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </DpPage>
  );
}
