// ------------------------------------------------------------------
// Termos do vínculo Freelancer.
//
// 1) Freelancer horista/diarista → Termo de Prestação de Serviços Eventuais,
//    emitido como documento do colaborador e assinado digitalmente por ele no
//    portal (leitura prévia obrigatória, fluxo oficial de aceite).
// 2) Freelancer mensalista → Termo de Ciência e Assunção de Risco, assinado
//    pelo gestor no cadastro. Registra a decisão da empresa; não protege
//    contra o reconhecimento de vínculo (primazia da realidade).
//
// Regra jurídica fixa: nenhum termo menciona seguro-desemprego, aposentadoria
// ou benefício social — isso seria confissão de fraude (art. 171, §3º, CP).
// Qualquer mudança de redação exige nova versão.
// ------------------------------------------------------------------
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { supabase } from "@/integrations/supabase/client";
import { registrarDocumento } from "@/lib/dp/documentos-oficial";

export const TERMO_EVENTUAL_VERSAO = "v1";
export const TERMO_EVENTUAL_TITULO = "Termo de Prestação de Serviços Eventuais";

export const TERMO_RISCO_MENSALISTA_VERSAO = "v1";
export const TERMO_RISCO_MENSALISTA_TITULO = "Termo de Ciência e Assunção de Risco — Freelancer Mensalista";

export function termoEventualParagrafos(d: {
  empresa: string; cnpj?: string | null; nome: string; cpf?: string | null; forma: "horista" | "diarista";
}): string[] {
  const unidade = d.forma === "horista" ? "hora trabalhada" : "diária realizada";
  return [
    `CONTRATANTE: ${d.empresa}${d.cnpj ? `, CNPJ ${d.cnpj}` : ""}.`,
    `PRESTADOR(A): ${d.nome}${d.cpf ? `, CPF ${d.cpf}` : ""}.`,
    "1. Objeto e eventualidade. O(A) prestador(a) atenderá chamados pontuais da contratante para reforço transitório da operação, eventos ou picos de demanda, sem continuidade, sem jornada fixa e sem escala pré-definida.",
    "2. Liberdade de recusa. Não há obrigação de aceitar nenhum chamado. O(A) prestador(a) pode aceitar ou recusar qualquer convite, a qualquer tempo, sem penalidade, sanção, desconto ou necessidade de justificativa.",
    "3. Não exclusividade. O(A) prestador(a) é livre para prestar serviços a outros estabelecimentos e clientes, inclusive concorrentes, nos dias e horários que escolher.",
    "4. Autonomia na execução. O(A) prestador(a) executa o serviço com autonomia técnica, observando apenas as normas de higiene, segurança e atendimento necessárias à atividade.",
    `5. Remuneração e quitação. Cada chamado é remunerado por ${unidade}, no valor combinado antes do serviço, e quitado individualmente mediante recibo avulso, que discrimina data, serviço e valor pago.`,
    "6. Inexistência de salário fixo. Não há pagamento mensal fixo nem garantia de quantidade mínima de chamados.",
    "7. Realidade dos fatos. As partes reconhecem que a natureza desta relação é definida pela forma como ela de fato acontece. Caso passem a existir habitualidade, horário imposto e subordinação, a relação deverá ser formalizada pelo regime adequado (contrato intermitente ou CLT), nos termos dos arts. 3º, 9º e 452-A da CLT.",
    "8. Dados pessoais. Os dados do(a) prestador(a) são tratados apenas para executar este termo, efetuar pagamentos e cumprir obrigações legais (Lei 13.709/2018, art. 7º, II, V e VI).",
    "9. Assinatura eletrônica. As partes reconhecem a validade da assinatura eletrônica deste termo (MP 2.200-2/2001, art. 10, §2º, e Lei 14.063/2020). O sistema registra data, hora, endereço de internet, dispositivo e a impressão digital do arquivo assinado.",
  ];
}

export function termoRiscoMensalistaParagrafos(d: { empresa: string; nome: string }): string[] {
  return [
    `Empresa: ${d.empresa}. Pessoa cadastrada: ${d.nome}.`,
    "1. Fui informado(a) de que \"freelancer\" não é vínculo previsto na lei trabalhista e de que pagamento mensal fixo e habitual é característica de relação de emprego (art. 3º da CLT).",
    "2. Fui informado(a) de que, pelo princípio da primazia da realidade (arts. 9º e 444 da CLT), nenhum documento assinado afasta o reconhecimento de vínculo quando há pessoalidade, habitualidade, subordinação e pagamento mensal.",
    "3. Fui informado(a) de que, reconhecido o vínculo, a empresa pode ser condenada a registro retroativo em carteira, férias + 1/3, 13º salário, FGTS + 40%, contribuições previdenciárias, multas administrativas e verbas rescisórias.",
    "4. Fui orientado(a) de que os caminhos legais são o contrato intermitente (art. 452-A da CLT), para chamados com frequência, ou o registro CLT, e de que o freelancer só se sustenta quando pago por diária/hora, sem habitualidade.",
    "5. Mesmo assim, em nome da empresa, decido manter este cadastro como freelancer mensalista e assumo integralmente o risco trabalhista, previdenciário e fiscal decorrente dessa decisão, isentando a plataforma AVETO 360 de qualquer responsabilidade.",
    "6. Este termo, a justificativa, meu usuário, a data, a hora e a minha assinatura eletrônica ficam registrados no histórico de regras da empresa.",
  ];
}

