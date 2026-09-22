/**
 * Rotinas oficiais dos cadastros de remuneração e benefícios.
 *
 * O aplicativo não grava mais direto em cargos, pisos salariais, catálogo de
 * benefícios, padrões por escopo, adicional por tempo de serviço e benefícios do
 * colaborador: toda gravação passa pelo servidor, que confere empresa, unidade,
 * cargo, sindicato, faixas de valor e vigências.
 */
import { supabase } from "@/integrations/supabase/client";

type Json = Record<string, unknown>;

const MENSAGENS: Record<string, string> = {
  UNAUTHENTICATED: "Faça a entrada novamente para continuar.",
  FORBIDDEN: "Você não tem permissão para esta ação nesta empresa.",
  NOT_FOUND: "Registro não encontrado.",
  REM_DADOS_INVALIDOS: "Não foi possível ler os dados enviados.",
  REM_EMPRESA_OBRIGATORIA: "Selecione a empresa antes de salvar.",
  REM_CAMPO_NAO_PERMITIDO: "Há um campo que não pode ser alterado por aqui.",
  REM_REGISTRO_EXCLUIDO: "Este registro já foi excluído.",
  REM_CARGO_NOME_OBRIGATORIO: "Informe o nome do cargo.",
  REM_CARGO_INVALIDO: "O cargo escolhido não é desta empresa.",
  REM_UNIDADE_INVALIDA: "A unidade escolhida não é desta empresa.",
  REM_SINDICATO_INVALIDO: "O sindicato escolhido não é desta empresa.",
  REM_COLABORADOR_INVALIDO: "O colaborador escolhido não é desta empresa.",
  REM_BENEFICIO_INVALIDO: "O benefício escolhido não é desta empresa.",
  REM_BENEFICIO_NOME_OBRIGATORIO: "Informe o nome do benefício.",
  REM_SALARIO_INVALIDO: "Informe um salário válido (acima de zero).",
  REM_VALOR_INVALIDO: "O valor informado está fora do aceitável.",
  REM_PERCENTUAL_INVALIDO: "O percentual precisa ficar entre 0 e 100.",
  REM_DIAS_INVALIDOS: "A quantidade de dias informada está fora do aceitável.",
  REM_DIA_PAGAMENTO_INVALIDO: "O dia de pagamento precisa ficar entre 1 e 31.",
  REM_BASE_HORAS_INVALIDA: "A base de horas do mês está fora do aceitável.",
  REM_BASE_DIAS_INVALIDA: "A base de dias do mês está fora do aceitável.",
  REM_BASE_INVALIDA: "Escolha a base de cálculo do adicional.",
  REM_ESCOPO_INVALIDO: "Escolha corretamente o alcance da regra.",
  REM_CICLO_INVALIDO: "O ciclo informado está fora do aceitável.",
  REM_VIGENCIA_INVALIDA: "A data final não pode ser anterior à data inicial.",
  REM_PISO_ESCOPO_OBRIGATORIO: "Informe a unidade ou o sindicato patronal do piso.",
  REM_PISO_VIGENCIA_INVALIDA: "A data final do piso não pode ser anterior à data inicial.",
  REM_PISO_VIGENCIA_SOBREPOSTA: "Já existe um piso vigente neste período para este cargo.",
  REM_PISO_REDUCAO_SEM_JUSTIFICATIVA: "Para reduzir o piso é preciso informar a justificativa.",
  REM_ADICIONAL_VIGENCIA_SOBREPOSTA: "Já existe uma regra vigente neste período para este alcance.",
  REM_CARGO_EM_USO: "Não é possível excluir: há colaboradores neste cargo.",
  REM_BENEFICIO_EM_USO: "Não é possível excluir: há colaboradores com este benefício ativo.",
  REM_TABELA_NAO_PERMITIDA: "Este cadastro não pode ser excluído por aqui.",
};

/** Traduz os códigos do servidor para linguagem de negócio. */
export function mensagemErroRemuneracao(erro: unknown, fallback: string): string {
  const texto =
    typeof erro === "string"
      ? erro
      : erro instanceof Error
        ? erro.message
        : ((erro as { message?: string } | null)?.message ?? "");
  for (const [codigo, mensagem] of Object.entries(MENSAGENS)) {
    if (texto.includes(codigo)) return mensagem;
  }
  return texto || fallback;
}

function lancar(error: unknown, fallback: string): never {
  throw new Error(mensagemErroRemuneracao(error, fallback));
}

