import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { AlertTriangle, CalendarClock, CheckCircle2, ChevronDown, Clock, ShieldAlert, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useDpPendenciasConfig } from "@/hooks/useDpPendenciasConfig";
import { isSocio } from "@/lib/dp/contrato-policy";
import { ativoNaCompetencia, tipoColetivoDoc } from "@/lib/dp/bulk-coverage";
import {
  optanteNaCompetencia,
  type AdiantamentoSolicitacao,
} from "@/lib/dp/adiantamento-opcao";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Quantidade de competências fechadas analisadas (mês anterior para trás). */
const JANELA_MESES = 6;

/** Regimes que recebem contracheque mensal. */
const REGIMES_ASSALARIADOS = new Set(["clt", "intermitente", "temporario", "aprendiz"]);

/** Dias de antecedência para alertar período de férias prestes a vencer. */
const FERIAS_ALERTA_DIAS = 60;

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

function hojeISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function somaDias(iso: string, dias: number) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function labelData(iso: string) {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

type Tipo =
  | "contracheque"
  | "contracheque_13"
  | "contracheque_ferias"
  | "ponto"
  | "adiantamento"
  | "pro_labore"
  | "rescisao";

const TIPO_LABEL: Record<Tipo, string> = {
  contracheque: "Contracheque",
  contracheque_13: "Contracheque 13º",
  contracheque_ferias: "Contracheque de Férias",
  ponto: "Folha de Ponto",
  adiantamento: "Adiantamento Salarial",
  pro_labore: "Recibo de Pró-Labore",
  rescisao: "Rescisão (TRCT / Demonstrativo)",
};

const TIPO_ORDEM: Tipo[] = [
  "contracheque",
  "contracheque_13",
  "contracheque_ferias",
  "ponto",
  "adiantamento",
  "pro_labore",
  "rescisao",
];

/** Documentos gravados que satisfazem a pendência de rescisão. */
const TIPOS_RESCISAO_DB = ["trct", "demonstrativo_rescisorio"] as const;

/** Tipos consultados em dp_documentos (rescisão é lógica). */
const TIPOS_DOC_QUERY = [
  ...TIPO_ORDEM.filter((t) => t !== "rescisao"),
  ...TIPOS_RESCISAO_DB,
] as string[];

/** Prazo legal de cada parcela do 13º dentro do ano da competência. */
function prazo13(competencia: string): string | null {
  const ano = competencia.slice(0, 4);
  const mes = competencia.slice(5, 7);
  if (mes === "11") return `${ano}-11-30`;
  if (mes === "12") return `${ano}-12-20`;
  return null;
}

type Alerta = {
  colaborador_id: string;
  nome: string;
  /** Data de desligamento, quando a pessoa já saiu do quadro. */
  desligamento: string | null;
  tipo: Tipo;
  problema: "faltando" | "inconsistente";
  unidade_id: string | null;
  competencia: string;
};

type Aviso = {
  key: string;
  tipo: Tipo;
  competencia: string;
  prazo: string;
  total: number;
};

type FeriasAlerta = {
  colaborador_id: string;
  nome: string;
  limite: string;
  dias: number;
  vencido: boolean;
};

const MAX_NOMES = 6;

type Pessoa = { nome: string; desligamento: string | null };

type Grupo = {
  key: string;
  tipo: Tipo;
  problema: "faltando" | "inconsistente";
  unidade_id: string | null;
  nome_unidade: string | null;
  competencia: string;
  nomes: Pessoa[];
  total: number;
  completo: boolean;
};

/**
 * Confere, nas últimas competências fechadas, se os documentos esperados pelo
 * cadastro (contracheque, 13º, contracheque de férias, folha de ponto e
 * adiantamento) foram importados. Não há filtro de competência: pendências
 * antigas continuam visíveis.
 */
export interface DocConsistenciaPanelProps {
  /** Leva o usuário ao envio já com a natureza e a competência preenchidas. */
  onImportar?: (tipo: string, competencia: string) => void;
}

export function DocConsistenciaPanel({ onImportar }: DocConsistenciaPanelProps = {}) {
  const { selectedCompanyId } = useCompanyContext();
  const { config } = useDpPendenciasConfig();
  const exigirContrachequeMesDesligamento = config.exigir_contracheque_mes_desligamento;
  const [aberto, setAberto] = useState<Record<string, boolean>>({});

  const query = useQuery({
    queryKey: [
      "dp_doc_consistencia_janela",
      selectedCompanyId,
      exigirContrachequeMesDesligamento,
    ],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const fim = competenciaAnterior();
      const inicioJanela = addMeses(fim, -(JANELA_MESES - 1));
      const hoje = hojeISO();

      const vazio = {
        alertas: [] as Alerta[],
        elegiveis: {} as Record<string, number>,
        avisos: [] as Aviso[],
        ferias: [] as FeriasAlerta[],
        unidadesMap: new Map<string, string>(),
        janela: { inicio: inicioJanela, fim },
      };

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
      if (inicio > fim) return { ...vazio, janela: { inicio, fim } };

      const competencias: string[] = [];
      for (let c = inicio; c <= fim; c = addMeses(c, 1)) competencias.push(c);

      const [colabsRes, docsRes, unidadesRes, gozosRes, solsRes, pontosRes] = await Promise.all([
        // Inclui desligados: quem saiu no meio do mês continua devendo o
        // documento daquela competência (a elegibilidade é por competência).
        supabase
          .from("dp_colaboradores")
          .select(
            "id, nome, ativo, regime, possui_folha_ponto, optante_adiantamento, unidade_id, data_admissao, data_desligamento, vinculo_label, socio_remuneracao",
          )
          .eq("company_id", selectedCompanyId!),
        supabase
          .from("dp_documentos")
          .select("colaborador_id, tipo, referencia_data")
          .eq("company_id", selectedCompanyId!)
          .gte("referencia_data", primeiroDia(inicio))
          .lte("referencia_data", ultimoDia(fim))
          .in("tipo", TIPOS_DOC_QUERY as any),
        supabase
          .from("dp_unidades")
          .select("id, nome, possui_relogio_ponto")
          .eq("company_id", selectedCompanyId!)
          .eq("ativo", true),
        supabase
          .from("dp_ferias_gozos")
          .select("colaborador_id, data_inicio, data_fim, status")
          .eq("company_id", selectedCompanyId!)
          .in("status", ["aprovado", "em_gozo", "concluido", "planejado"]),
        // Histórico datado de adiantamento (ativar/cancelar) — decide a competência.
        supabase
          .from("dp_adiantamento_solicitacoes" as any)
          .select("colaborador_id, tipo, competencia_efeito, created_at")
          .eq("company_id", selectedCompanyId!),
        // Evidência de trabalho (usada para o intermitente).
        supabase
          .from("dp_pontos")
          .select("colaborador_id, data")
          .eq("company_id", selectedCompanyId!)
          .gte("data", primeiroDia(inicio))
          .lte("data", ultimoDia(fim)),
      ]);
      if (colabsRes.error) throw colabsRes.error;
      if (docsRes.error) throw docsRes.error;
      if (unidadesRes.error) throw unidadesRes.error;
      if (gozosRes.error) throw gozosRes.error;

      const unidadesMap = new Map(
        (unidadesRes.data ?? []).map((u: any) => [u.id as string, u.nome as string]),
      );
      const relogioMap = new Map(
        (unidadesRes.data ?? []).map((u: any) => [
          u.id as string,
          u.possui_relogio_ponto === true,
        ]),
      );

      const importados = new Set(
        (docsRes.data ?? []).map((d: any) => {
          const tipo = (TIPOS_RESCISAO_DB as readonly string[]).includes(d.tipo) ? "rescisao" : d.tipo;
          return `${d.colaborador_id}::${tipo}::${String(d.referencia_data).slice(0, 7)}`;
        }),
      );

      // Competências em que houve gozo de férias (pagamento de férias esperado).
      const gozosPorColab = new Map<string, Set<string>>();
      for (const g of (gozosRes.data ?? []) as any[]) {
        if (g.status === "planejado") continue;
        const cid = g.colaborador_id as string;
        const comp = String(g.data_inicio).slice(0, 7);
        if (!gozosPorColab.has(cid)) gozosPorColab.set(cid, new Set());
        gozosPorColab.get(cid)!.add(comp);
      }

      // Adiantamento: vale o histórico datado da competência, não o flag atual.
      const solsPorColab = new Map<string, AdiantamentoSolicitacao[]>();
      for (const s of (solsRes.data ?? []) as any[]) {
        if (!solsPorColab.has(s.colaborador_id)) solsPorColab.set(s.colaborador_id, []);
        solsPorColab.get(s.colaborador_id)!.push(s as AdiantamentoSolicitacao);
      }

      // Intermitente sem nenhuma marcação na competência: não se cobra
      // contracheque nem folha de ponto (o alerta fica nas Pendências).
      const pontoNaComp = new Set<string>();
      for (const p of (pontosRes.data ?? []) as any[]) {
        if (p.colaborador_id && p.data) {
          pontoNaComp.add(`${p.colaborador_id}::${String(p.data).slice(0, 7)}`);
        }
      }

      const alertas: Alerta[] = [];
      // chave: competencia::tipo::unidade
      const elegiveis: Record<string, number> = {};
      // chave: competencia::tipo → 13º ainda dentro do prazo legal
      const avisosMap = new Map<string, Aviso>();

      for (const c of (colabsRes.data ?? []) as any[]) {
        const admissao = (c.data_admissao as string | null) ?? null;
        const desligamento = (c.data_desligamento as string | null) ?? null;
        const uid = (c.unidade_id as string | null) ?? "sem-unidade";
        const regime = String(c.regime ?? "").toLowerCase();
        // Sócio não é empregado: nada de contracheque, 13º, férias ou ponto.
        // Com pró-labore, espera-se apenas o recibo mensal da retirada.
        const socio = isSocio(c.vinculo_label);
        const socioProLabore = socio && c.socio_remuneracao === "pro_labore";
        const assalariado = REGIMES_ASSALARIADOS.has(regime) && !socio;
        const temRelogio = c.unidade_id ? relogioMap.get(c.unidade_id) === true : false;
        const gozos = gozosPorColab.get(c.id as string);

        for (const comp of competencias) {
          const ini = primeiroDia(comp);
          const fimComp = ultimoDia(comp);
          // Só considera competências em que o colaborador estava no quadro.
          // Mesma regra da conferência do lote (ativoNaCompetencia).
          if (
            !ativoNaCompetencia(
              {
                id: c.id,
                nome: c.nome,
                ativo: c.ativo,
                data_admissao: admissao,
                data_desligamento: desligamento,
              },
              comp,
            )
          ) {
            continue;
          }
          if (admissao && admissao > fimComp) continue;
          if (desligamento && desligamento < ini) continue;


          const prazoDecimo = prazo13(comp);
          const decimoNoPrazo = !!prazoDecimo && hoje <= prazoDecimo;

          // Mês do desligamento: por padrão o pagamento vem no acerto da
          // rescisão, então cobra-se TRCT/demonstrativo e não o contracheque.
          const desligadoNoMes = !!desligamento && desligamento.slice(0, 7) === comp;
          const cobraContracheque =
            assalariado && (!desligadoNoMes || exigirContrachequeMesDesligamento);

          const checks: Array<[Tipo, boolean]> = socio
            ? [["pro_labore", socioProLabore]]
            : [
                ["contracheque", cobraContracheque],
                ["rescisao", assalariado && desligadoNoMes],
                ["contracheque_13", assalariado && !!prazoDecimo && !decimoNoPrazo],
                ["contracheque_ferias", !!gozos?.has(comp)],
                ["ponto", temRelogio && c.possui_folha_ponto === true],
                ["adiantamento", c.optante_adiantamento === true],
              ];

          // 13º dentro do prazo legal: aviso informativo, não pendência.
          if (assalariado && prazoDecimo && decimoNoPrazo) {
            const key = `${comp}::contracheque_13`;
            const atual = avisosMap.get(key);
            if (atual) atual.total += 1;
            else
              avisosMap.set(key, {
                key,
                tipo: "contracheque_13",
                competencia: comp,
                prazo: prazoDecimo,
                total: 1,
              });
          }

          for (const [tipo, esperado] of checks) {
            // Sócio com pró-labore: o recibo de pagamento importado como
            // contracheque é o mesmo documento — vale como pró-labore do mês.
            const temDoc =
              importados.has(`${c.id}::${tipo}::${comp}`) ||
              (tipo === "pro_labore" &&
                socioProLabore &&
                (importados.has(`${c.id}::contracheque::${comp}`) ||
                  importados.has(`${c.id}::contracheque_13::${comp}`)));
            if (esperado) {
              const key = `${comp}::${tipo}::${uid}`;
              elegiveis[key] = (elegiveis[key] ?? 0) + 1;
            }
            if (esperado && !temDoc) {
              alertas.push({
                colaborador_id: c.id,
                nome: c.nome,
                desligamento,
                tipo,
                problema: "faltando",
                unidade_id: c.unidade_id ?? null,
                competencia: comp,
              });
            } else if (!esperado && temDoc) {
              // Inconsistência só faz sentido quando o cadastro nega o documento.
              const inconsistente =
                tipo === "ponto" ||
                tipo === "adiantamento" ||
                ((tipo === "contracheque" || tipo === "contracheque_13") &&
                  !assalariado &&
                  !socioProLabore);
              if (inconsistente) {
                alertas.push({
                  colaborador_id: c.id,
                  nome: c.nome,
                  desligamento,
                  tipo,
                  problema: "inconsistente",
                  unidade_id: c.unidade_id ?? null,
                  competencia: comp,
                });
              }
            }
          }
        }
      }

      return {
        alertas,
        elegiveis,
        avisos: Array.from(avisosMap.values()).sort((a, b) =>
          a.competencia < b.competencia ? -1 : 1,
        ),
        unidadesMap,
        janela: { inicio, fim },
      };
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
      const nomes: Pessoa[] = alertasGrupo
        .map((a) => ({ nome: a.nome, desligamento: a.desligamento }))
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
      const total = elegiveis[`${competencia}::${tipo}::${uid}`] ?? 0;
      // "Lote completo" só existe em documento coletivo mensal. Rescisão e
      // documentos pontuais são sempre nominais, mesmo que só falte de um.
      const completo =
        problema === "faltando" &&
        tipoColetivoDoc(tipo) &&
        total > 1 &&
        nomes.length >= total;
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

    // Competência mais antiga primeiro; depois problema, tipo e unidade.
    return out.sort((a, b) => {
      if (a.competencia !== b.competencia) return a.competencia < b.competencia ? -1 : 1;
      if (a.problema !== b.problema) return a.problema === "faltando" ? -1 : 1;
      if (a.tipo !== b.tipo) return TIPO_ORDEM.indexOf(a.tipo) - TIPO_ORDEM.indexOf(b.tipo);
      const nomeA = a.nome_unidade ?? "Sem unidade";
      const nomeB = b.nome_unidade ?? "Sem unidade";
      return nomeA.localeCompare(nomeB, "pt-BR");
    });
  }, [query.data]);

  const faltando = grupos.filter((g) => g.problema === "faltando");
  const inconsistentes = grupos.filter((g) => g.problema === "inconsistente");
  const avisos = query.data?.avisos ?? [];
  const tudoOk =
    faltando.length === 0 && inconsistentes.length === 0 && avisos.length === 0;

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
            {visiveis.map((p) => (
              <Badge key={p.nome} variant="outline" className="text-[11px]">
                {p.nome}
                {p.desligamento
                  ? ` · desligado em ${p.desligamento.slice(8, 10)}/${p.desligamento.slice(5, 7)}`
                  : ""}
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

        {onImportar && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs"
            onClick={() => {
              if (isMobile) setAbertaManual(false);
              onImportar(g.tipo, g.competencia);
            }}
          >
            <Upload className="mr-1 h-3.5 w-3.5" /> Importar este
          </Button>
        )}
      </div>
    );
  };

  /**
   * No celular o quadro começa recolhido: o envio do PDF é a ação principal da
   * tela e não pode ficar empurrado para baixo por uma lista longa de pendências.
   */
  const totalPendencias = faltando.length + avisos.length + inconsistentes.length;
  const isMobile = useIsMobile();
  const [abertaManual, setAbertaManual] = useState<boolean | null>(null);
  const aberta = abertaManual ?? !isMobile;

  return (
    <Card className="dp-content-card">
      <Collapsible open={aberta} onOpenChange={(v) => setAbertaManual(v)}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-start justify-between gap-2 rounded-t-xl p-6 text-left"
          >
            <CardHeader className="space-y-1 p-0">
              <CardTitle className="text-base">
                Conferência de Documentos
                {totalPendencias > 0 && (
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    ({totalPendencias} ponto{totalPendencias === 1 ? "" : "s"} de atenção)
                  </span>
                )}
              </CardTitle>
              {janelaLabel && (
                <p className="text-xs text-muted-foreground">
                  Competências analisadas: {janelaLabel}
                </p>
              )}
            </CardHeader>
            <ChevronDown
              className={cn(
                "mt-1 size-5 shrink-0 text-muted-foreground transition-transform",
                aberta && "rotate-180",
              )}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
      <CardContent className="space-y-3">
        {query.isLoading && <p className="text-sm text-muted-foreground">Conferindo…</p>}

        {!query.isLoading && tudoOk && (
          <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
            Os documentos importados batem com o cadastro dos colaboradores ativos.
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

        {avisos.length > 0 && (
          <div className="rounded-md border border-sky-500/40 bg-sky-500/5 p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-sky-700 dark:text-sky-300">
              <Clock className="h-4 w-4" /> A Vencer ({avisos.length})
            </div>
            <div className="space-y-2">
              {avisos.map((a) => (
                <div key={a.key} className="rounded-md border bg-background/60 p-2.5 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{TIPO_LABEL[a.tipo]}</span>
                    <Badge variant="secondary" className="text-[11px]">
                      {labelCompetencia(a.competencia)}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      prazo legal {labelData(a.prazo)} · {a.total} colaborador
                      {a.total === 1 ? "" : "es"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
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
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
