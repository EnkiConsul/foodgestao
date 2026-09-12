// ------------------------------------------------------------------
// Domínio: DP → Programação de Férias (relatório sintético)
//
// Monta as linhas do relatório no mesmo formato da contabilidade
// (uma linha por período aquisitivo, agrupadas por colaborador) e gera
// o CSV e o HTML imprimível. Funções puras; a abertura da janela de
// impressão é o único ponto que toca no browser.
// ------------------------------------------------------------------

import {
  nivelVencimentoPeriodo,
  periodosComAcumulo,
  NIVEL_VENCIMENTO_META,
  type FeriasSinalizacaoCiclo,
  type NivelVencimento,
} from "./ferias-direito";

export interface ProgramacaoColaborador {
  id: string;
  nome: string;
  matricula: string | null;
  data_admissao: string | null;
  unidade_id: string | null;
  socio: boolean;
  desligado: boolean;
}

export interface ProgramacaoPeriodo {
  id: string;
  colaborador_id: string;
  inicio_aquisitivo: string;
  fim_aquisitivo: string;
  limite_concessivo: string;
  dias_direito: number;
  dias_gozados: number;
  dias_saldo: number | null;
  dias_vendidos: number | null;
  faltas_injustificadas: number | null;
  status: string;
  controle_externo: boolean;
}

export interface ProgramacaoGozo {
  colaborador_id: string;
  periodo_id: string | null;
  data_inicio: string;
  dias: number | null;
  dias_abono: number;
  adiantar_13: boolean;
  status: string;
}

export interface ProgramacaoAfastamento {
  colaborador_id: string;
  data_inicio: string;
  data_fim: string;
}

export interface ProgramacaoUnidade {
  id: string;
  nome: string;
  cnpj: string | null;
}

export interface ProgramacaoLinha {
  colaboradorId: string;
  /** Repetidos em todas as linhas do colaborador (uma linha por período). */
  codigo: string | null;
  nome: string | null;
  admissao: string | null;
  /** Quantidade de períodos já vencidos (fim aquisitivo ≤ data-base). */
  feriasVencidas: number | null;
  /** Proporção do período em curso, ex.: "04/12". */
  feriasProporcionais: string | null;
  inicioAquisitivo: string;
  fimAquisitivo: string;
  gozoInicio: string | null;
  gozoDias: number | null;
  gozoAbono: number | null;
  gozoAdianta13: boolean | null;
  diasDireito: number;
  diasGozados: number;
  diasRestantes: number;
  limiteGozo: string;
  diasAfastamento: number | null;
  diasFaltas: number | null;
  situacao: NivelVencimento;
  /** Dias até o limite concessivo (negativo = vencido). */
  diasParaLimite: number;
  /** Dias que ainda faltam marcar/gozar. */
  diasParaMarcar: number;
}

export interface ProgramacaoDados {
  /** Identidade do cabeçalho: unidade filtrada ou razão social da empresa. */
  razaoSocial: string;
  cnpj: string | null;
  /** true quando o relatório reúne mais de uma unidade (sem filtro). */
  consolidado: boolean;
  dataBase: string;
  emitidoEm: Date;
  linhas: ProgramacaoLinha[];
  /** Total de colaboradores distintos no relatório. */
  totalEmpregados: number;
}

const MAX_LINHAS_POR_PAGINA = 22;

/** Diferença em dias entre duas datas ISO (yyyy-MM-dd), sem fuso. */
export function diffDiasISO(alvoISO: string, baseISO: string): number {
  const alvo = Date.UTC(+alvoISO.slice(0, 4), +alvoISO.slice(5, 7) - 1, +alvoISO.slice(8, 10));
  const base = Date.UTC(+baseISO.slice(0, 4), +baseISO.slice(5, 7) - 1, +baseISO.slice(8, 10));
  return Math.round((alvo - base) / 86_400_000);
}

