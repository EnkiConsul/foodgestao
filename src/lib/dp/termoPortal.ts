/**
 * Termo de Primeiro Acesso ao Portal do Colaborador.
 *
 * Texto único da plataforma, aceito uma vez, no momento em que o colaborador
 * cria a própria senha. É o que dá lastro jurídico às assinaturas eletrônicas
 * do portal (MP 2.200-2/2001, art. 10, §2º e Lei 14.063/2020): o colaborador
 * concorda, de forma expressa, em receber e assinar documentos por meio
 * eletrônico.
 *
 * Espelhado em supabase/functions/_shared/termo-portal.ts — o servidor nunca
 * confia no texto enviado pelo navegador, ele usa a própria cópia. O teste
 * src/test/unit/termoPortal.test.ts garante que as duas cópias são iguais.
 *
 * Qualquer alteração de redação exige nova versão (nunca reescrever a v1): os
 * aceites já registrados apontam para a versão que foi efetivamente lida.
 */

export const TERMO_PORTAL_VERSAO = "v1";

export const TERMO_PORTAL_TITULO = "Termo de Primeiro Acesso ao Portal do Colaborador";

/** Cada item é um parágrafo, na ordem em que aparece na tela e no comprovante. */
export const TERMO_PORTAL_PARAGRAFOS: readonly string[] = [
  "Ao ativar meu acesso, declaro que li e concordo com as condições abaixo para uso do portal do colaborador da plataforma AVETO 360.",
  "1. Documentos eletrônicos. Concordo em receber, consultar e assinar eletronicamente, pelo portal, os documentos da minha relação de trabalho — entre eles contrato e alterações, ficha de admissão, comprovantes de pagamento, recibos de férias, avisos, comunicados e registros internos. Reconheço esses documentos eletrônicos como válidos e equivalentes aos de papel, nos termos da Medida Provisória 2.200-2/2001 e da Lei 14.063/2020.",
  "2. Assinatura eletrônica. Reconheço que a aprovação feita com meu acesso pessoal tem valor de assinatura minha. A cada aprovação, o sistema registra data, hora, endereço de internet, dispositivo utilizado e a impressão digital do arquivo aprovado, permitindo comprovar depois que o conteúdo não foi alterado.",
  "3. Senha pessoal. A senha que eu criar é pessoal e sigilosa. Comprometo-me a não compartilhá-la e a comunicar imediatamente ao setor de pessoal se desconfiar que outra pessoa teve acesso a ela.",
  "4. Dados cadastrais. Comprometo-me a manter meus dados atualizados e informar mudanças de endereço, telefone, estado civil e dependentes. Respondo pela veracidade das informações e dos arquivos que eu enviar pelo portal.",
  "5. Uso dos meus dados. Fico ciente de que a empresa trata meus dados pessoais para cumprir obrigações da relação de trabalho e da legislação trabalhista, previdenciária e fiscal, conforme a Lei 13.709/2018 (LGPD), e que posso solicitar ao setor de pessoal acesso ou correção dos meus dados.",
  "6. Comunicações. Fico ciente de que avisos e comunicados enviados pelo portal ou para o e-mail cadastrado são considerados entregues, e que devo acompanhar o portal com regularidade.",
  "7. Validade. Este termo vale durante todo o meu vínculo com a empresa. Guardo o direito de pedir, a qualquer momento, uma via deste termo e dos documentos que eu tiver aprovado.",
];

/**
 * Texto canônico usado para gerar a impressão digital do termo aceito.
 * Formato estável: título, linha em branco e parágrafos separados por uma linha.
 */
export function termoPortalConteudo(): string {
  return [
    `${TERMO_PORTAL_TITULO} (${TERMO_PORTAL_VERSAO})`,
    "",
    ...TERMO_PORTAL_PARAGRAFOS,
  ].join("\n");
}
