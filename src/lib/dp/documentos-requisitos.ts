import type { Database } from "@/integrations/supabase/types";

export type DpDocumentoRequisito = Database["public"]["Tables"]["dp_documento_requisitos"]["Row"];
export type DpColaboradorDocumento = Database["public"]["Tables"]["dp_colaborador_documentos"]["Row"];

export type Obrigatoriedade = "obrigatorio" | "opcional" | "desativado";
export type StatusItem =
  | "pendente"
  | "enviado"
  | "aprovado"
  | "recusado"
  | "dispensado"
  | "vencendo"
  | "vencido";

export const CATEGORIA_LABEL: Record<string, string> = {
  admissao: "Admissão",
  situacao: "Situação do colaborador",
  cargo_dirige: "Cargos que dirigem",
  veiculo: "Veículo",
  regime: "Regime de contratação",
  dependente: "Dependentes",
};

export const APLICA_LABEL: Record<string, string> = {
  todos: "Todos os colaboradores",
  cargo_dirige: "Cargo que exige CNH",
  veiculo_proprio: "Colaborador com veículo próprio",
  veiculo_empresa: "Colaborador que usa veículo da empresa",
  menor: "Menor de 18 anos / aprendiz",
  regime_pj: "Regime PJ ou MEI",
  regime_clt: "Regime com controle de ponto (CLT)",
  estado_civil_casado: "Casado ou união estável",
  exige_epi: "Cargo que exige EPI",
  dependente: "Todo dependente",
  dependente_ate_7: "Dependente com até 7 anos",
  dependente_acima_7: "Dependente a partir de 7 anos",
  dependente_invalido: "Dependente com invalidez/deficiência",
};

export const PERIODICIDADE_LABEL: Record<string, string> = {
  unica: "Uma vez",
  anual: "Anual",
  semestral: "Semestral",
  vencimento: "Pelo vencimento do documento",
};

export const STATUS_LABEL: Record<StatusItem, string> = {
  pendente: "Pendente",
  enviado: "Aguardando aprovação",
  aprovado: "Aprovado",
  recusado: "Recusado",
  dispensado: "Dispensado",
  vencendo: "Vencendo",
  vencido: "Vencido",
};

export type ColaboradorContexto = {
  id: string;
  data_nascimento?: string | null;
  regime?: string | null;
  /** Vínculo do cadastro; sócio não segue requisitos de folha CLT nem de PJ/MEI. */
  tipo_vinculo?: string | null;
  estado_civil?: string | null;
  veiculo_proprio?: boolean | null;
  aprendiz?: boolean | null;
  possui_folha_ponto?: boolean | null;
  cargo_exige_cnh?: boolean | null;
  cargo_exige_epi?: boolean | null;
};


export type DependenteContexto = {
  id: string;
  nome: string;
  data_nascimento?: string | null;
  deficiencia?: boolean | null;
  cessado_em?: string | null;
};

export type ItemChecklist = {
  /** Chave única (requisito + dependente, quando houver). */
  key: string;
  requisito: DpDocumentoRequisito;
  dependente?: DependenteContexto | null;
  /** Anexo principal (o aprovado mais recente ou o último enviado). */
  vinculo?: DpColaboradorDocumento | null;
  /** Todos os anexos do item (itens que permitem vários arquivos). */
  anexos: DpColaboradorDocumento[];
  status: StatusItem;
  obrigatorio: boolean;
  validade: string | null;
  diasParaVencer: number | null;
  /** Permite mais de um arquivo no mesmo item. */
  multiplos: boolean;
};


