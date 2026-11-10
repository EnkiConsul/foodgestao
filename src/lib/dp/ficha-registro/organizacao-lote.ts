/**
 * Organização do lote de fichas antes da conferência individual.
 *
 * As fichas do mesmo cargo viram um grupo: o gestor (ou a equipe Aveto)
 * decide cargo e setor uma vez e todas herdam. Cargo lido como rótulo
 * genérico ("Importação eSocial") nunca vira cargo: cada ficha é decidida
 * à parte. Nada aqui cadastra colaborador — só sugere e lê o que foi salvo.
 */
import { matchCargo, normalizeCargoNome, normalizeCbo, type CargoCadastrado } from "./cargo-match";

export type ItemLote = {
  id: string;
  status: string;
  nome_extraido?: string | null;
  cpf_extraido?: string | null;
  dados_extraidos?: unknown;
};

export type SetorCadastrado = { id: string; nome: string; unidade_id: string | null };

export type GrupoCargoLote = {
  /** Chave estável do grupo (nome + CBO normalizados) ou `item:<id>` para rótulo genérico. */
  chave: string;
  cargoNome: string;
  cbo: string | null;
  itemIds: string[];
  nomes: string[];
  salarioMin: number | null;
  salarioMax: number | null;
  /** Rótulo da contabilidade que não é cargo: pede o cargo real ficha a ficha. */
  generico: boolean;
  /** Cargo já cadastrado que corresponde ao grupo (mesmo critério do cartão). */
  cargoExistenteId: string | null;
  setorSugerido: string | null;
};

export type OrganizacaoLote = {
  unidade_id?: string | null;
  sindicato_laboral_id?: string | null;
  grupos?: Record<string, { cargo_id: string | null; setor_id: string | null }>;
  itens?: Record<string, { cargo_id: string | null; setor_id: string | null }>;
  organizado_em?: string | null;
  notificacao?: { user_id: string; em: string; fichas: number } | null;
};

export const STATUS_PENDENTES = ["pendente", "revisar", "duplicado"];

const ROTULO_GENERICO = /(IMPORTA(C|Ç)(A|Ã)O|ESOCIAL|A DEFINIR|SEM CARGO|N(A|Ã)O INFORMADO)/;

export function cargoGenerico(nome: string | null | undefined): boolean {
  const n = normalizeCargoNome(nome);
  if (!n) return true;
  return ROTULO_GENERICO.test(String(nome ?? "").toUpperCase()) || ROTULO_GENERICO.test(n);
}

/** Setores clássicos do food service. */
export const SETORES_FOOD = ["Cozinha", "Salão e Atendimento", "Bar", "Limpeza e Higiene", "Administração e Apoio"] as const;

const REGRAS_SETOR: Array<{ setor: (typeof SETORES_FOOD)[number]; termos: RegExp }> = [
  { setor: "Bar", termos: /\b(BARMAN|BARTENDER|BARISTA|COQUETELEIRO|BAR)\b/ },
  { setor: "Limpeza e Higiene", termos: /(LIMPEZA|FAXIN|HIGIEN|SERVICOS GERAIS|ZELADOR|LAVADOR)/ },
  {
    setor: "Cozinha",
    termos: /(COZINH|CHURRASQ|CHAPEIR|PIZZAI|SUSHI|CONFEIT|PADEIR|PADARIA|COPA|COPEIR|SALGADEIR|MASSEIR|ACOUG|CHEF|SALADEIR|FRITADEIR|GRELHA|LANCHEIR|SANDUICH)/,
  },
  {
    setor: "Salão e Atendimento",
    termos: /(ATENDENTE|GARCO|GARCON|GARCONETE|CUMIM|COMMIS|MAITRE|CAIXA|RECEPCION|HOSTESS|RECEPCAO|CAPITAO|SALAO|ENTREGADOR|MOTOBOY)/,
  },
  {
    setor: "Administração e Apoio",
    termos: /(ADMINISTRA|COMPRA|ALMOXARIF|NUTRICION|ESTOQU|GERENTE|FINANCEIR|ESCRITORIO|RECURSOS HUMANOS|\bRH\b|CONTAB|SUPERVISOR|ENCARREGAD|MANUTEN|ELETRICIST|MOTORISTA|ASSISTENTE)/,
  },
];

/** Setor sugerido pelo nome do cargo, com o CBO como desempate. */
export function setorSugeridoParaCargo(cargoNome: string | null | undefined, cbo?: string | null): string | null {
  const n = normalizeCargoNome(cargoNome);
  if (n && !cargoGenerico(cargoNome)) {
    for (const r of REGRAS_SETOR) if (r.termos.test(n)) return r.setor;
  }
  const c = normalizeCbo(cbo);
  if (c.length >= 4) {
    const f = c.slice(0, 4);
    if (f === "5132" || f === "5135" || f === "8483" || f === "8484") return "Cozinha";
    if (c.startsWith("513425")) return "Cozinha";
    if (c.startsWith("513420")) return "Bar";
    if (f === "5134" || f === "4211" || f === "4221") return "Salão e Atendimento";
    if (f === "5143" || f === "5142" || f === "5141") return "Limpeza e Higiene";
    if (c.startsWith("41") || c.startsWith("14") || c.startsWith("2237") || c.startsWith("39")) return "Administração e Apoio";
  }
  return null;
}

