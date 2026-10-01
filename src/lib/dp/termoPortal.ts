/**
 * Termo de Primeiro Acesso ao Portal do Colaborador.
 *
 * Texto único da plataforma, aceito uma vez, no momento em que o colaborador
 * cria a própria senha. É o que dá lastro jurídico às assinaturas eletrônicas
 * do portal (MP 2.200-2/2001, art. 10, §2º e Lei 14.063/2020) e cumpre o dever
 * de informação da LGPD (Lei 13.709/2018, arts. 6º, 9º e 18), além de registrar
 * as regras de segurança da informação que o colaborador assume.
 *
 * Espelhado em supabase/functions/_shared/termo-portal.ts — o servidor nunca
 * confia no texto enviado pelo navegador, ele usa a própria cópia. O teste
 * src/test/unit/termoPortal.test.ts garante que as duas cópias são iguais.
 *
 * Qualquer alteração de redação exige nova versão (nunca reescrever uma versão
 * já aceita): os aceites registrados apontam para a versão efetivamente lida.
 */

export const TERMO_PORTAL_VERSAO = "v1";

export const TERMO_PORTAL_TITULO = "Termo de Primeiro Acesso ao Portal do Colaborador";

/** Cada item é um parágrafo, na ordem em que aparece na tela e no comprovante. */
export const TERMO_PORTAL_PARAGRAFOS: readonly string[] = [
  "Ao ativar meu acesso, declaro que li e concordo com as condições abaixo para uso do portal do colaborador da plataforma AVETO 360.",
  "1. Documentos eletrônicos. Concordo em receber, consultar e assinar eletronicamente, pelo portal, os documentos da minha relação de trabalho — entre eles contrato e alterações, ficha de admissão, comprovantes de pagamento, recibos de férias, avisos, comunicados e registros internos. Reconheço esses documentos eletrônicos como válidos e equivalentes aos de papel, nos termos da Medida Provisória 2.200-2/2001 e da Lei 14.063/2020.",
  "2. Assinatura eletrônica. Reconheço que a aprovação feita com meu acesso pessoal tem valor de assinatura minha. A cada aprovação, o sistema registra data, hora, endereço de internet, dispositivo utilizado e a impressão digital do arquivo aprovado, permitindo comprovar depois que o conteúdo não foi alterado.",
  "3. Quais dados são tratados. Fico ciente de que a empresa trata, no portal, meus dados de identificação (nome, CPF, RG, data de nascimento, foto), contato (endereço, telefone, e-mail), dados contratuais (cargo, jornada, salário, escala, férias, faltas e atestados), dados bancários para pagamento, dados dos meus dependentes e familiares que eu informar e os arquivos de documentos que eu enviar.",
  "4. Para que servem e com que base legal. Esses dados são usados para executar o contrato de trabalho e cumprir obrigações legais e regulatórias trabalhistas, previdenciárias, fiscais e de segurança do trabalho, e para o exercício regular de direitos em processos. É o que a Lei 13.709/2018 (LGPD) prevê nos incisos II, V e VI do art. 7º e nos incisos II e V do art. 11 — portanto esse tratamento não depende do meu consentimento, e este termo tem função de informação, não de autorização.",
  "5. Dados sensíveis e de saúde. Fico ciente de que atestados, laudos, informações de saúde ocupacional e dados de dependentes são tratados apenas para cumprir obrigações legais e são vistos somente por quem precisa deles no setor de pessoal e na gestão da minha unidade.",
  "6. Com quem os dados podem ser compartilhados. Entendo que meus dados podem ser compartilhados com a contabilidade da empresa, órgãos públicos e sistemas oficiais obrigatórios, instituições financeiras para pagamento, operadoras de benefícios que eu utilizar e com o provedor de tecnologia que hospeda a plataforma — sempre no limite da finalidade informada. Meus dados não são vendidos nem usados para publicidade.",
  "7. Por quanto tempo são guardados. Fico ciente de que os dados e documentos são guardados durante o vínculo e, depois do seu fim, pelos prazos exigidos pela legislação trabalhista, previdenciária e fiscal, para defesa de direitos — e, encerrados esses prazos, são eliminados ou anonimizados.",
  "8. Meus direitos. Posso solicitar ao setor de pessoal, a qualquer momento e sem custo, confirmação do tratamento, acesso aos meus dados, correção de dados incompletos ou desatualizados, informação sobre compartilhamentos, cópia dos documentos que eu tiver assinado e, quando cabível, anonimização, bloqueio ou eliminação de dados tratados sem necessidade legal. Pedidos de exclusão podem ser recusados quando a lei obrigar a guarda do registro.",
  "9. Minhas responsabilidades de segurança da informação. A senha que eu criar é pessoal e sigilosa: comprometo-me a não compartilhá-la, a não anotá-la em local visível, a não deixar a sessão aberta em aparelho de outra pessoa e a sair do portal em dispositivos compartilhados. Comprometo-me a comunicar imediatamente ao setor de pessoal qualquer suspeita de que outra pessoa teve acesso à minha senha ou ao meu acesso.",
  "10. Uso correto do portal. Comprometo-me a usar o portal apenas para fins da minha relação de trabalho, a não tentar acessar dados de outros colaboradores e a não copiar, divulgar, fotografar ou repassar a terceiros informações da empresa, de clientes ou de colegas a que eu tenha acesso. Reconheço que o uso indevido pode gerar responsabilidade e medidas disciplinares.",
  "11. Dados cadastrais. Comprometo-me a manter meus dados atualizados e informar mudanças de endereço, telefone, estado civil e dependentes. Respondo pela veracidade das informações e dos arquivos que eu enviar pelo portal.",
  "12. Registros de acesso. Fico ciente de que, por exigência do Marco Civil da Internet (Lei 12.965/2014) e por segurança, a plataforma registra meus acessos e as ações que eu realizar — com data, hora, endereço de internet e dispositivo — e que esses registros podem ser usados para apurar incidentes de segurança e comprovar assinaturas.",
  "13. Comunicações. Fico ciente de que avisos e comunicados enviados pelo portal ou para o e-mail cadastrado são considerados entregues, e que devo acompanhar o portal com regularidade.",
  "14. Validade. Este termo vale durante todo o meu vínculo com a empresa. Guardo o direito de pedir, a qualquer momento, uma via deste termo e dos documentos que eu tiver aprovado.",
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