export function idadeEmAnos(nascimento?: string | null, base = new Date()): number | null {
  if (!nascimento) return null;
  const d = new Date(`${nascimento}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  let anos = base.getFullYear() - d.getFullYear();
  const m = base.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && base.getDate() < d.getDate())) anos--;
  return anos;
}

function diffDias(alvo: string, base: Date): number {
  const d = new Date(`${alvo}T00:00:00`).getTime();
  const b = new Date(base.getFullYear(), base.getMonth(), base.getDate()).getTime();
  return Math.round((d - b) / 86_400_000);
}

function addMeses(iso: string, meses: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  d.setMonth(d.getMonth() + meses);
  return d.toISOString().slice(0, 10);
}

/**
 * Validade efetiva do documento enviado: a data informada manualmente vence,
 * senão calcula pela periodicidade a partir do envio.
 */
export function calcularValidade(
  requisito: DpDocumentoRequisito,
  vinculo?: DpColaboradorDocumento | null,
): string | null {
  if (!vinculo) return null;
  if (vinculo.validade) return vinculo.validade;
  if (requisito.periodicidade === "anual" || requisito.periodicidade === "semestral") {
    const meses = requisito.meses_validade ?? (requisito.periodicidade === "anual" ? 12 : 6);
    return addMeses(vinculo.created_at, meses);
  }
  return null;
}

/** O requisito se aplica a este colaborador? */
export function requisitoAplicaColaborador(
  requisito: DpDocumentoRequisito,
  colab: ColaboradorContexto,
): boolean {
  if (requisito.obrigatoriedade === "desativado") return false;
  const regime = (colab.regime ?? "").toLowerCase();
  const idade = idadeEmAnos(colab.data_nascimento);
  switch (requisito.aplica_a) {
    case "todos":
      return true;
    case "cargo_dirige":
      return !!colab.cargo_exige_cnh;
    case "veiculo_proprio":
      return !!colab.cargo_exige_cnh && !!colab.veiculo_proprio;
    case "veiculo_empresa":
      return !!colab.cargo_exige_cnh && !colab.veiculo_proprio;
    case "menor":
      return !!colab.aprendiz || (idade !== null && idade < 18);
    case "regime_pj":
      return regime === "pj" || regime === "mei";
    case "regime_clt":
      return regime === "clt" || !!colab.possui_folha_ponto;
    case "estado_civil_casado":
      return ["casado", "casada", "uniao_estavel", "união estável"].includes(
        (colab.estado_civil ?? "").toLowerCase(),
      );
    case "exige_epi":
      return !!colab.cargo_exige_epi;
    default:
      return false;
  }
}

/** O requisito se aplica a este dependente? */
export function requisitoAplicaDependente(
  requisito: DpDocumentoRequisito,
  dep: DependenteContexto,
  hoje = new Date(),
): boolean {
  if (requisito.obrigatoriedade === "desativado") return false;
  if (dep.cessado_em) return false;
  const idade = idadeEmAnos(dep.data_nascimento, hoje);
  switch (requisito.aplica_a) {
    case "dependente":
      return true;
    case "dependente_ate_7":
      return idade !== null && idade < 7;
    case "dependente_acima_7":
      return idade !== null && idade >= 7;
    case "dependente_invalido":
      return !!dep.deficiencia;
    default:
      return false;
  }
}

function statusDoVinculo(
  requisito: DpDocumentoRequisito,
  vinculo: DpColaboradorDocumento | null | undefined,
  validade: string | null,
  hoje: Date,
): { status: StatusItem; dias: number | null } {
  if (!vinculo) return { status: "pendente", dias: null };
  if (vinculo.dispensado || vinculo.status === "dispensado") return { status: "dispensado", dias: null };
  if (vinculo.status === "recusado") return { status: "recusado", dias: null };
  const dias = validade ? diffDias(validade, hoje) : null;
  if (dias !== null && dias < 0) return { status: "vencido", dias };
  if (vinculo.status === "enviado") return { status: "enviado", dias };
  if (dias !== null && dias <= (requisito.dias_aviso ?? 30)) return { status: "vencendo", dias };
  return { status: "aprovado", dias };
}

export type ResolverInput = {
  requisitos: DpDocumentoRequisito[];
  colaborador: ColaboradorContexto;
  dependentes?: DependenteContexto[];
  vinculos?: DpColaboradorDocumento[];
  hoje?: Date;
};

const PRIORIDADE_STATUS: StatusItem[] = [
  "aprovado", "vencendo", "enviado", "dispensado", "vencido", "recusado", "pendente",
];

/** Status agregado de um item que pode ter vários anexos. */
function resolverItem(
  req: DpDocumentoRequisito,
  anexos: DpColaboradorDocumento[],
  hoje: Date,
): { status: StatusItem; dias: number | null; validade: string | null; principal: DpColaboradorDocumento | null } {
  if (anexos.length === 0) {
    return { status: "pendente", dias: null, validade: null, principal: null };
  }
  const avaliados = anexos.map((a) => {
    const validade = calcularValidade(req, a);
    const { status, dias } = statusDoVinculo(req, a, validade, hoje);
    return { anexo: a, status, dias, validade };
  });
  avaliados.sort(
    (a, b) => PRIORIDADE_STATUS.indexOf(a.status) - PRIORIDADE_STATUS.indexOf(b.status),
  );
  const melhor = avaliados[0];
  return { status: melhor.status, dias: melhor.dias, validade: melhor.validade, principal: melhor.anexo };
}

/** Monta o checklist resolvido do colaborador (inclui itens de dependentes). */
export function resolverChecklist({
  requisitos,
  colaborador,
  dependentes = [],
  vinculos = [],
  hoje = new Date(),
}: ResolverInput): ItemChecklist[] {
  const porChave = new Map<string, DpColaboradorDocumento[]>();
  for (const v of vinculos) {
    const k = `${v.requisito_id}:${v.dependente_id ?? ""}`;
    const lista = porChave.get(k) ?? [];
    lista.push(v);
    porChave.set(k, lista);
  }

  const itens: ItemChecklist[] = [];

  const montar = (
    req: DpDocumentoRequisito,
    dep: DependenteContexto | null,
  ): ItemChecklist => {
    const chave = `${req.id}:${dep?.id ?? ""}`;
    const anexos = [...(porChave.get(chave) ?? [])].sort(
      (a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""),
    );
    const { status, dias, validade, principal } = resolverItem(req, anexos, hoje);
    return {
      key: chave,
      requisito: req,
      dependente: dep,
      vinculo: principal,
      anexos,
      status,
      validade,
      diasParaVencer: dias,
      obrigatorio: req.obrigatoriedade === "obrigatorio",
      multiplos: !!req.permite_multiplos,
    };
  };

  for (const req of requisitos) {
    if (req.obrigatoriedade === "desativado") continue;
    if (req.categoria === "dependente") {
      for (const dep of dependentes) {
        if (!requisitoAplicaDependente(req, dep, hoje)) continue;
        itens.push(montar(req, dep));
      }
      continue;
    }
    if (!requisitoAplicaColaborador(req, colaborador)) continue;
    itens.push(montar(req, null));
  }


  const ordemStatus: StatusItem[] = [
    "vencido", "pendente", "recusado", "vencendo", "enviado", "aprovado", "dispensado",
  ];
  return itens.sort((a, b) => {
    const s = ordemStatus.indexOf(a.status) - ordemStatus.indexOf(b.status);
    if (s !== 0) return s;
    return (a.requisito.ordem ?? 0) - (b.requisito.ordem ?? 0);
  });
}

/** Resumo do checklist para badges e pendências. */
export function resumirChecklist(itens: ItemChecklist[]) {
  const pendentesObrigatorios = itens.filter(
    (i) => i.obrigatorio && ["pendente", "recusado", "vencido"].includes(i.status),
  );
  return {
    total: itens.length,
    pendentesObrigatorios,
    aguardandoAprovacao: itens.filter((i) => i.status === "enviado"),
    vencendo: itens.filter((i) => i.status === "vencendo"),
    aprovados: itens.filter((i) => i.status === "aprovado").length,
    conforme: pendentesObrigatorios.length === 0,
  };
}

/** Rótulo curto do item, já considerando o dependente. */
export function tituloItem(item: ItemChecklist): string {
  return item.dependente
    ? `${item.requisito.nome} — ${item.dependente.nome}`
    : item.requisito.nome;
}
