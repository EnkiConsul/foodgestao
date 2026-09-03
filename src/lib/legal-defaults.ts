// Defaults para os documentos legais (LGPD, Termos de Uso, Cookies, DPO).
// Servem como fallback quando o super admin ainda não editou um campo
// e também como base para o botão "Restaurar padrão".

export type LegalDocContent = {
  title: string;
  last_updated: string; // YYYY-MM-DD
  body: string; // Markdown
};

export type LegalDpoContent = {
  title: string;
  last_updated: string;
  dpo_name: string;
  dpo_email: string;
  controller_name: string;
  controller_cnpj: string;
  controller_address: string;
  body: string;
};

const TODAY = new Date().toISOString().slice(0, 10);

export const LEGAL_DEFAULTS = {
  legal_privacy: {
    title: "Política de Privacidade",
    last_updated: TODAY,
    body: `# Política de Privacidade

Última atualização: **${TODAY}**

A **Aveto 360** ("nós", "nosso", "Controlador") está comprometida com a proteção dos seus dados pessoais, em conformidade com a **Lei Geral de Proteção de Dados — LGPD (Lei nº 13.709/2018)** e o **Marco Civil da Internet (Lei nº 12.965/2014)**.

## 1. Quem somos
Somos uma plataforma SaaS de gestão financeira para pessoas físicas, MEIs e pequenas empresas no Brasil.

## 2. Quais dados coletamos
- **Dados cadastrais**: nome, e-mail, telefone, CPF/CNPJ.
- **Dados de uso**: lançamentos financeiros, contas, categorias, anexos que você insere voluntariamente.
- **Dados técnicos**: endereço IP, navegador, sistema operacional, logs de acesso (obrigatório pelo art. 15 do Marco Civil — guarda por 6 meses).
- **Dados de pagamento**: processados pelo nosso operador **Asaas**; não armazenamos dados de cartão.

## 3. Finalidade e base legal (art. 7º LGPD)
- Execução do contrato (prestação do serviço) — art. 7º, V.
- Cumprimento de obrigação legal (Marco Civil, fiscal) — art. 7º, II.
- Legítimo interesse para segurança e prevenção a fraudes — art. 7º, IX.
- Consentimento, quando aplicável (cookies não essenciais, comunicações de marketing) — art. 7º, I.

## 4. Compartilhamento
Compartilhamos dados apenas com operadores estritamente necessários:
- **Supabase / AWS**: hospedagem e banco de dados (servidores na América do Sul/Brasil quando disponível).
- **Asaas**: processamento de pagamentos.
- **Autoridades públicas**: quando exigido por lei ou ordem judicial.

Nunca vendemos seus dados.

## 5. Armazenamento e retenção
- Dados ativos: enquanto sua conta estiver ativa.
- Após exclusão da conta: dados pessoais removidos em até 30 dias, exceto registros que devamos manter por obrigação legal (ex: notas fiscais — 5 anos; logs de acesso — 6 meses).
- Dados financeiros vinculados a cobranças concluídas podem ser anonimizados em vez de excluídos.

## 6. Seus direitos (art. 18 LGPD)
Você pode, a qualquer momento:
- Confirmar a existência de tratamento;
- Acessar seus dados;
- Corrigir dados incompletos ou desatualizados;
- Solicitar **anonimização, bloqueio ou eliminação**;
- Solicitar **portabilidade** (exportação em JSON);
- Revogar consentimento;
- Saber com quem compartilhamos.

Use o menu **Configurações → Privacidade e Dados** ou contate nosso **Encarregado de Dados (DPO)** em /encarregado-dados.

## 7. Segurança
- Criptografia em trânsito (TLS 1.2+) e em repouso.
- Isolamento por usuário/empresa via Row-Level Security.
- Autenticação em dois fatores disponível.
- Auditoria interna de acessos.

## 8. Cookies
Veja nossa [Política de Cookies](/cookies).

## 9. Transferência internacional
Alguns operadores podem processar dados fora do Brasil. Garantimos cláusulas contratuais de proteção compatíveis com a LGPD (art. 33).

## 10. Crianças e adolescentes
O serviço não é destinado a menores de 18 anos. Se identificarmos coleta indevida, os dados serão excluídos.

## 11. Alterações desta política
Mudanças relevantes serão comunicadas por e-mail e/ou aviso no app, com nova data de "Última atualização".

## 12. Contato
**Encarregado de Dados (DPO)**: dpo@360food.com
Veja a página do [Encarregado de Dados](/encarregado-dados) para mais informações.`,
  } satisfies LegalDocContent,

  legal_terms: {
    title: "Termos de Uso",
    last_updated: TODAY,
    body: `# Termos de Uso

Última atualização: **${TODAY}**

Estes Termos regulam o uso da plataforma **Aveto 360**. Ao criar uma conta, você concorda integralmente com estas condições e com a [Política de Privacidade](/privacidade).

## 1. Definições
- **Plataforma**: o software Aveto 360, acessível via web.
- **Usuário**: pessoa física ou jurídica que acessa a Plataforma.
- **Assinatura**: plano contratado para acesso aos recursos pagos.

## 2. Cadastro
- O Usuário deve fornecer dados verdadeiros, completos e atualizados.
- É proibido criar conta para terceiros sem autorização.
- Usuários devem ter no mínimo 18 anos.
- O Usuário é responsável por manter a confidencialidade de suas credenciais.

## 3. Período de teste e cobrança
- Oferecemos teste gratuito de 7 dias, sem necessidade de cartão.
- Ao final do teste, o acesso aos recursos pagos é interrompido salvo se houver contratação.
- Cobranças recorrentes são processadas pelo operador Asaas.
- Conforme o **CDC (art. 49)**, o Usuário tem direito de arrependimento em até 7 dias da primeira contratação, com reembolso integral.

## 4. Cancelamento
- Cancele a qualquer momento pelas Configurações da conta.
- Sem fidelidade. Valores já pagos pelo período corrente não são reembolsados, salvo direito de arrependimento.

## 5. Uso aceitável
É proibido:
- Praticar engenharia reversa, descompilação ou tentar burlar mecanismos de segurança;
- Usar a Plataforma para atividades ilícitas, fraude ou lavagem de dinheiro;
- Sobrecarregar a infraestrutura (scraping massivo, ataques);
- Inserir conteúdo de terceiros sem autorização.

O descumprimento permite suspensão imediata da conta.

## 6. Propriedade intelectual
- A Plataforma, marca, código e layout pertencem à Aveto 360.
- Os dados inseridos pelo Usuário permanecem de sua propriedade. Concedemos a você licença de uso da Plataforma; você nos concede licença limitada para processar seus dados para prestar o serviço.

## 7. Limitação de responsabilidade
- A Plataforma é uma ferramenta de **organização financeira**, não substitui contador, advogado nem assessoria de investimentos.
- Não nos responsabilizamos por decisões tomadas com base nos relatórios.
- Backups são realizados, mas o Usuário deve exportar periodicamente seus dados.
- Em caso de falha técnica, nossa responsabilidade é limitada ao valor pago nos últimos 12 meses.

## 8. Disponibilidade
Buscamos disponibilidade de 99,5% mensal, podendo haver janelas de manutenção comunicadas com antecedência.

## 9. Proteção de dados
O tratamento de dados pessoais segue a [Política de Privacidade](/privacidade) e a LGPD.

## 10. Alterações
Podemos atualizar estes Termos. Mudanças relevantes serão comunicadas por e-mail e no app com 15 dias de antecedência.

## 11. Foro
Fica eleito o foro da comarca da sede do Controlador para dirimir controvérsias, salvo direito do consumidor de optar pelo foro do seu domicílio (CDC art. 101, I).

## 12. Contato
contato@360food.com`,
  } satisfies LegalDocContent,

  legal_cookies: {
    title: "Política de Cookies",
    last_updated: TODAY,
    body: `# Política de Cookies

Última atualização: **${TODAY}**

Cookies são pequenos arquivos armazenados no seu navegador para melhorar a experiência de uso.

## 1. Tipos que utilizamos

### Necessários (sempre ativos)
Essenciais para autenticação, sessão e segurança. Sem eles a Plataforma não funciona.
- Sessão do Supabase Auth
- Preferência de consentimento de cookies

### Analíticos (opcional — depende do seu consentimento)
Ajudam a entender como a Plataforma é usada, de forma agregada e anônima.

### Marketing (opcional — depende do seu consentimento)
Usados para mensurar campanhas e personalizar comunicações.

## 2. Gerenciar preferências
Você pode aceitar, recusar ou personalizar suas preferências pelo banner exibido no primeiro acesso, ou a qualquer momento pelo link "Gerenciar cookies" no rodapé.

## 3. Cookies de terceiros
Quando você usa o checkout via Asaas, cookies do Asaas podem ser definidos para processar o pagamento.

## 4. Como excluir
Você pode bloquear ou excluir cookies pelas configurações do seu navegador. Isso pode impactar o funcionamento da Plataforma.

## 5. Contato
dpo@360food.com`,
  } satisfies LegalDocContent,

  legal_dpo: {
    title: "Encarregado de Tratamento de Dados (DPO)",
    last_updated: TODAY,
    dpo_name: "Encarregado de Dados — Aveto 360",
    dpo_email: "dpo@360food.com",
    controller_name: "Aveto 360",
    controller_cnpj: "00.000.000/0000-00",
    controller_address: "Brasil",
    body: `# Encarregado de Tratamento de Dados Pessoais

Em cumprimento ao **art. 41 da LGPD**, divulgamos abaixo o canal de contato do nosso Encarregado.

## Controlador
- **Razão social**: {controller_name}
- **CNPJ**: {controller_cnpj}
- **Endereço**: {controller_address}

## Encarregado (DPO)
- **Nome**: {dpo_name}
- **E-mail**: {dpo_email}

## Como exercer seus direitos
Você pode enviar requisições para o e-mail acima informando:
1. Nome completo e CPF;
2. Qual direito deseja exercer (art. 18 LGPD): acesso, correção, exclusão, portabilidade, anonimização, revogação de consentimento etc.;
3. Descrição clara do pedido.

Responderemos em até **15 dias úteis**.

## Atalhos no app
- **Exportar meus dados** (portabilidade): Configurações → Privacidade e Dados.
- **Excluir minha conta**: Configurações → Privacidade e Dados.
- **Reclamações à ANPD**: https://www.gov.br/anpd`,
  } satisfies LegalDpoContent,
} as const;

export type LegalSection = keyof typeof LEGAL_DEFAULTS;
export type LegalContentMap = typeof LEGAL_DEFAULTS;
