import type { MoreGroup, NavLeaf } from "@/config/mobileNav";

/**
 * Busca do menu "Mais" (mobile).
 *
 * Antes a busca só encontrava pelo trecho exato do rótulo ("colaborad" achava
 * "Colaboradores", mas "funcionario" não achava nada). Aqui a busca considera:
 *  - rótulo do item (sem acentos, por palavras);
 *  - rótulo do grupo/subgrupo onde o item está ("rotina", "documentos"…);
 *  - a própria rota (/dp/folgas);
 *  - sinônimos comuns do dia a dia (ver SYNONYMS).
 * Resultados são ordenados por relevância (rótulo começa com o termo primeiro).
 */

export const normalizeTerm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

/** Sinônimos por rota: palavras que a pessoa digita e que não estão no rótulo. */
const SYNONYMS: Record<string, string[]> = {
  "/dp/colaboradores": ["funcionario", "funcionarios", "empregado", "equipe", "pessoal", "time", "gente"],
  
  "/dp/cadastros/cargos": ["salario", "piso", "funcao", "remuneracao"],
  "/dp/cadastros/unidades": ["loja", "filial", "restaurante", "estabelecimento"],
  "/dp/cadastros/beneficios": ["vale", "va", "vt", "transporte", "alimentacao", "plano de saude"],
  "/dp/cadastros/pendencias": ["pendente", "falta documento", "incompleto"],
  "/dp/escalas/mes": ["escala", "rotina", "operacao", "calendario da equipe", "turno"],
  "/dp/ocorrencias": ["falta", "atraso", "saida antecipada", "abono"],
  "/dp/convocacoes": ["intermitente", "chamar", "convocar", "extra"],
  "/dp/folgas": ["descanso", "dsr", "domingo", "day off"],
  "/dp/ferias": ["vacacao", "descanso anual", "abono pecuniario"],
  "/dp/documentos": ["arquivo", "upload", "anexo", "importar"],
  "/dp/documentos/historico": ["arquivos enviados", "anexos"],
  "/dp/atestados": ["medico", "afastamento", "saude", "cid"],
  "/dp/disciplinar": ["advertencia", "suspensao", "punicao"],
  "/dp/mensagens": ["chat", "conversa", "recado"],
  "/dp/avisos": ["mural", "comunicado", "quadro"],
  "/dp/notificacoes": ["alerta", "aviso"],
  "/dp/analytics": ["indicadores", "graficos", "relatorio", "dashboard"],
  "/dp/configuracoes": ["ajustes", "parametros", "regras"],
  "/dp/conformidade": ["sesmt", "seguranca", "cipa", "epi"],
  "/dp/meu/calendario": ["minha agenda", "meus dias"],
  "/dp/meu/escala": ["meu horario", "meus turnos"],
  "/dp/meu/ponto": ["marcacao", "batida", "registro de ponto"],
  "/dp/meu/perfil": ["meus dados", "cadastro", "conta"],
  "/dp/meu/documentos": ["meus arquivos", "holerite", "contracheque"],
  "/lancamentos": ["despesa", "receita", "conta a pagar", "conta a receber", "boleto", "pagamento"],
  "/contas-bancarias": ["banco", "saldo", "caixa", "conta corrente"],
  "/cartoes-credito": ["cartao", "fatura", "credito"],
  "/contatos": ["cliente", "fornecedor", "cnpj", "cpf"],
  "/categorias": ["plano de contas", "classificacao"],
  "/fluxo-caixa": ["projecao", "caixa", "saldo futuro"],
  "/orcamento": ["meta", "limite", "budget"],
  "/relatorios/contabeis": ["dre", "resultado", "contabil"],
  "/relatorios/fluxo-caixa": ["relatorio", "matriz", "mensal"],
  "/formas-pagamento": ["pix", "dinheiro", "debito", "maquininha"],
  "/centros-custo": ["rateio", "setor", "departamento"],
  "/contas-contabeis": ["contabilidade", "plano contabil"],
  "/empresas": ["cnpj", "matriz", "tenant"],
  "/gestao-usuarios": ["permissao", "acesso", "convite", "perfil de acesso"],
  "/planos": ["assinatura", "pagamento", "upgrade"],
  "/faturas": ["cobranca", "boleto", "nota"],
  "/configuracoes": ["ajustes", "preferencias", "tema"],
};

export type NavSearchResult = NavLeaf & {
  /** Grupo/subgrupo de origem, para dar contexto ao resultado. */
  groupLabel?: string;
};

type Indexed = { item: NavSearchResult; haystack: string };

function indexGroups(groups: MoreGroup[]): Indexed[] {
  const out: Indexed[] = [];
  const push = (item: NavLeaf, groupLabel: string | undefined, extra: string) => {
    out.push({
      item: { ...item, groupLabel },
      haystack: normalizeTerm(
        [item.label, groupLabel ?? "", extra, item.to.replace(/[/-]/g, " "), (SYNONYMS[item.to] ?? []).join(" ")].join(" "),
      ),
    });
  };
  for (const g of groups) {
    for (const it of g.items ?? []) push(it, g.label, g.label);
    for (const sg of g.subgroups ?? []) {
      for (const it of sg.items) push(it, sg.label, `${g.label} ${sg.label}`);
    }
  }
  return out;
}

/** Retorna itens que casam com TODAS as palavras digitadas, por relevância. */
export function searchNavItems(groups: MoreGroup[], query: string): NavSearchResult[] {
  const terms = normalizeTerm(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];

  const scored = indexGroups(groups)
    .map(({ item, haystack }) => {
      if (!terms.every((t) => haystack.includes(t))) return null;
      const label = normalizeTerm(item.label);
      const first = terms[0];
      let score = 0;
      if (label === first) score = 100;
      else if (label.startsWith(first)) score = 80;
      else if (label.split(/\s+/).some((w) => w.startsWith(first))) score = 60;
      else if (label.includes(first)) score = 40;
      else score = 20;
      return { item, score };
    })
    .filter((x): x is { item: NavSearchResult; score: number } => x !== null);

  const seen = new Set<string>();
  return scored
    .sort((a, b) => b.score - a.score || a.item.label.localeCompare(b.item.label))
    .filter(({ item }) => (seen.has(item.to) ? false : (seen.add(item.to), true)))
    .map(({ item }) => item);
}
