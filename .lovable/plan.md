# Verificação de e-mail duplicado no cadastro de conta

## Diagnóstico do problema relatado

A mensagem "Este e-mail já está cadastrado" nunca aparece porque o cadastro **não recebe erro** do backend nesse caso.

Com a proteção contra enumeração de e-mail (padrão do backend), `supabase.auth.signUp` com um e-mail já existente responde **sucesso**: retorna um objeto de usuário "fantasma", sem sessão e com a lista de identidades vazia (`identities: []`), e nenhum `error`.

Em `src/hooks/useAuth.tsx` o `signUp` só devolve `{ error, needsEmailConfirmation }` — ignora `data.user.identities`. Como `error` é `null`, `src/pages/Auth.tsx` segue pelo caminho de sucesso e mostra a tela "confirme seu e-mail", em vez do aviso de e-mail duplicado. O tradutor de mensagens ("already registered") existe, mas nunca é acionado.

## Objetivo

1. Fazer a detecção de e-mail já cadastrado funcionar de fato no cadastro de conta.
2. Adicionar verificação de e-mail duplicado no onboarding da empresa.

## Escopo

### 0. Corrigir a detecção de e-mail já cadastrado no cadastro (prioritário)

- Em `src/hooks/useAuth.tsx`, ampliar o retorno de `signUp` para incluir `alreadyRegistered`, detectado quando não há erro e `data.user` existe com `identities` vazio (ou ausente) e sem sessão.
- Em `src/pages/Auth.tsx`, quando `alreadyRegistered` for verdadeiro:
  - exibir o aviso "Este e-mail já está cadastrado. Entre com sua senha ou use 'Esqueci minha senha'.";
  - oferecer atalhos para **Entrar** e **Recuperar senha** já com o e-mail preenchido;
  - não exibir a tela de "confirme seu e-mail";
  - registrar o evento de erro de cadastro com o motivo `email_already_registered` (mantendo a categorização atual de analytics).
- Manter o `translateAuthError` atual como rede de segurança para quando o backend realmente devolver erro.

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
- Não desligaremos a proteção contra enumeração de e-mail do backend: a detecção será feita pelo sinal de identidades vazias, mantendo a segurança atual.

## Checklist técnico

- [ ] Ampliar `signUp` em `useAuth.tsx` com o sinal `alreadyRegistered` (identidades vazias).
- [ ] Tratar `alreadyRegistered` em `Auth.tsx` com aviso e atalhos para entrar/recuperar senha.
- [ ] Criar Edge Function `check-onboarding-email` com autenticação e CORS.
- [ ] Adicionar função de consulta no frontend (`src/lib/onboardingStatus.ts`).
- [ ] Atualizar `Onboarding.tsx` para validar e-mail da empresa antes de avançar.
- [ ] Alterar `public.fn_cadastrar_empresa_onboarding` para verificar e-mail duplicado.
- [ ] Atualizar `useOnboardingSubmit.tsx` para reconhecer o código `email_ja_cadastrado`.
- [ ] Testar cadastro com e-mail já existente, e-mail novo e onboarding com e-mail de empresa duplicado.