function dadosDe(item: ItemLote): Record<string, unknown> {
  return (item.dados_extraidos ?? {}) as Record<string, unknown>;
}

/** Chave do grupo de cargo de uma ficha. */
export function chaveCargoItem(item: ItemLote): string {
  const d = dadosDe(item);
  const nome = d.cargo_nome as string | null | undefined;
  if (cargoGenerico(nome)) return `item:${item.id}`;
  return `${normalizeCargoNome(nome)}|${normalizeCbo(d.cbo as string | null | undefined)}`;
}

function numero(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Agrupa as fichas pendentes por cargo, do grupo maior para o menor; genéricos no fim. */
export function agruparCargosLote(itens: ItemLote[], cargos: CargoCadastrado[]): GrupoCargoLote[] {
  const mapa = new Map<string, GrupoCargoLote>();
  for (const item of itens) {
    if (!STATUS_PENDENTES.includes(item.status)) continue;
    const d = dadosDe(item);
    const chave = chaveCargoItem(item);
    const nomePessoa = String(d.nome ?? item.nome_extraido ?? "Ficha sem nome");
    const sal = numero(d.salario);
    let g = mapa.get(chave);
    if (!g) {
      const generico = chave.startsWith("item:");
      const cargoNome = String(d.cargo_nome ?? "").trim();
      const cbo = normalizeCbo(d.cbo as string | null | undefined) || null;
      const m = generico ? null : matchCargo({ cargo_nome: cargoNome, cbo }, cargos);
      g = {
        chave,
        cargoNome,
        cbo,
        itemIds: [],
        nomes: [],
        salarioMin: null,
        salarioMax: null,
        generico,
        cargoExistenteId: m && (m.motivo === "cbo_e_nome" || m.motivo === "nome") ? m.cargo_id : null,
        setorSugerido: generico ? null : setorSugeridoParaCargo(cargoNome, cbo),
      };
      mapa.set(chave, g);
    }
    g.itemIds.push(item.id);
    g.nomes.push(nomePessoa);
    if (sal !== null) {
      g.salarioMin = g.salarioMin === null ? sal : Math.min(g.salarioMin, sal);
      g.salarioMax = g.salarioMax === null ? sal : Math.max(g.salarioMax, sal);
    }
  }
  return [...mapa.values()].sort((a, b) => {
    if (a.generico !== b.generico) return a.generico ? 1 : -1;
    return b.itemIds.length - a.itemIds.length || a.cargoNome.localeCompare(b.cargoNome);
  });
}

/** Setor já cadastrado na unidade com o mesmo nome (sem acento/caixa). */
export function setorExistenteNaUnidade(
  nome: string | null | undefined,
  setores: SetorCadastrado[],
  unidadeId: string | null,
): SetorCadastrado | null {
  const alvo = normalizeCargoNome(nome);
  if (!alvo || !unidadeId) return null;
  return setores.find((s) => s.unidade_id === unidadeId && normalizeCargoNome(s.nome) === alvo) ?? null;
}

/** Cargo e setor decididos na organização do lote para uma ficha (a escolha por ficha prevalece). */
export function vinculoOrganizado(
  item: ItemLote,
  org: OrganizacaoLote | null | undefined,
): { cargoId: string | null; setorId: string | null } | null {
  if (!org) return null;
  const porItem = org.itens?.[item.id];
  if (porItem) return { cargoId: porItem.cargo_id ?? null, setorId: porItem.setor_id ?? null };
  const porGrupo = org.grupos?.[chaveCargoItem(item)];
  if (porGrupo) return { cargoId: porGrupo.cargo_id ?? null, setorId: porGrupo.setor_id ?? null };
  return null;
}

/** Situação de uma ficha na lista compacta. */
export function situacaoFichaLote(
  item: ItemLote,
  org: OrganizacaoLote | null | undefined,
): "concluida" | "ignorada" | "pronta" | "atencao" {
  if (item.status === "criado" || item.status === "atualizado") return "concluida";
  if (item.status === "ignorado") return "ignorada";
  const d = dadosDe(item);
  const v = vinculoOrganizado(item, org);
  const cpf = String(d.cpf ?? item.cpf_extraido ?? "").replace(/\D/g, "");
  if (!v?.cargoId || item.status === "duplicado" || item.status === "revisar" || cpf.length !== 11) return "atencao";
  return "pronta";
}

/**
 * Turno da maioria do lote: só preenche fichas sem horário lido no PDF e só
 * se o turno ainda existe. Horário lido ou turno escolhido na ficha prevalecem.
 */
export function turnoPadraoDoLote(
  jornadaVazia: boolean,
  turnoPadraoId: string | null | undefined,
  turnos: Array<{ id: string }>,
): string | null {
  if (!jornadaVazia || !turnoPadraoId) return null;
  return turnos.some((t) => t.id === turnoPadraoId) ? turnoPadraoId : null;
}
