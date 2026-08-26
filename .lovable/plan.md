# Verificação de e-mail duplicado no cadastro de conta

## Contexto atual

Hoje o cadastro de nova conta faz duas validações distintas em momentos diferentes:

- **Criação da conta (Auth.tsx):** o Supabase Auth já recusa e-mails repetidos na tabela `auth.users`. A tela traduz a mensagem "already registered" para "Este e-mail já está cadastrado. Tente entrar ou recuperar sua senha.".
- **Onboarding da empresa (Onboarding.tsx):** existe uma verificação precoce de CNPJ duplicado via `check-onboarding-cnpj`, mas **não há verificação de e-mail duplicado** para o e-mail da empresa (`companies.email`) nem para o e-mail do usuário já cadastrado como contato/cliente (`contacts.email`).

## Objetivo

Adicionar uma verificação clara de e-mail duplicado durante o cadastro de nova conta/onboarding, impedindo que um mesmo e-mail seja usado para criar uma segunda empresa ou conta de cliente quando já existe vínculo ativo.

## Escopo

### 1. Verificação precoce no onboarding (frontend)

- Criar serviço `src/lib/onboardingStatus.ts` ou similar para chamar uma nova Edge Function `check-onboarding-email`.
- Validar **e-mail da empresa** (`p_email_empresa`) no passo 1 do onboarding, antes de avançar para o passo 2.
- Validar **e-mail do cliente** (`p_email_cliente`) — que é o e-mail do usuário logado — apenas como alerta, pois o Supabase Auth já bloqueia duplicidade de conta.
- Exibir mensagem amigável equivalente à do CNPJ duplicado.

### 2. Edge Function `check-onboarding-email`

- Receber o e-mail e o tipo (`empresa` ou `cliente`).
- Para `empresa`: consultar `public.companies` filtrando por `lower(email)` e `is_active = true`. Se existir e pertencer ao usuário atual, retornar `accessible`; se pertencer a outro usuário, retornar `registered`; senão, `available`.
- Para `cliente`: consultar `public.contacts` filtrando por `lower(email)` e retornar `registered` apenas como alerta informativo (não bloqueia, pois o mesmo fornecedor pode atender várias empresas).
- Reutilizar o mesmo padrão de autenticação e CORS da Edge Function `check-onboarding-cnpj`.

### 3. Validação server-side na RPC de onboarding

- Alterar `public.fn_cadastrar_empresa_onboarding` para também verificar duplicidade de e-mail ativo em `public.companies` antes de inserir.
- Levantar exceção `email_ja_cadastrado` quando `lower(p_email_empresa)` já existir em outra empresa ativa.
- Adicionar o tratamento do novo código no frontend (`useOnboardingSubmit.tsx` e `Onboarding.tsx`).

### 4. Ajustes de UX no formulário

- No `StepEmpresa`, adicionar estado de carregamento e mensagem de erro inline no campo `emailEmpresa` quando duplicado.
- Garantir que o erro não permita avançar para o passo 2 até que um e-mail válido e não duplicado seja informado.
- Manter a experiência consistente com a validação de CNPJ existente.

## Não incluído neste plano

- Não criaremos `UNIQUE` constraint global em `companies.email` nem em `contacts.email`, pois o mesmo e-mail corporativo pode ter usos legítimos em contextos distintos (por exemplo, conta PF e PJ do mesmo usuário). A verificação será feita por regra de negócio, não por constraint de banco.
- Não alteraremos o fluxo de signup do Supabase Auth; apenas melhoraremos as mensagens e validações do onboarding.

## Checklist técnico

- [ ] Criar Edge Function `check-onboarding-email` com autenticação e CORS.
- [ ] Adicionar função de consulta no frontend (`src/lib/onboardingStatus.ts`).
- [ ] Atualizar `Onboarding.tsx` para validar e-mail da empresa antes de avançar.
- [ ] Alterar `public.fn_cadastrar_empresa_onboarding` para verificar e-mail duplicado.
- [ ] Atualizar `useOnboardingSubmit.tsx` para reconhecer o código `email_ja_cadastrado`.
- [ ] Testar fluxo de cadastro com e-mail duplicado e com e-mail novo.