/** Dias de sobreposição entre [iniA, fimA] e [iniB, fimB] (0 quando não toca). */
function sobreposicaoDias(iniA: string, fimA: string, iniB: string, fimB: string): number {
  const ini = iniA > iniB ? iniA : iniB;
  const fim = fimA < fimB ? fimA : fimB;
  const d = diffDiasISO(fim, ini);
  return d >= 0 ? d + 1 : 0;
}

/** Meses completos trabalhados dentro do período aquisitivo até a data-base. */
function mesesProporcionais(inicio: string, fim: string, base: string): string {
  const ate = base < fim ? base : fim;
  if (ate < inicio) return "00/12";
  let meses =
    (+ate.slice(5, 7) - +inicio.slice(5, 7)) + 12 * (+ate.slice(0, 4) - +inicio.slice(0, 4));
  // Conta o mês do aniversário quando o dia da base alcança o dia de início.
  if (+ate.slice(8, 10) >= +inicio.slice(8, 10)) meses += 1;
  if (ate >= fim) meses = 12;
  meses = Math.max(0, Math.min(12, meses));
  return `${String(meses).padStart(2, "0")}/12`;
}

export interface MontarProgramacaoOpts {
  colaboradores: ProgramacaoColaborador[];
  periodos: ProgramacaoPeriodo[];
  gozos: ProgramacaoGozo[];
  afastamentos?: ProgramacaoAfastamento[];
  dataBase: string;
  emitidoEm: Date;
  /** Razão social da empresa (usada quando não há unidade filtrada). */
  razaoSocial: string;
  /** CNPJ da empresa (matriz). */
  cnpj: string | null;
  /** Unidades da empresa, para resolver o cabeçalho por unidade filtrada. */
  unidades?: ProgramacaoUnidade[];
  politica?: FeriasSinalizacaoCiclo;
  /** Filtro de unidade (null = todas). */
  unidadeId?: string | null;
  incluirDesligados?: boolean;
}

const GOZO_VALIDO = new Set(["planejado", "aprovado", "em_gozo", "concluido"]);

