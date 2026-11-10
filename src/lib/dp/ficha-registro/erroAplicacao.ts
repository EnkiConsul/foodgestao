import { RegraNegada } from "@/lib/dp/regraAviso";

const MENSAGENS_SEGURAS = [
  "Informe a ficha a aplicar.",
  "Dados da ficha inválidos.",
  "Ficha não encontrada ou sem permissão.",
  "Importação não encontrada ou sem permissão.",
  "Você não tem permissão para cadastrar colaboradores nesta empresa.",
  "A ficha não pertence à empresa da importação.",
  "Cargo de outra empresa.",
  "Unidade de outra empresa.",
  "Setor de outra empresa.",
  "Turno de outra empresa.",
  "Informe o nome do colaborador.",
  "Informe um CPF com 11 dígitos.",
  "Já existe um colaborador com este CPF nesta empresa.",
  "Informe entrada e saída do dia na jornada da ficha.",
  "Horário inválido na jornada da ficha.",
] as const;

/** Travas de franquia do banco (gatilho de limite) em linguagem do gestor. */
const FRANQUIA: Array<[RegExp, string]> = [
  [/EXCEDENTE_SEM_PERMISSAO/,
    "A franquia de colaboradores do plano está completa. Só o dono ou um administrador da empresa pode incluir colaboradores acima da franquia — o que você preencheu continua aqui."],
  [/EXCEDENTE_CONFIRMACAO_NECESSARIA/,
    "Este cadastro passa da franquia de colaboradores do plano. Toque em salvar de novo e confirme o valor do excedente — o que você preencheu continua aqui."],
  [/Limite do plano atingido/i,
    "A franquia de colaboradores do plano está completa. Amplie o plano para incluir mais colaboradores — o que você preencheu continua aqui."],
];

export function erroAplicacaoFicha(mensagem: string): Error {
  const texto = mensagem.trim();
  const franquia = FRANQUIA.find(([re]) => re.test(texto));
  if (franquia) return new RegraNegada(franquia[1]);
  const segura = MENSAGENS_SEGURAS.find((item) => texto.includes(item));
  if (segura) return new RegraNegada(segura);

  if (/permission denied|row-level security|forbidden/i.test(texto)) {
    return new RegraNegada(
      "Seu acesso não permite concluir esta ficha. Peça a liberação de inclusão em Colaboradores.",
    );
  }

  return new Error(texto || "A ficha não pôde ser aplicada.");
}