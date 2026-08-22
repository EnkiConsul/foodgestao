import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Quantidade de competências fechadas analisadas (mês anterior para trás). */
const JANELA_MESES = 6;

/** YYYY-MM do mês anterior (competência usual de importação). */
function competenciaAnterior(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function addMeses(competencia: string, delta: number): string {
  const ano = Number(competencia.slice(0, 4));
  const mes = Number(competencia.slice(5, 7));
  const d = new Date(ano, mes - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function primeiroDia(competencia: string) {
  return `${competencia}-01`;
}

function ultimoDia(competencia: string) {
  const ano = Number(competencia.slice(0, 4));
  const mes = Number(competencia.slice(5, 7));
  const d = new Date(ano, mes, 0);
  return `${competencia}-${String(d.getDate()).padStart(2, "0")}`;
}

function labelCompetencia(competencia: string) {
  return `${competencia.slice(5, 7)}/${competencia.slice(0, 4)}`;
}

type Tipo = "ponto" | "adiantamento";

type Alerta = {
  colaborador_id: string;
  nome: string;
  tipo: Tipo;
  problema: "faltando" | "inconsistente";
  unidade_id: string | null;
  competencia: string;
};

const TIPO_LABEL = { ponto: "Folha de Ponto", adiantamento: "Adiantamento Salarial" } as const;

const MAX_NOMES = 6;

type Grupo = {
  key: string;
  tipo: Tipo;
  problema: "faltando" | "inconsistente";
  unidade_id: string | null;
  nome_unidade: string | null;
  competencia: string;
  nomes: string[];
  total: number;
  completo: boolean;
};

/**
 * Confere, nas últimas competências fechadas, se os documentos de Folha de Ponto
 * e Adiantamento batem com o que está marcado no cadastro do colaborador.
 * Não há filtro de competência: pendências antigas continuam visíveis.
 */
export function DocConsistenciaPanel() {
  const { selectedCompanyId } = useCompanyContext();
  const [aberto, setAberto] = useState<Record<string, boolean>>({});

  const query = useQuery({
    queryKey: ["dp_doc_consistencia_janela", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const fim = competenciaAnterior();
      const inicioJanela = addMeses(fim, -(JANELA_MESES - 1));

      const companyRes = await supabase
        .from("companies")
        .select("created_at")
        .eq("id", selectedCompanyId!)
        .maybeSingle();
      if (companyRes.error) throw companyRes.error;

      let inicio = inicioJanela;
      const createdAt = companyRes.data?.created_at as string | undefined;
      if (createdAt) {
        const compCriacao = createdAt.slice(0, 7);
        if (compCriacao > inicio) inicio = compCriacao;
      }
      // Empresa criada depois da última competência fechada: nada a conferir.
      if (inicio > fim) {
        return {
          alertas: [] as Alerta[],
          elegiveis: {} as Record<string, number>,
          unidadesMap: new Map<string, string>(),
          janela: { inicio, fim },
        };
      }

      const competencias: string[] = [];
      for (let c = inicio; c <= fim; c = addMeses(c, 1)) competencias.push(c);

      const [colabsRes, docsRes, unidadesRes] = await Promise.all([
        supabase
          .from("dp_colaboradores")
          .select(
            "id, nome, possui_folha_ponto, optante_adiantamento, unidade_id, data_admissao, data_desligamento",
          )
          .eq("company_id", selectedCompanyId!)
          .eq("ativo", true),
        supabase
          .from("dp_documentos")
          .select("colaborador_id, tipo, referencia_data")
          .eq("company_id", selectedCompanyId!)
          .gte("referencia_data", primeiroDia(inicio))
          .lte("referencia_data", ultimoDia(fim))
          .in("tipo", ["ponto", "adiantamento"]),
        supabase
          .from("dp_unidades")
          .select("id, nome")
          .eq("company_id", selectedCompanyId!)
          .eq("ativo", true),
      ]);
      if (colabsRes.error) throw colabsRes.error;
      if (docsRes.error) throw docsRes.error;
      if (unidadesRes.error) throw unidadesRes.error;

      const unidadesMap = new Map(
        (unidadesRes.data ?? []).map((u: any) => [u.id as string, u.nome as string]),
      );

      const importados = new Set(
        (docsRes.data ?? []).map(
          (d: any) => `${d.colaborador_id}::${d.tipo}::${String(d.referencia_data).slice(0, 7)}`,
        ),
      );

      const alertas: Alerta[] = [];
      // chave: competencia::tipo::unidade
      const elegiveis: Record<string, number> = {};

      for (const c of (colabsRes.data ?? []) as any[]) {
        const admissao = (c.data_admissao as string | null) ?? null;
        const desligamento = (c.data_desligamento as string | null) ?? null;
        const uid = (c.unidade_id as string | null) ?? "sem-unidade";
        const checks: Array<[Tipo, boolean]> = [
          ["ponto", c.possui_folha_ponto === true],
          ["adiantamento", c.optante_adiantamento === true],
        ];

        for (const comp of competencias) {
          const ini = primeiroDia(comp);
          const fimComp = ultimoDia(comp);
          // Só considera competências em que o colaborador estava no quadro.
          if (admissao && admissao > fimComp) continue;
          if (desligamento && desligamento < ini) continue;

          for (const [tipo, ativo] of checks) {
            const temDoc = importados.has(`${c.id}::${tipo}::${comp}`);
            if (ativo) {
              const key = `${comp}::${tipo}::${uid}`;
              elegiveis[key] = (elegiveis[key] ?? 0) + 1;
            }
            if (ativo && !temDoc) {
              alertas.push({
                colaborador_id: c.id,
                nome: c.nome,
                tipo,
                problema: "faltando",
                unidade_id: c.unidade_id ?? null,
                competencia: comp,
              });
            } else if (!ativo && temDoc) {
              alertas.push({
                colaborador_id: c.id,
                nome: c.nome,
                tipo,
                problema: "inconsistente",
                unidade_id: c.unidade_id ?? null,
                competencia: comp,
              });
            }
          }
        }
      }

      return { alertas, elegiveis, unidadesMap, janela: { inicio, fim } };
    },
  });

  const janelaLabel = query.data?.janela
    ? `${labelCompetencia(query.data.janela.inicio)} a ${labelCompetencia(query.data.janela.fim)}`
    : "";

  const grupos = useMemo(() => {
    const alertas = query.data?.alertas ?? [];
    const elegiveis = query.data?.elegiveis ?? {};
    const unidadesMap = query.data?.unidadesMap ?? new Map<string, string>();
    const out: Grupo[] = [];

    // Agrupa por competência + problema + tipo + unidade.
    const porChave = new Map<string, Alerta[]>();
    for (const a of alertas) {
      const uid = a.unidade_id ?? "sem-unidade";
      const key = `${a.competencia}-${a.problema}-${a.tipo}-${uid}`;
      if (!porChave.has(key)) porChave.set(key, []);
      porChave.get(key)!.push(a);
    }

    for (const [key, alertasGrupo] of porChave) {
      const { problema, tipo, competencia } = alertasGrupo[0];
      const uid = alertasGrupo[0].unidade_id ?? "sem-unidade";
      const nomes = alertasGrupo
        .map((a) => a.nome)
        .sort((a, b) => a.localeCompare(b, "pt-BR"));
      const total = elegiveis[`${competencia}::${tipo}::${uid}`] ?? 0;
      const completo = problema === "faltando" && total > 0 && nomes.length >= total;
      out.push({
        key,
        tipo,
        problema,
        competencia,
        unidade_id: uid === "sem-unidade" ? null : uid,
        nome_unidade: uid === "sem-unidade" ? null : (unidadesMap.get(uid) ?? "Unidade"),
        nomes,
        total,
        completo,
      });
    }

    // Competência mais recente primeiro; depois problema, tipo e unidade.
    return out.sort((a, b) => {
      if (a.competencia !== b.competencia) return a.competencia < b.competencia ? 1 : -1;
      if (a.problema !== b.problema) return a.problema === "faltando" ? -1 : 1;
      if (a.tipo !== b.tipo) return a.tipo === "ponto" ? -1 : 1;
      const nomeA = a.nome_unidade ?? "Sem unidade";
      const nomeB = b.nome_unidade ?? "Sem unidade";
      return nomeA.localeCompare(nomeB, "pt-BR");
    });
  }, [query.data]);

  const faltando = grupos.filter((g) => g.problema === "faltando");
  const inconsistentes = grupos.filter((g) => g.problema === "inconsistente");

  const renderGrupo = (g: Grupo) => {
    const expandido = !!aberto[g.key];
    const visiveis = expandido ? g.nomes : g.nomes.slice(0, MAX_NOMES);
    const restantes = g.nomes.length - visiveis.length;
    const unidadeLabel = g.nome_unidade ?? "Sem unidade";
    return (
      <div key={g.key} className="rounded-md border bg-background/60 p-2.5 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">{TIPO_LABEL[g.tipo]}</span>
          <Badge variant="secondary" className="text-[11px]">
            {labelCompetencia(g.competencia)}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {g.completo
              ? `lote completo pendente na ${unidadeLabel} (${g.nomes.length} colaborador${
                  g.nomes.length === 1 ? "" : "es"
                })`
              : `${unidadeLabel}: ${g.nomes.length}${g.total ? ` de ${g.total}` : ""} ${
                  g.problema === "faltando" ? "pendentes" : "com inconsistência"
                }`}
          </span>
        </div>

        {!g.completo && (
          <div className="flex flex-wrap items-center gap-1.5">
            {visiveis.map((nome) => (
              <Badge key={nome} variant="outline" className="text-[11px]">
                {nome}
              </Badge>
            ))}
            {restantes > 0 && (
              <button
                type="button"
                className="text-[11px] text-primary underline underline-offset-2"
                onClick={() => setAberto((prev) => ({ ...prev, [g.key]: true }))}
              >
                +{restantes}
              </button>
            )}
            {expandido && g.nomes.length > MAX_NOMES && (
              <button
                type="button"
                className="text-[11px] text-muted-foreground underline underline-offset-2"
                onClick={() => setAberto((prev) => ({ ...prev, [g.key]: false }))}
              >
                ver menos
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <Card className="dp-content-card">
      <CardHeader className="space-y-1">
        <CardTitle className="text-base">Conferência de Documentos</CardTitle>
        {janelaLabel && (
          <p className="text-xs text-muted-foreground">
            Competências analisadas: {janelaLabel}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {query.isLoading && <p className="text-sm text-muted-foreground">Conferindo…</p>}

        {!query.isLoading && faltando.length === 0 && inconsistentes.length === 0 && (
          <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
            Folhas de ponto e adiantamentos batem com o cadastro dos colaboradores ativos.
          </div>
        )}

        {faltando.length > 0 && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4" /> Falta Importar ({faltando.length})
            </div>
            <p className="text-xs text-muted-foreground">
              Documento esperado pelo cadastro e ainda não importado nessas competências.
            </p>
            <div className="space-y-2">{faltando.map(renderGrupo)}</div>
          </div>
        )}

        {inconsistentes.length > 0 && (
          <div className="rounded-md border border-rose-500/40 bg-rose-500/5 p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-rose-700 dark:text-rose-300">
              <ShieldAlert className="h-4 w-4" /> Inconsistência de Cadastro ({inconsistentes.length})
            </div>
            <p className="text-xs text-muted-foreground">
              Documento importado, mas o cadastro do colaborador está com esse item desativado.
            </p>
            <div className="space-y-2">{inconsistentes.map(renderGrupo)}</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
