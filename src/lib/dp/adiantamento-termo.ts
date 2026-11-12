// Termo de Opção pelo Adiantamento Salarial (CLT, art. 462).
//
// O pedido de ativação feito pelo colaborador no portal só vale com este
// termo assinado por ele (o servidor confere a assinatura antes de gravar).
// O gestor pode enviar o termo ao portal, gerar a via impressa ou declarar
// que já tem o termo assinado em papel. Suspensão não exige termo.
import { supabase } from "@/integrations/supabase/client";
import { registrarDocumento } from "@/lib/dp/documentos-oficial";
import { gerarTermoCompensacaoPdf } from "@/lib/dp/termo-compensacao-pdf";
import { CLAUSULA_ASSINATURA_FISICA } from "@/lib/dp/termos-compensacao";
import { cpfFmt } from "@/lib/dp/termos-freelancer";
import { rotuloCompetencia } from "@/lib/dp/adiantamento-opcao";

/** Mesmo título gravado pelo servidor (`dp_adiantamento_termo_preparar`). */
export const TERMO_ADIANTAMENTO_TITULO = "Termo de Opção pelo Adiantamento Salarial";
export const TERMO_ADIANTAMENTO_VERSAO = "v1";

const ASSINATURA_DIGITAL =
  "Assinatura eletrônica. As partes reconhecem a validade da assinatura eletrônica deste termo (MP 2.200-2/2001, art. 10, § 2º, e Lei 14.063/2020). O sistema registra data, hora, endereço de internet, dispositivo e a impressão digital (SHA-256) do arquivo, e o desenho da assinatura é estampado na via assinada.";

export type PartesTermoAdiantamento = {
  empresa: string;
  cnpj?: string | null;
  unidade?: string | null;
  nome: string;
  cpf?: string | null;
  cargo?: string | null;
};

export type RegraTermoAdiantamento = {
  dia: number;
  antecedencia: number;
  competencia: string;
};

export function clausulasTermoAdiantamento(
  p: PartesTermoAdiantamento,
  r: RegraTermoAdiantamento,
  manual: boolean,
): string[] {
  const cpf = cpfFmt(p.cpf);
  return [
    `1. Partes. EMPREGADOR: ${p.empresa}${p.cnpj ? `, CNPJ ${p.cnpj}` : ""}. EMPREGADO(A): ${p.nome}${cpf ? `, CPF ${cpf}` : ""}${p.cargo ? `, ${p.cargo}` : ""}.`,
    `2. Opção. O(A) empregado(a), de forma livre e voluntária, opta por receber adiantamento salarial no dia ${r.dia} de cada mês, a partir da competência de ${rotuloCompetencia(r.competencia)}.`,
    "3. Desconto autorizado. O valor adiantado será descontado do salário do mesmo mês, no pagamento mensal, por se tratar de adiantamento (CLT, art. 462). O valor do adiantamento segue a regra da empresa e da convenção coletiva aplicável.",
    "4. Continuidade. A opção vale para os meses seguintes, sem necessidade de novo pedido, até que o(a) empregado(a) peça a suspensão pelo portal ou por escrito.",
    `5. Prazo dos pedidos. Pedidos e suspensões feitos pelo portal valem para o mês quando realizados até ${r.antecedencia} ${r.antecedencia === 1 ? "dia" : "dias"} antes do dia do pagamento; depois desse prazo, passam a valer no mês seguinte.`,
    "6. Desligamento. Adiantamento ainda não compensado no fim do contrato será descontado nas verbas rescisórias, respeitado o limite de um mês de remuneração (CLT, art. 477, § 5º).",
    `7. ${manual ? CLAUSULA_ASSINATURA_FISICA : ASSINATURA_DIGITAL}`,
  ];
}

export function gerarTermoAdiantamentoPdf(
  p: PartesTermoAdiantamento,
  r: RegraTermoAdiantamento,
  manual: boolean,
): Promise<Uint8Array> {
  return gerarTermoCompensacaoPdf({
    titulo: TERMO_ADIANTAMENTO_TITULO,
    versao: TERMO_ADIANTAMENTO_VERSAO,
    empresa: p.empresa,
    cnpj: p.cnpj,
    unidade: p.unidade,
    nome: p.nome,
    cpf: cpfFmt(p.cpf),
    cargo: p.cargo,
    jornada: [],
    clausulas: clausulasTermoAdiantamento(p, r, manual),
    manual,
    fundamento: "CLT, art. 462",
  });
}

