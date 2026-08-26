# Não criar espaço financeiro pessoal (PF) automaticamente

## Objetivo

Novas contas são **PJ-first**: nenhum dado financeiro pessoal é criado ou semeado no cadastro. O contexto "Pessoal" deixa de ser o ponto de partida e só aparece para usuários legados que já têm dados PF.

## Estado atual (verificado)

- Ao criar o perfil, o gatilho `profiles_seed_default_payment_methods` semeia ~9 formas de pagamento PF automaticamente.
- `useCompanyContext` inicia toda conta nova no contexto `pf` (fallback do localStorage) — o app abre no "Pessoal" vazio.
- O seletor de contexto já oculta a opção "Pessoal" para quem está em PJ, mas o ponto de partida continua sendo PF.

## Mudanças

### 1. Remover o seed automático PF (migração)
- Dropar o trigger `profiles_seed_default_payment_methods` e a função associada, mantendo intacto o seed de formas de pagamento **da empresa** (`companies_seed_default_payment_methods`), que continua rodando no onboarding PJ.
- Dados PF já existentes de usuários atuais **não são apagados** — apenas param de ser criados para contas novas.

### 2. Contexto inicial PJ (frontend)
- `useCompanyContext`: quando não houver nada salvo no localStorage, o padrão passa a ser `pj` (se houver empresa acessível) em vez de `pf`. Se o usuário ainda não tem empresa, cai no fluxo de onboarding normal.
- Fallback automático para PF continua existindo **somente** para quem já tem dados PF legados (contas/categorias/transações PF), preservando o acesso ao histórico.

### 3. Seletor de contexto
- `ContextSelector`: a opção "Pessoal" só aparece para usuários legados que realmente possuem dados PF (verificação única: existe ao menos uma conta ou transação PF do usuário). Demais usuários veem apenas empresas.

## Fora de escopo

- Nada muda no onboarding PJ, nas empresas existentes nem nos dados PF já criados.
- Nenhuma tela/rota PF é removida neste momento — apenas deixam de ser o padrão para contas novas.

## Verificação

- Criar conta nova: não gera formas de pagamento PF; app abre no fluxo PJ/onboarding, nunca no "Pessoal" vazio.
- Usuário legado com dados PF continua vendo a opção "Pessoal" e seus dados intactos.
- Testes unitários da lógica de detecção de PF legado.