/** Monta o relatório completo: linhas ordenadas por colaborador e período. */
export function montarProgramacao(opts: MontarProgramacaoOpts): ProgramacaoDados {
  const {
    colaboradores, periodos, gozos, dataBase, emitidoEm, razaoSocial, cnpj,
  } = opts;
  const politica = opts.politica ?? "a_conceder";
  const afastamentos = opts.afastamentos ?? [];

  const colabPorId = new Map(colaboradores.map((c) => [c.id, c]));
  const idsAcumulo = periodosComAcumulo(
    periodos.map((p) => ({
      id: p.id,
      colaborador_id: p.colaborador_id,
      inicio_aquisitivo: p.inicio_aquisitivo,
      dias_saldo: p.dias_saldo,
      controle_externo: p.controle_externo,
      socio: colabPorId.get(p.colaborador_id)?.socio ?? false,
      desligado: colabPorId.get(p.colaborador_id)?.desligado ?? false,
    })),
  );

  const elegiveis = colaboradores.filter(
    (c) =>
      !c.socio &&
      (opts.incluirDesligados || !c.desligado) &&
      (!opts.unidadeId || c.unidade_id === opts.unidadeId),
  );
  const porNome = elegiveis
    .slice()
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR") || a.id.localeCompare(b.id));

  const gozosPorPeriodo = new Map<string, ProgramacaoGozo[]>();
  for (const g of gozos) {
    if (!g.periodo_id || !GOZO_VALIDO.has(g.status)) continue;
    const lista = gozosPorPeriodo.get(g.periodo_id) ?? [];
    lista.push(g);
    gozosPorPeriodo.set(g.periodo_id, lista);
  }

  const linhas: ProgramacaoLinha[] = [];
  for (const colab of porNome) {
    const doColab = periodos
      .filter((p) => p.colaborador_id === colab.id)
      .sort((a, b) => a.inicio_aquisitivo.localeCompare(b.inicio_aquisitivo));
    if (!doColab.length) continue;

    const vencidas = doColab.filter((p) => p.fim_aquisitivo <= dataBase).length;

    doColab.forEach((p) => {
      const colabAfast = afastamentos
        .filter((a) => a.colaborador_id === colab.id)
        .reduce((s, a) => s + sobreposicaoDias(a.data_inicio, a.data_fim, p.inicio_aquisitivo, p.fim_aquisitivo), 0);

      const gozosDoPeriodo = (gozosPorPeriodo.get(p.id) ?? [])
        .slice()
        .sort((a, b) => a.data_inicio.localeCompare(b.data_inicio));
      const gozoAberto = gozosDoPeriodo.find((g) => g.status !== "concluido");
      const gozoRef = gozoAberto ?? gozosDoPeriodo[gozosDoPeriodo.length - 1] ?? null;

      const diasRestantes = p.dias_saldo ?? Math.max(0, p.dias_direito - p.dias_gozados);
      const situacao = nivelVencimentoPeriodo({
        fimAquisitivo: p.fim_aquisitivo,
        limiteConcessivo: p.limite_concessivo,
        diasSaldo: diasRestantes,
        hojeISO: dataBase,
        politica,
        desligado: colab.desligado,
        acumulo: idsAcumulo.has(p.id),
      });

      linhas.push({
        colaboradorId: colab.id,
        codigo: colab.matricula,
        nome: colab.nome,
        admissao: colab.data_admissao,
        feriasVencidas: vencidas,
        feriasProporcionais: mesesProporcionais(p.inicio_aquisitivo, p.fim_aquisitivo, dataBase),
        inicioAquisitivo: p.inicio_aquisitivo,
        fimAquisitivo: p.fim_aquisitivo,
        gozoInicio: gozoRef?.data_inicio ?? null,
        gozoDias: gozoRef?.dias ?? null,
        gozoAbono: gozoRef ? gozoRef.dias_abono : null,
        gozoAdianta13: gozoRef ? gozoRef.adiantar_13 : null,
        diasDireito: p.dias_direito,
        diasGozados: p.dias_gozados,
        diasRestantes,
        limiteGozo: p.limite_concessivo,
        diasAfastamento: colabAfast > 0 ? colabAfast : null,
        diasFaltas: p.faltas_injustificadas,
        situacao,
        diasParaLimite: diffDiasISO(p.limite_concessivo, dataBase),
        diasParaMarcar: diasRestantes,
      });
    });
  }

  // Cabeçalho: com unidade filtrada usa a identidade daquela unidade; sem filtro
  // usa a razão social da empresa (nunca o nome de uma unidade qualquer).
  const unidades = opts.unidades ?? [];
  const unidadeFiltrada = opts.unidadeId
    ? unidades.find((u) => u.id === opts.unidadeId) ?? null
    : null;
  const unidadesNoRelatorio = new Set(
    porNome
      .filter((c) => linhas.some((l) => l.colaboradorId === c.id))
      .map((c) => c.unidade_id)
      .filter((id): id is string => !!id),
  );

  return {
    razaoSocial: unidadeFiltrada ? unidadeFiltrada.nome : razaoSocial,
    cnpj: unidadeFiltrada ? unidadeFiltrada.cnpj : cnpj,
    consolidado: !unidadeFiltrada && unidadesNoRelatorio.size > 1,
    dataBase,
    emitidoEm,
    linhas,
    totalEmpregados: new Set(linhas.map((l) => l.colaboradorId)).size,
  };
}

export const SITUACAO_PROGRAMACAO_LABEL: Record<NivelVencimento, string> = {
  normal: "Dentro do prazo",
  planejamento: "Acompanhar",
  a_conceder: "A conceder",
  atencao: "Risco de dobra",
  marcacao_atrasada: "Marcação atrasada",
  vencido: "Pagamento em dobro",
};