const NOME_ARQUIVO = "termo-opcao-adiantamento.pdf";

/** Guarda o PDF na pasta do colaborador e devolve o caminho. */
export async function guardarArquivoTermo(companyId: string, colaboradorId: string, bytes: Uint8Array) {
  const path = `${companyId}/${colaboradorId}/${Date.now()}-${NOME_ARQUIVO}`;
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const up = await supabase.storage.from("dp-documentos").upload(path, blob, { contentType: "application/pdf", upsert: false });
  if (up.error) throw new Error("Não foi possível guardar o termo. Tente novamente em instantes.");
  return { path, size: blob.size };
}

/** Gestor: emite o termo na pasta do colaborador (portal ou via impressa). */
export async function emitirTermoAdiantamentoGestor(input: {
  companyId: string;
  colaboradorId: string;
  bytes: Uint8Array;
  manual: boolean;
}): Promise<string> {
  const { path, size } = await guardarArquivoTermo(input.companyId, input.colaboradorId, input.bytes);
  return registrarDocumento({
    company_id: input.companyId,
    colaborador_id: input.colaboradorId,
    tipo: "termos",
    titulo: TERMO_ADIANTAMENTO_TITULO,
    descricao: input.manual
      ? `Versão ${TERMO_ADIANTAMENTO_VERSAO}. Via impressa para assinatura à mão; anexe a via assinada na ficha.`
      : `Versão ${TERMO_ADIANTAMENTO_VERSAO}. Assinatura eletrônica do colaborador pelo portal.`,
    file_path: path,
    file_name: NOME_ARQUIVO,
    file_size: size,
    mime_type: "application/pdf",
    referencia_data: new Date().toISOString().slice(0, 10),
    exige_aceite: !input.manual,
    assinatura_fisica: input.manual,
  });
}

/** Portal: registra o termo do próprio colaborador antes da leitura e assinatura. */
export async function prepararTermoPortal(path: string, size: number): Promise<string> {
  const { data, error } = await supabase.rpc("dp_adiantamento_termo_preparar", { p_file_path: path, p_file_size: size });
  if (error) throw new Error(mensagemAdiantamento(error));
  if (!data) throw new Error("Não foi possível preparar o termo.");
  return data as string;
}

/** Portal: tira da pasta o termo que não chegou a ser assinado. */
export async function descartarTermoPortal(documentoId: string): Promise<void> {
  await supabase.rpc("dp_adiantamento_termo_descartar", { p_documento: documentoId });
}

/** Portal: conclui o pedido (ativação com termo assinado ou suspensão). */
export async function solicitarAdiantamentoPortal(tipo: "ativar" | "cancelar", documentoId?: string | null) {
  const { data, error } = await supabase.rpc("dp_adiantamento_solicitar_portal", {
    p_tipo: tipo,
    p_documento: documentoId ?? undefined,
  });
  if (error) throw new Error(mensagemAdiantamento(error));
  return data as { ok: boolean; solicitacao_id: string; competencia_efeito: string };
}

const MENSAGENS: Record<string, string> = {
  ADIANTAMENTO_JA_ATIVO: "Seu adiantamento já está ativo.",
  ADIANTAMENTO_JA_INATIVO: "Seu adiantamento já está suspenso.",
  ADIANTAMENTO_TERMO_PENDENTE: "Assine o termo de opção para concluir o pedido.",
  ADIANTAMENTO_TERMO_INVALIDO: "O termo indicado não é deste colaborador.",
  ADIANTAMENTO_INDISPONIVEL: "Sua unidade ou seu vínculo não tem adiantamento salarial.",
  DOC_ARQUIVO_FORA_DA_EMPRESA: "O arquivo do termo não pertence à sua pasta.",
  FORBIDDEN: "Você não tem permissão para esta ação.",
};

/** Converte a recusa do servidor (token no início da mensagem) em frase de negócio. */
export function mensagemAdiantamento(error: { message?: string } | null | undefined): string {
  const msg = error?.message ?? "";
  const token = Object.keys(MENSAGENS).find((k) => msg.startsWith(k) || msg.includes(`${k}:`));
  return token ? MENSAGENS[token] : "Não foi possível registrar o pedido. Tente novamente em instantes.";
}