/** Cadastra ou edita um cargo. Repetir o envio devolve o cargo já existente. */
export async function salvarCargo(input: {
  id?: string | null;
  companyId: string;
  dados: Json;
}): Promise<string> {
  const { data, error } = await (supabase.rpc as any)("dp_cargo_salvar", {
    p_dados: input.dados,
    p_company_id: input.companyId,
    p_id: input.id ?? null,
  });
  if (error) lancar(error, "Não foi possível salvar o cargo.");
  return data as string;
}

/**
 * Define o piso salarial do cargo (por unidade ou pelo sindicato patronal).
 * Sem id, o piso em aberto do mesmo escopo é sucedido; reduzir o valor exige
 * justificativa e fica registrado no histórico.
 */
export async function definirPisoCargo(input: {
  id?: string | null;
  dados: Json;
  justificativa?: string | null;
}): Promise<string> {
  const { data, error } = await (supabase.rpc as any)("dp_cargo_piso_definir", {
    p_dados: input.dados,
    p_id: input.id ?? null,
    p_justificativa: input.justificativa ?? null,
  });
  if (error) lancar(error, "Não foi possível salvar o piso salarial.");
  return data as string;
}

/** Cadastra ou edita um benefício do catálogo da empresa. */
export async function salvarBeneficio(input: {
  id?: string | null;
  companyId: string;
  dados: Json;
}): Promise<string> {
  const { data, error } = await (supabase.rpc as any)("dp_beneficio_salvar", {
    p_dados: input.dados,
    p_company_id: input.companyId,
    p_id: input.id ?? null,
  });
  if (error) lancar(error, "Não foi possível salvar o benefício.");
  return data as string;
}

/** Grava o padrão de benefícios do escopo (empresa, unidade ou cargo na unidade). */
export async function salvarBeneficioPadrao(input: {
  companyId: string;
  payload: Json;
  unidadeId?: string | null;
  cargoId?: string | null;
  limparEscoposMaisEspecificos?: boolean;
}): Promise<string> {
  const { data, error } = await (supabase.rpc as any)("dp_beneficio_padrao_salvar", {
    p_company_id: input.companyId,
    p_payload: input.payload,
    p_unidade_id: input.unidadeId ?? null,
    p_cargo_id: input.cargoId ?? null,
    p_limpar_especificos: input.limparEscoposMaisEspecificos ?? false,
  });
  if (error) lancar(error, "Não foi possível salvar o padrão de benefícios.");
  return data as string;
}

/** Cadastra ou edita a regra de adicional por tempo de serviço. */
export async function salvarAdicionalTempoServico(input: {
  id?: string | null;
  companyId: string;
  dados: Json;
}): Promise<string> {
  const { data, error } = await (supabase.rpc as any)("dp_adicional_tempo_servico_salvar", {
    p_dados: input.dados,
    p_company_id: input.companyId,
    p_id: input.id ?? null,
  });
  if (error) lancar(error, "Não foi possível salvar o adicional por tempo de serviço.");
  return data as string;
}

/** Atribui (ou atualiza) um benefício na ficha do colaborador. */
export async function definirBeneficioColaborador(input: {
  id?: string | null;
  dados: Json;
}): Promise<string> {
  const { data, error } = await (supabase.rpc as any)("dp_colaborador_beneficio_definir", {
    p_dados: input.dados,
    p_id: input.id ?? null,
  });
  if (error) lancar(error, "Não foi possível salvar o benefício do colaborador.");
  return data as string;
}

/** Aplica vários benefícios de colaboradores numa única chamada. */
export async function definirBeneficiosColaboradorLote(itens: Json[]): Promise<number> {
  if (!itens.length) return 0;
  const { data, error } = await (supabase.rpc as any)("dp_colaborador_beneficios_definir_lote", {
    p_itens: itens,
  });
  if (error) lancar(error, "Não foi possível aplicar os benefícios.");
  return Number(data ?? 0);
}

export type TabelaRemuneracao =
  | "dp_cargos"
  | "dp_cargo_salarios"
  | "dp_beneficios"
  | "dp_beneficios_padroes"
  | "dp_adicionais_tempo_servico"
  | "dp_colaborador_beneficios";

/** Exclusão lógica: o registro sai da lista guardando autor, data e motivo. */
export async function excluirCadastroRemuneracao(
  tabela: TabelaRemuneracao,
  id: string,
  motivo?: string | null,
): Promise<void> {
  const { error } = await (supabase.rpc as any)("dp_cadastro_remuneracao_excluir", {
    p_tabela: tabela,
    p_id: id,
    p_motivo: motivo ?? null,
  });
  if (error) lancar(error, "Não foi possível excluir o cadastro.");
}
