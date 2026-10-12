// Termo de Autorização para Pagamento em Conta/Pix de Terceiro.
// Mesmo padrão dos demais termos: prévia editável, escolha da assinatura
// (portal com validação digital ou via impressa) e via assinada na ficha.
import { supabase } from "@/integrations/supabase/client";
import { registrarDocumento } from "@/lib/dp/documentos-oficial";
import { CLAUSULA_ASSINATURA_FISICA } from "@/lib/dp/termos-compensacao";
import { cpfFmt } from "@/lib/dp/termos-freelancer";
import { CONTA_TIPOS, PIX_TIPOS, type DadosPagamento } from "@/lib/dp/dadosPagamento";

export const TERMO_TERCEIRO_TITULO = "Termo de Autorização para Pagamento em Conta ou Pix de Terceiro";
export const TERMO_TERCEIRO_VERSAO = "v1";

const ASSINATURA_DIGITAL = "Assinatura eletrônica. As partes reconhecem a validade da assinatura eletrônica deste termo (MP 2.200-2/2001, art. 10, § 2º, e Lei 14.063/2020). O sistema registra data, hora, endereço de internet, dispositivo e a impressão digital (SHA-256) do arquivo, e o desenho da assinatura é estampado na via assinada.";

export function destinoTexto(p: DadosPagamento): string {
  const partes: string[] = [];
  if (p.pix_tipo && p.pix_chave) {
    const t = PIX_TIPOS.find((x) => x.value === p.pix_tipo)?.label.replace(/\s*\(recomendado\)/, "") ?? p.pix_tipo;
    partes.push(`chave Pix (${t}) ${p.pix_chave}`);
  }
  if (p.banco_nome && p.agencia && p.conta) {
    const tipo = CONTA_TIPOS.find((x) => x.value === p.conta_tipo)?.label.toLowerCase();
    partes.push(`${tipo ?? "conta"} no banco ${p.banco_nome}, agência ${p.agencia}, conta ${p.conta}${p.conta_digito ? `-${p.conta_digito}` : ""}`);
  }
  return partes.join(" e ");
}

export function clausulasTermoTerceiro(d: {
  empresa: string; nome: string; titularNome: string; titularCpf: string; relacao: string; destino: string;
}, manual: boolean): string[] {
  return [
    `1. Partes. EMPREGADOR: ${d.empresa}. EMPREGADO(A): ${d.nome}. TITULAR DA CONTA/PIX: ${d.titularNome}, CPF ${cpfFmt(d.titularCpf) ?? d.titularCpf}, ${d.relacao} do(a) empregado(a).`,
    `2. Autorização expressa. O(A) empregado(a), de forma livre, voluntária e por escrito, autoriza o empregador a creditar salários, adiantamentos, férias, 13º salário, verbas rescisórias e demais valores a que tiver direito na conta de titularidade de terceiro indicada neste termo (art. 464, parágrafo único, da CLT).`,
    `3. Destino dos pagamentos: ${d.destino}, de titularidade de ${d.titularNome}.`,
    "4. Quitação. O comprovante de transferência ou de Pix para o destino indicado tem força de recibo e plena eficácia liberatória do pagamento (art. 464 da CLT e art. 165 da Portaria MTP nº 671/2021).",
    "5. Responsabilidade. O(A) empregado(a) reconhece que o repasse dos valores entre ele(a) e o titular é de sua exclusiva responsabilidade, isentando o empregador de qualquer retenção, bloqueio judicial, desvio ou divergência ocorrida na conta do terceiro.",
    "6. Revogação. Esta autorização pode ser revogada a qualquer tempo pelo(a) empregado(a), por escrito, produzindo efeitos a partir da folha seguinte ao pedido. Qualquer alteração dos dados de destino exige novo termo.",
    "7. Dados pessoais. Os dados do terceiro são tratados apenas para viabilizar os pagamentos e cumprir obrigações legais (Lei 13.709/2018, art. 7º, II e V). O(A) empregado(a) declara ter ciência e autorização do titular para informá-los.",
    `8. ${manual ? CLAUSULA_ASSINATURA_FISICA : ASSINATURA_DIGITAL}`,
  ];
}

/** Grava o termo na pasta do colaborador. Substitui (arquiva) o termo anterior. */
export async function emitirTermoTerceiro(input: {
  companyId: string; colaboradorId: string; bytes: Uint8Array; manual: boolean;
}): Promise<void> {
  const { data: anteriores } = await supabase
    .from("dp_documentos").select("id")
    .eq("colaborador_id", input.colaboradorId).eq("tipo", "termos")
    .ilike("titulo", `${TERMO_TERCEIRO_TITULO}%`).is("arquivado_em" as never, null);
  for (const a of anteriores ?? []) {
    const { error } = await supabase.rpc("dp_documento_arquivar", { _documento_id: a.id, _motivo: "Substituído por nova via" });
    if (error) throw new Error("Não foi possível arquivar o termo anterior. Arquive-o pela aba Documentos e tente de novo.");
  }
  const nomeArquivo = "termo-autorizacao-conta-terceiro.pdf";
  const path = `${input.companyId}/${input.colaboradorId}/${Date.now()}-${nomeArquivo}`;
  const blob = new Blob([input.bytes as BlobPart], { type: "application/pdf" });
  const up = await supabase.storage.from("dp-documentos").upload(path, blob, { contentType: "application/pdf", upsert: false });
  if (up.error) throw new Error("Não foi possível guardar o arquivo do termo. Tente novamente em instantes.");
  await registrarDocumento({
    company_id: input.companyId,
    colaborador_id: input.colaboradorId,
    tipo: "termos",
    titulo: TERMO_TERCEIRO_TITULO,
    descricao: input.manual
      ? `Versão ${TERMO_TERCEIRO_VERSAO}. Via impressa para assinatura à mão; anexe a via assinada na ficha.`
      : `Versão ${TERMO_TERCEIRO_VERSAO}. Assinatura digital do colaborador pelo portal, com leitura prévia obrigatória.`,
    file_path: path,
    file_name: nomeArquivo,
    file_size: blob.size,
    mime_type: "application/pdf",
    referencia_data: new Date().toISOString().slice(0, 10),
    exige_aceite: !input.manual,
  } as never);
}
