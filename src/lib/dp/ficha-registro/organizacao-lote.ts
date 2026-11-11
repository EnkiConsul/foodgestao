/**
 * Organização do lote de fichas antes da conferência individual.
 *
 * As fichas do mesmo cargo viram um grupo: o gestor (ou a equipe Aveto)
 * decide cargo e setor uma vez e todas herdam. Cargo lido como rótulo
 * genérico ("Importação eSocial") nunca vira cargo: cada ficha é decidida
 * à parte. Nada aqui cadastra colaborador — só sugere e lê o que foi salvo.
 */
import { matchCargo, normalizeCargoNome, normalizeCbo, type CargoCadastrado } from "./cargo-match";
import { inferirRegime } from "./inferencia";
import { montarPayloadFicha } from "./payload";
import { escolhasObrigatoriasFaltando } from "./validacao";
import { camposFaltando } from "@/lib/dp/cadastro-completude";

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
  /** Padrões da maioria salvos no lote (chave presente com null = "conforme cada ficha"). */
  padroes?: EscolhasLote;
  /** Ajustes e rascunho de cada ficha, salvos sem criar o colaborador. */
  ajustes?: Record<string, AjusteFichaLote>;
};

/** Escolhas que valem para o lote todo ou para um grupo de fichas. */
export type EscolhasLote = {
  regime?: string | null;
  forma_pagamento?: string | null;
  adiantamento?: boolean | null;
  turno_id?: string | null;
};

/** O que já foi decidido numa ficha: vence os padrões do lote. */
export type AjusteFichaLote = EscolhasLote & {
  cargo_id?: string | null;
  setor_id?: string | null;
  /** Campos da ficha corrigidos ou completados (telefone, e-mail, endereço…). */
  dados?: Record<string, unknown>;
  em?: string;
};

export const STATUS_PENDENTES = ["pendente", "revisar", "duplicado"];

const ROTULO_GENERICO = /(IMPORTA(C|Ç)(A|Ã)O|ESOCIAL|A DEFINIR|SEM CARGO|N(A|Ã)O INFORMADO)/;

export function cargoGenerico(nome: string | null | undefined): boolean {
  const n = normalizeCargoNome(nome);
  if (!n) return true;
  return ROTULO_GENERICO.test(String(nome ?? "").toUpperCase()) || ROTULO_GENERICO.test(n);
}

/**
 * Setores clássicos do food service, sempre em uma palavra. "Salão" reúne as
 * funções específicas de mesa (garçom, cumim, maître); "Atendimento" é o setor
 * abrangente da frente de loja (atendente, caixa, recepção, balcão, entrega).
 */
export const SETORES_FOOD = ["Cozinha", "Salão", "Atendimento", "Bar", "Limpeza", "Administração"] as const;
export type SetorFood = (typeof SETORES_FOOD)[number];

const REGRAS_SETOR: Array<{ setor: SetorFood; termos: RegExp }> = [
  { setor: "Bar", termos: /\b(BARMAN|BARTENDER|BARISTA|COQUETELEIRO|BAR)\b/ },
  { setor: "Limpeza", termos: /(LIMPEZA|FAXIN|HIGIEN|SERVICOS GERAIS|ZELADOR|LAVADOR)/ },
  { setor: "Salão", termos: /(GARCO|GARCON|GARCONETE|CUMIM|COMMIS|MAITRE|CAPITAO|SALAO|SOMMELIER|CHEFE DE FILA)/ },
  {
    setor: "Cozinha",
    termos: /(COZINH|CHURRASQ|CHAPEIR|PIZZAI|SUSHI|CONFEIT|PADEIR|PADARIA|COPA|COPEIR|SALGADEIR|MASSEIR|ACOUG|CHEF|SALADEIR|FRITADEIR|GRELHA|LANCHEIR|SANDUICH)/,
  },
  {
    setor: "Atendimento",
    termos: /(ATENDENTE|ATENDIMENTO|CAIXA|RECEPCION|HOSTESS|RECEPCAO|BALCON|BALCAO|ENTREGADOR|MOTOBOY|DELIVERY|TELEFONIST)/,
  },
  {
    setor: "Administração",
    termos: /(ADMINISTRA|COMPRA|ALMOXARIF|NUTRICION|ESTOQU|GERENTE|FINANCEIR|ESCRITORIO|RECURSOS HUMANOS|\bRH\b|CONTAB|SUPERVISOR|ENCARREGAD|MANUTEN|ELETRICIST|MOTORISTA|ASSISTENTE)/,
  },
];