/** Cores claras de fundo por situação (legíveis também em impressão PB). */
export const SITUACAO_PROGRAMACAO_COR: Record<NivelVencimento, { fundo: string; texto: string }> = {
  normal: { fundo: "#f1f1f1", texto: "#555555" },
  planejamento: { fundo: "#fef3c7", texto: "#92600a" },
  a_conceder: { fundo: "#fef9e7", texto: "#8a6d1a" },
  atencao: { fundo: "#fde7d3", texto: "#b24a00" },
  marcacao_atrasada: { fundo: "#fbdcdc", texto: "#b91c1c" },
  vencido: { fundo: "#fbdcdc", texto: "#b91c1c" },
};

/* --------------------------- Colunas ---------------------------- */

const dataBr = (iso: string | null | undefined) =>
  iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "..../..../......";
const numOuTraco = (v: number | null | undefined) => (v === null || v === undefined ? "...." : v);

export type ProgramacaoColKey =
  | "codigo" | "nome" | "admissao" | "vencimento" | "feriasVencidas" | "feriasProporcionais"
  | "inicioAquisitivo" | "fimAquisitivo" | "gozoInicio" | "gozoDias" | "gozoAbono" | "gozoAdianta13"
  | "diasDireito" | "diasGozados" | "diasRestantes" | "limiteGozo" | "diasAfastamento"
  | "diasFaltas" | "situacao" | "diasParaLimite" | "diasParaMarcar";

export interface ProgramacaoColMeta {
  key: ProgramacaoColKey;
  /** Rótulo completo (CSV e impresso). */
  label: string;
  /** Rótulo curto para a tela. */
  curto: string;
  center?: boolean;
  right?: boolean;
  width: number;
  valor: (l: ProgramacaoLinha) => string;
}

/** Metadados das colunas do relatório sintético — fonte única para tela, CSV e impresso. */
export const PROGRAMACAO_COLUNAS: ProgramacaoColMeta[] = [
  { key: "codigo", label: "Código", curto: "Cód.", right: true, width: 80, valor: (l) => l.codigo ?? "" },
  { key: "nome", label: "Empregado", curto: "Empregado", width: 240, valor: (l) => l.nome ?? "" },
  { key: "admissao", label: "Data admissão", curto: "Admissão", width: 110, valor: (l) => (l.admissao ? dataBr(l.admissao) : "") },
  { key: "vencimento", label: "Vencto. férias", curto: "Vencto.", width: 110, valor: (l) => dataBr(l.fimAquisitivo) },
  { key: "feriasVencidas", label: "Fer. venc.", curto: "Venc.", center: true, width: 80, valor: (l) => String(l.feriasVencidas ?? "") },
  { key: "feriasProporcionais", label: "Fer. pro.", curto: "Prop.", center: true, width: 80, valor: (l) => l.feriasProporcionais ?? "" },
  { key: "inicioAquisitivo", label: "Início aquisitivo", curto: "Início aquis.", width: 120, valor: (l) => dataBr(l.inicioAquisitivo) },
  { key: "fimAquisitivo", label: "Fim aquisitivo", curto: "Fim aquis.", width: 120, valor: (l) => dataBr(l.fimAquisitivo) },
  { key: "gozoInicio", label: "Início gozo", curto: "Início gozo", width: 120, valor: (l) => dataBr(l.gozoInicio) },
  { key: "gozoDias", label: "Dias", curto: "Dias", center: true, width: 80, valor: (l) => String(numOuTraco(l.gozoDias)) },
  { key: "gozoAbono", label: "Abono", curto: "Abono", center: true, width: 80, valor: (l) => String(numOuTraco(l.gozoAbono)) },
  {
    key: "gozoAdianta13", label: "13º", curto: "13º", center: true, width: 80,
    valor: (l) => (l.gozoAdianta13 === null ? "...." : l.gozoAdianta13 ? "SIM" : "-"),
  },
  { key: "diasDireito", label: "Dias dir.", curto: "Dir.", center: true, width: 80, valor: (l) => String(l.diasDireito) },
  { key: "diasGozados", label: "Dias goz.", curto: "Goz.", center: true, width: 80, valor: (l) => String(l.diasGozados) },
  { key: "diasRestantes", label: "Dias rest.", curto: "Rest.", center: true, width: 80, valor: (l) => String(l.diasRestantes) },
  { key: "limiteGozo", label: "Limite p/ gozo", curto: "Limite p/ gozo", width: 120, valor: (l) => dataBr(l.limiteGozo) },
  { key: "diasAfastamento", label: "Dias afast.", curto: "Afast.", center: true, width: 80, valor: (l) => String(l.diasAfastamento ?? "-") },
  { key: "diasFaltas", label: "Dias faltas", curto: "Faltas", center: true, width: 80, valor: (l) => String(l.diasFaltas ?? "-") },
  { key: "situacao", label: "Situação", curto: "Situação", width: 170, valor: (l) => SITUACAO_PROGRAMACAO_LABEL[l.situacao] },
  { key: "diasParaLimite", label: "Dias p/ limite", curto: "Dias p/ limite", center: true, width: 110, valor: (l) => String(l.diasParaLimite) },
  { key: "diasParaMarcar", label: "Dias p/ marcar", curto: "Dias p/ marcar", center: true, width: 110, valor: (l) => String(l.diasParaMarcar) },
];

