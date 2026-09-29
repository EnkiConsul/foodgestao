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

export function erroAplicacaoFicha(mensagem: string): Error {
  const texto = mensagem.trim();
  const segura = MENSAGENS_SEGURAS.find((item) => texto.includes(item));
  if (segura) return new RegraNegada(segura);

  if (/permission denied|row-level security|forbidden/i.test(texto)) {
    return new RegraNegada(
      "Seu acesso não permite concluir esta ficha. Peça a liberação de inclusão em Colaboradores.",
    );
  }

  return new Error(texto || "A ficha não pôde ser aplicada.");
}