async function sha256(texto: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashTermo(titulo: string, versao: string, paragrafos: string[]): Promise<string> {
  return sha256([`${titulo} (${versao})`, "", ...paragrafos].join("\n"));
}

/** pdf-lib usa WinAnsi: troca caracteres fora da tabela. */
function limpar(t: string) {
  return t.replace(/[—–]/g, "-").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[^\x20-\xFF]/g, "");
}

export async function gerarPdf(titulo: string, versao: string, paragrafos: string[], rodape?: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const fonte = await pdf.embedFont(StandardFonts.Helvetica);
  const negrito = await pdf.embedFont(StandardFonts.HelveticaBold);
  const margem = 56, largura = 595 - margem * 2, tam = 10.5, entre = 15;
  let page = pdf.addPage([595, 842]);
  let y = 842 - margem;
  const linha = (txt: string, f = fonte, s = tam) => {
    if (y < margem + 20) { page = pdf.addPage([595, 842]); y = 842 - margem; }
    page.drawText(txt, { x: margem, y, size: s, font: f, color: rgb(0.06, 0.1, 0.24) });
    y -= s === tam ? entre : s + 8;
  };
  const quebrar = (txt: string, f = fonte, s = tam) => {
    const palavras = limpar(txt).split(/\s+/);
    let atual = "";
    for (const p of palavras) {
      const teste = atual ? `${atual} ${p}` : p;
      if (f.widthOfTextAtSize(teste, s) > largura) { linha(atual, f, s); atual = p; } else atual = teste;
    }
    if (atual) linha(atual, f, s);
  };
  quebrar(titulo.toUpperCase(), negrito, 14);
  y -= 6;
  for (const p of paragrafos) { quebrar(p); y -= 6; }
  y -= 10;
  quebrar(`Versão ${versao} - emitido em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}. ${rodape ?? "A assinatura eletrônica do(a) prestador(a) é registrada no portal e estampada na via assinada."}`, fonte, 9);
  return pdf.save();
}

export function cpfFmt(cpf?: string | null) {
  const d = (cpf ?? "").replace(/\D/g, "");
  return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : d || null;
}

/**
 * Emite o Termo de Prestação de Serviços Eventuais para o colaborador assinar
 * no portal. Idempotente: não repete se já existe um termo dele.
 * Retorna "emitido", "ja_existia".
 */
export async function emitirTermoEventual(input: {
  companyId: string; colaboradorId: string; nome: string; cpf?: string | null; forma: "horista" | "diarista";
}): Promise<"emitido" | "ja_existia"> {
  const { data: existente } = await supabase
    .from("dp_documentos")
    .select("id")
    .eq("colaborador_id", input.colaboradorId)
    .eq("tipo", "termos")
    .ilike("titulo", `${TERMO_EVENTUAL_TITULO}%`)
    .limit(1);
  if (existente && existente.length) return "ja_existia";

  const { data: emp } = await supabase.from("companies").select("name, trade_name, cnpj").eq("id", input.companyId).maybeSingle();
  const empresa = (emp?.name || emp?.trade_name || "Empresa").toUpperCase();
  const paragrafos = termoEventualParagrafos({
    empresa, cnpj: emp?.cnpj ?? null, nome: input.nome.toUpperCase(), cpf: cpfFmt(input.cpf), forma: input.forma,
  });
  const bytes = await gerarPdf(TERMO_EVENTUAL_TITULO, TERMO_EVENTUAL_VERSAO, paragrafos);
  const nomeArquivo = `termo-servicos-eventuais-${input.nome.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}.pdf`;
  const path = `${input.companyId}/${input.colaboradorId}/${Date.now()}-${nomeArquivo}`;
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const up = await supabase.storage.from("dp-documentos").upload(path, blob, { contentType: "application/pdf", upsert: false });
  if (up.error) throw new Error("Não foi possível guardar o arquivo do termo. Tente salvar o cadastro de novo em instantes.");
  await registrarDocumento({
    company_id: input.companyId,
    colaborador_id: input.colaboradorId,
    tipo: "termos",
    titulo: TERMO_EVENTUAL_TITULO,
    descricao: `Versão ${TERMO_EVENTUAL_VERSAO}. Assinatura digital do prestador pelo portal, com leitura prévia obrigatória.`,
    file_path: path,
    file_name: nomeArquivo,
    file_size: blob.size,
    mime_type: "application/pdf",
    referencia_data: new Date().toISOString().slice(0, 10),
    exige_aceite: true,
  } as never);
  return "emitido";
}