export const PROGRAMACAO_COL_ORDER = PROGRAMACAO_COLUNAS.map((c) => c.key);
export const PROGRAMACAO_COL_WIDTHS = Object.fromEntries(
  PROGRAMACAO_COLUNAS.map((c) => [c.key, c.width]),
) as Record<ProgramacaoColKey, number>;
const COL_POR_KEY = new Map(PROGRAMACAO_COLUNAS.map((c) => [c.key, c]));

/** Colunas escolhidas (na ordem pedida) ou todas quando nada for informado. */
function colunasDe(keys?: ProgramacaoColKey[]): ProgramacaoColMeta[] {
  if (!keys?.length) return PROGRAMACAO_COLUNAS;
  return keys.map((k) => COL_POR_KEY.get(k)).filter((c): c is ProgramacaoColMeta => !!c);
}

/** Subtítulo do cabeçalho quando o relatório reúne mais de uma unidade. */
export function programacaoEscopoTexto(d: ProgramacaoDados): string | null {
  return d.consolidado ? "Consolidado de todas as unidades" : null;
}

/* ------------------------------- CSV ------------------------------- */

export function programacaoParaCsv(d: ProgramacaoDados, colunas?: ProgramacaoColKey[]): string {
  const cols = colunasDe(colunas);
  const escopo = programacaoEscopoTexto(d);
  const corpo = [
    [`Programação de férias — ${d.razaoSocial}`],
    [`CNPJ: ${d.cnpj ?? "-"}`, ...(escopo ? [escopo] : [])],
    [`Data base: ${dataBr(d.dataBase)}`, `Total de empregados: ${d.totalEmpregados}`],
    cols.map((c) => c.label),
    ...d.linhas.map((l) => cols.map((c) => c.valor(l))),
  ];
  return corpo
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";"))
    .join("\n");
}

