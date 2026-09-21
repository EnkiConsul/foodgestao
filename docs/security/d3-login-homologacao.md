# D3 — Login e dados mínimos de homologação

## Alteração

O build validado de homologação autentica no Supabase Auth do projeto
`utjhzpdbqzajrhnzcher` usando e-mail fictício `@example.invalid` e senha real.
Não há usuário automático, sessão fabricada nem senha incluída no código.
A configuração de ambiente é validada antes de escolher o fluxo de login.

Somente nesse build, o formulário dispensa o CAPTCHA externo e não consulta
`auth-config`. Produção continua usando `auth-login` com o token do Turnstile.
O fluxo por CPF deve ser validado separadamente com uma implementação de teste
da função; o login de homologação aceita somente e-mail fictício.

O filtro de domínio no frontend é uma restrição de operação dos testes, não uma
regra de autorização do servidor. Credenciais, sessões e RLS continuam sendo
validadas pelo Supabase. Não se devem cadastrar dados reais nesse projeto.

## Preparação aplicada em 2026-09-21

Foi inserido somente no banco de homologação o segmento
`d3000000-0000-4000-8000-000000000001`, nome
“Homologação — Restaurante fictício”, slug `d3-restaurante-ficticio`.
A inserção é idempotente por ID e não altera segmentos existentes.

## Validação

- Testes de seleção do ambiente, autenticação real, credenciais rejeitadas,
  domínio fictício, configuração inválida e preservação do login de produção.
- `node scripts/check-hom-login.mjs`: executa login real e somente leituras no
  projeto de homologação. Exige `.env.homologacao.local` e as credenciais locais
  já provisionadas em `%LOCALAPPDATA%/Aveto360/homologacao/credentials.json`.
  Não exibe senhas ou tokens; encerra a sessão de teste ao terminar.
- Verificados por HTTP: senha incorreta recusada, login válido, segmento visível
  sob RLS e `check-onboarding-cnpj` autenticado retornando `available`.

## Limites

Essa validação não equivale ao percurso completo do onboarding no navegador.
Ainda é necessário testar o assistente com usuário fictício sem empresa,
incluindo criação, duplicidade e retorno ao hub. As contas A–D já possuem
vínculos e não devem ter seus dados apagados para forçar o onboarding.
O build local não é uma publicação em URL de homologação compartilhada.
Nenhuma configuração de autenticação ou banco de produção foi alterada.