/** Setor sugerido pelo nome do cargo, com o CBO como desempate. */
export function setorSugeridoParaCargo(cargoNome: string | null | undefined, cbo?: string | null): SetorFood | null {
  const n = normalizeCargoNome(cargoNome);
  if (n && !cargoGenerico(cargoNome)) {
    for (const r of REGRAS_SETOR) if (r.termos.test(n)) return r.setor;
  }
  const c = normalizeCbo(cbo);
  if (c.length >= 4) {
    const f = c.slice(0, 4);
    if (f === "5132" || f === "5135" || f === "8483" || f === "8484") return "Cozinha";
    if (c.startsWith("513425") || c.startsWith("513430")) return "Cozinha";
    if (c.startsWith("513420") || c.startsWith("513440")) return "Bar";
    if (c.startsWith("513405") || c.startsWith("513410") || c.startsWith("513415")) return "Salão";
    if (f === "5134" || f === "4211" || f === "4221") return "Atendimento";
    if (f === "5143" || f === "5142" || f === "5141") return "Limpeza";
    if (c.startsWith("41") || c.startsWith("14") || c.startsWith("2237") || c.startsWith("39")) return "Administração";
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
  const aj = org.ajustes?.[item.id];
  const base = vinculoOrganizadoBase(item, org);
  if (aj && ("cargo_id" in aj || "setor_id" in aj)) {
    return {
      cargoId: "cargo_id" in aj ? aj.cargo_id ?? null : base?.cargoId ?? null,
      setorId: "setor_id" in aj ? aj.setor_id ?? null : base?.setorId ?? null,
    };
  }
  return base;
}

function vinculoOrganizadoBase(
  item: ItemLote,
  org: OrganizacaoLote,
): { cargoId: string | null; setorId: string | null } | null {
  const porItem = org.itens?.[item.id];
  if (porItem) return { cargoId: porItem.cargo_id ?? null, setorId: porItem.setor_id ?? null };
  const porGrupo = org.grupos?.[chaveCargoItem(item)];
  if (porGrupo) return { cargoId: porGrupo.cargo_id ?? null, setorId: porGrupo.setor_id ?? null };
  return null;
}

/** Dados lidos do PDF com o que já foi completado no rascunho da ficha. */
export function dadosDaFichaLote(item: ItemLote, org: OrganizacaoLote | null | undefined): Record<string, unknown> {
  const extra = org?.ajustes?.[item.id]?.dados;
  return extra ? { ...dadosDe(item), ...extra } : dadosDe(item);
}

/**
 * Escolha que vale para a ficha: a da própria ficha (rascunho ou ação em grupo)
 * vence o padrão do lote; chave ausente segue o padrão, `undefined` = sem escolha.
 */
export function escolhaDaFicha<K extends keyof EscolhasLote>(
  item: ItemLote,
  org: OrganizacaoLote | null | undefined,
  chave: K,
): EscolhasLote[K] | undefined {
  const aj = org?.ajustes?.[item.id];
  if (aj && chave in aj) return aj[chave];
  const pad = org?.padroes;
  if (pad && chave in pad) return pad[chave];
  return undefined;
}

const temTexto = (v: unknown) => typeof v === "string" ? v.replace(/\s/g, "").length > 0 : v !== null && v !== undefined && v !== "";

/**
 * Dados para acesso ao portal: telefone/WhatsApp ou e-mail. Sem nenhum deles a
 * pessoa é cadastrada, mas não recebe o convite do portal até alguém preencher.
 */
export function semDadosAcesso(dados: Record<string, unknown>): boolean {
  return !temTexto(dados.telefone) && !temTexto(dados.whatsapp) && !temTexto(dados.email) && !temTexto(dados.email_contato);
}

/** Padrões escolhidos para a maioria do lote (valem onde a ficha não tem escolha própria). */
export type PadroesLote = {
  regime?: string | null;
  /** true = optante, false = não optante, null = decidir ficha a ficha. */
  adiantamento?: boolean | null;
  /** A unidade usa registro de ponto: a folha de ponto é decidida na ficha. */
  unidadeTemPonto?: boolean;
};

export type ContextoFichaLote = {
  padroes?: PadroesLote;
  /** Forma de pagamento sugerida pela ficha (mesma inferência do cartão de conferência). */
  formaPagamento?: string | null;
  /** Salário de referência do cargo na unidade: cobre ficha sem salário. */
  salarioCargo?: number | null;
  /** A empresa usa setores: setor em branco aparece como complemento. */
  exigirSetor?: boolean;
};

export type PendenciasFichaLote = {
  /** Impedem salvar a ficha: a lista mostra "Atenção" com estes motivos. */
  obrigatorias: string[];
  /** Não impedem o cadastro, mas não vieram na ficha: aparecem sem esconder. */
  complementares: string[];
  /** Sem telefone/WhatsApp e sem e-mail: não acessa o portal até preencher. */
  semAcesso: boolean;
};

/**
 * O que ainda falta numa ficha do lote, com as mesmas regras do cartão de
 * conferência: só é "pronta" quem abre e salva sem nenhuma parada forçada.
 */
export function pendenciasFichaLote(
  item: ItemLote,
  org: OrganizacaoLote | null | undefined,
  ctx: ContextoFichaLote = {},
): PendenciasFichaLote {
  const d = dadosDaFichaLote(item, org);
  const v = vinculoOrganizado(item, org);
  const padroes = ctx.padroes ?? {};
  const regimeFicha = escolhaDaFicha(item, org, "regime");
  const adiantFicha = org?.ajustes?.[item.id] && "adiantamento" in org.ajustes[item.id]
    ? org.ajustes[item.id].adiantamento
    : undefined;
  const formaFicha = escolhaDaFicha(item, org, "forma_pagamento");
  const obrigatorias: string[] = [];
  if (item.status === "duplicado") obrigatorias.push("conferir cadastro existente");
  if (item.status === "revisar") obrigatorias.push("revisar leitura");
  const cpf = String(d.cpf ?? item.cpf_extraido ?? "").replace(/\D/g, "");
  if (cpf.length !== 11) obrigatorias.push("CPF");
  if (!v?.cargoId) obrigatorias.push("cargo");
  const regime = regimeFicha ?? padroes.regime ?? inferirRegime(d);
  obrigatorias.push(
    ...escolhasObrigatoriasFaltando({
      regime,
      formaPagamento: formaFicha ?? ctx.formaPagamento ?? null,
      possuiFolhaPonto: padroes.unidadeTemPonto ? null : false,
      optanteAdiantamento: adiantFicha !== undefined && adiantFicha !== null ? adiantFicha : padroes.adiantamento ?? null,
    }),
  );
  const complementares = camposFaltando(
    { ...montarPayloadFicha(d), setor_id: v?.setorId ?? null, regime },
    { exigirSetor: ctx.exigirSetor ?? true, salarioCargo: ctx.salarioCargo ?? null },
  )
    .filter((c) => !["dados_pagamento", "cargo_id", "regime"].includes(c.chave))
    .map((c) => c.label);
  return { obrigatorias, complementares, semAcesso: semDadosAcesso(d) };
}

/** Situação de uma ficha na lista compacta. */
export function situacaoFichaLote(
  item: ItemLote,
  org: OrganizacaoLote | null | undefined,
  ctx: ContextoFichaLote = {},
): SituacaoFichaLote {
  if (item.status === "criado" || item.status === "atualizado") return "concluida";
  if (item.status === "ignorado") return "ignorada";
  return situacaoPorPendencias(pendenciasFichaLote(item, org, ctx));
}

export type SituacaoFichaLote = "concluida" | "ignorada" | "pronta" | "atencao" | "acesso";

/**
 * "Pronta" só quando salva sem parada E a pessoa terá como entrar no portal.
 * Sem dados de acesso a ficha pode ser criada, mas não aparece como pronta.
 */
export function situacaoPorPendencias(p: PendenciasFichaLote): SituacaoFichaLote {
  if (p.obrigatorias.length > 0) return "atencao";
  if (p.semAcesso) return "acesso";
  return "pronta";
}

/** Contagem de fichas por setor (setor do lote), para os atalhos de grupo. */
export function setoresDoLote(
  itens: ItemLote[],
  org: OrganizacaoLote | null | undefined,
  setores: Array<{ id: string; nome: string }>,
): Array<{ id: string | null; nome: string; itemIds: string[] }> {
  const mapa = new Map<string, { id: string | null; nome: string; itemIds: string[] }>();
  for (const item of itens) {
    if (!STATUS_PENDENTES.includes(item.status)) continue;
    const setorId = vinculoOrganizado(item, org)?.setorId ?? null;
    const nome = setores.find((s) => s.id === setorId)?.nome ?? "Sem setor";
    const chave = setorId ?? "__sem";
    const g = mapa.get(chave) ?? { id: setorId, nome, itemIds: [] };
    g.itemIds.push(item.id);
    mapa.set(chave, g);
  }
  return [...mapa.values()].sort((a, b) => {
    if ((a.id === null) !== (b.id === null)) return a.id === null ? 1 : -1;
    return b.itemIds.length - a.itemIds.length || a.nome.localeCompare(b.nome);
  });
}

/**
 * Ajuste em grupo: só o que foi escolhido entra. O turno nunca substitui um
 * horário lido no PDF — essas fichas ficam de fora e são contadas à parte.
 */
export function ajustesEmGrupo(
  itemIds: string[],
  escolhas: EscolhasLote,
  temHorarioLido: (itemId: string) => boolean,
): { itens: Record<string, EscolhasLote>; turnoMantido: number } {
  const itens: Record<string, EscolhasLote> = {};
  let turnoMantido = 0;
  for (const id of itemIds) {
    const e: EscolhasLote = {};
    if ("regime" in escolhas) e.regime = escolhas.regime ?? null;
    if ("adiantamento" in escolhas) e.adiantamento = escolhas.adiantamento ?? null;
    if ("forma_pagamento" in escolhas) e.forma_pagamento = escolhas.forma_pagamento ?? null;
    if ("turno_id" in escolhas) {
      if (temHorarioLido(id)) turnoMantido += 1;
      else e.turno_id = escolhas.turno_id ?? null;
    }
    if (Object.keys(e).length > 0) itens[id] = e;
  }
  return { itens, turnoMantido };
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

/** Confere o contato rápido da lista: precisa de WhatsApp com DDD ou e-mail válido. */
export function contatoValido(c: { whatsapp: string; email: string }): string | null {
  const tel = c.whatsapp.replace(/\D/g, "");
  const mail = c.email.trim();
  if (!tel && !mail) return "Informe o WhatsApp ou o e-mail.";
  if (tel && (tel.length < 10 || tel.length > 13)) return "WhatsApp com DDD: 10 ou 11 dígitos.";
  if (mail && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mail)) return "E-mail inválido.";
  return null;
}

/**
 * Etapa 2: o que pede decisão vem primeiro — fichas sem cargo real (rótulo
 * genérico) e, logo depois, cargos que ficaram sem setor. O resto já está certo.
 */
export function separarGruposCargo<T extends { generico: boolean }>(
  grupos: T[],
  semSetor: (g: T) => boolean,
): { atencao: T[]; identificados: T[] } {
  const genericos = grupos.filter((g) => g.generico);
  const orfaos = grupos.filter((g) => !g.generico && semSetor(g));
  const identificados = grupos.filter((g) => !g.generico && !semSetor(g));
  return { atencao: [...genericos, ...orfaos], identificados };
}

/** Atalho de setor na escolha de pessoas: marca o grupo inteiro ou, se já estava todo marcado, desmarca. */
export function alternarGrupo(selecionados: ReadonlySet<string>, ids: string[]): Set<string> {
  const prox = new Set(selecionados);
  const todos = ids.length > 0 && ids.every((id) => prox.has(id));
  for (const id of ids) {
    if (todos) prox.delete(id);
    else prox.add(id);
  }
  return prox;
}

export type ContatoEditado = { whatsapp: string; email: string };

/**
 * Contatos preenchidos na lista rápida → rascunho das fichas. Linhas vazias são
 * ignoradas; o que já estava no rascunho é mantido (o banco troca `dados` inteiro).
 * O WhatsApp também vira telefone quando a ficha não trouxe nenhum.
 */
export function montarContatosLote(
  edicoes: Record<string, ContatoEditado>,
  base: (itemId: string) => { anterior: Record<string, unknown>; lidos: Record<string, unknown> },
): { itens: Record<string, { dados: Record<string, unknown> }>; invalidos: string[] } {
  const itens: Record<string, { dados: Record<string, unknown> }> = {};
  const invalidos: string[] = [];
  for (const [id, c] of Object.entries(edicoes)) {
    const whatsapp = c.whatsapp.replace(/\D/g, "");
    const email = c.email.trim().toLowerCase();
    if (!whatsapp && !email) continue;
    if (contatoValido({ whatsapp, email })) {
      invalidos.push(id);
      continue;
    }
    const { anterior, lidos } = base(id);
    const dados: Record<string, unknown> = { ...anterior };
    if (whatsapp) {
      dados.whatsapp = whatsapp;
      if (!temTexto(lidos.telefone) && !temTexto(anterior.telefone)) dados.telefone = whatsapp;
    }
    if (email) dados.email = email;
    itens[id] = { dados };
  }
  return { itens, invalidos };
}

const MINUSCULAS_SETOR = new Set(["e", "de", "da", "do", "das", "dos", "a", "o"]);

/**
 * Nome do setor para exibir: o cadastro guarda em caixa alta ("COZINHA"),
 * a tela mostra em caixa normal ("Cozinha"). Nomes já escritos com
 * minúsculas ficam como estão. Só muda a apresentação, nunca o valor salvo.
 */
export function rotuloSetor(nome: string | null | undefined): string {
  const s = String(nome ?? "").trim();
  if (!s || s !== s.toLocaleUpperCase("pt-BR") || !/\p{L}/u.test(s)) return s;
  return s
    .toLocaleLowerCase("pt-BR")
    .split(/(\s+)/)
    .map((p, i) => (/^\s+$/.test(p) || (i > 0 && MINUSCULAS_SETOR.has(p)) ? p : p.charAt(0).toLocaleUpperCase("pt-BR") + p.slice(1)))
    .join("");
}