/** Baixa o CSV com BOM para abrir correto no Excel. */
export function baixarProgramacaoCsv(d: ProgramacaoDados): void {
  const blob = new Blob(["\ufeff" + programacaoParaCsv(d)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `programacao-ferias-${d.dataBase}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* --------------------------- HTML impresso --------------------------- */

const esc = (v: string | number) =>
  String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function linhaHtml(l: ProgramacaoLinha, cols: ProgramacaoColMeta[]): string {
  const cor = SITUACAO_PROGRAMACAO_COR[l.situacao];
  const celulas = cols.map((c) => {
    if (c.key === "situacao") {
      const selo = `<span class="selo" style="background:${cor.fundo};color:${cor.texto}">${esc(
        SITUACAO_PROGRAMACAO_LABEL[l.situacao],
      )}</span>`;
      return `<td class="c">${selo}</td>`;
    }
    const cls = c.key === "nome" ? "nome" : c.center ? "c" : c.right ? "r" : "";
    return `<td class="${cls}">${esc(c.valor(l))}</td>`;
  });
  return `<tr>${celulas.join("")}</tr>`;
}

const ESTILO = `
  body { font-family: Arial, Helvetica, sans-serif; font-size: 9px; color: #111; margin: 0; padding: 10px; }
  .cab { display: flex; justify-content: space-between; font-size: 9px; }
  .cab p { margin: 0; }
  h1 { text-align: center; font-size: 13px; margin: 14px 0 8px; letter-spacing: 2px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border-bottom: 1px solid #ddd; padding: 2px 3px; text-align: left; white-space: nowrap; }
  th { font-size: 8px; color: #444; border-bottom: 1px solid #999; }
  td.c { text-align: center; } td.r { text-align: right; } td.nome { white-space: normal; }
  .selo { display: inline-block; padding: 1px 6px; border-radius: 8px; font-size: 8px; font-weight: bold; }
  .rodape { margin-top: 8px; font-size: 9px; text-align: right; }
  .pag { text-align: right; font-size: 8px; color: #666; margin-top: 4px; }
  @page { size: A4 landscape; margin: 10mm; }
  @media print { .quebra { page-break-before: always; } }
`;

/** Documento HTML paginado, pronto para imprimir ou salvar em PDF. */
export function programacaoDocumento(d: ProgramacaoDados): string {
  const paginas: ProgramacaoLinha[][] = [];
  for (let i = 0; i < d.linhas.length; i += MAX_LINHAS_POR_PAGINA) {
    paginas.push(d.linhas.slice(i, i + MAX_LINHAS_POR_PAGINA));
  }
  if (!paginas.length) paginas.push([]);
  const total = paginas.length;
  const emissao = `${d.emitidoEm.toLocaleDateString("pt-BR")} ${d.emitidoEm.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;

  const cabecalho = (pagina: number) => `
    <div class="cab">
      <div>
        <p><strong>${esc(d.razaoSocial)}</strong></p>
        <p>CNPJ: ${esc(d.cnpj ?? "-")}</p>
        <p>Data base: ${esc(dataBr(d.dataBase))}</p>
      </div>
      <div style="text-align:right">
        <p>Página: ${pagina}/${total}</p>
        <p>Emissão: ${esc(emissao)}</p>
      </div>
    </div>
    <h1>PROGRAMAÇÃO DE FÉRIAS</h1>`;

  const corpo = paginas
    .map(
      (linhas, i) => `
    <section class="${i > 0 ? "quebra" : ""}">
      ${cabecalho(i + 1)}
      <table>
        <thead>
          <tr>
            <th>Código</th><th>Empregado</th><th>Data admissão</th><th>Vencto. férias</th>
            <th>Fer. venc.</th><th>Fer. pro.</th><th>Início aquisitivo</th><th>Fim aquisitivo</th>
            <th>Início gozo</th><th>Dias</th><th>Abono</th><th>13º</th>
            <th>Dias dir.</th><th>Dias goz.</th><th>Dias rest.</th><th>Limite p/ gozo</th>
            <th>Dias afast.</th><th>Dias faltas</th><th>Situação</th>
          </tr>
        </thead>
        <tbody>${linhas.map(linhaHtml).join("")}</tbody>
      </table>
      ${
        i === total - 1
          ? `<p class="rodape">Total de empregados: ${d.totalEmpregados}</p>`
          : ""
      }
    </section>`,
    )
    .join("");

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8" />
  <title>Programação de Férias — ${esc(d.razaoSocial)}</title><style>${ESTILO}</style></head>
  <body>${corpo}</body></html>`;
}

/** Abre a janela de impressão com o relatório. */
export function imprimirProgramacao(d: ProgramacaoDados): boolean {
  const win = window.open("", "_blank");
  if (!win) return false;
  win.document.write(programacaoDocumento(d));
  win.document.close();
  setTimeout(() => win.print(), 300);
  return true;
}

/** Reexporta metadados de tom para a tela usar os mesmos tons do resto do DP. */
export { NIVEL_VENCIMENTO_META };
