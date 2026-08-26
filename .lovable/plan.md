# Corrigir aviso de e-mail já cadastrado no cadastro de conta

## Diagnóstico

A mensagem "Este e-mail já está cadastrado" nunca aparece porque o cadastro **não recebe erro** do backend nesse caso.

Com a proteção contra enumeração de e-mail (comportamento padrão), o cadastro com um e-mail já existente responde **sucesso**: devolve um usuário "fantasma", sem sessão e com a lista de identidades vazia (`identities: []`), e nenhum erro.

Em `src/hooks/useAuth.tsx`, o `signUp` retorna apenas `{ error, needsEmailConfirmation }` e ignora `data.user.identities`. Como o erro é nulo, `src/pages/Auth.tsx` segue pelo caminho de sucesso e mostra a tela "confirme seu e-mail". O tradutor de mensagens ("already registered") existe, mas nunca é acionado.

## Escopo

Apenas o cadastro de nova conta. Nada será alterado no onboarding da empresa: o mesmo e-mail de usuário pode ter acesso a várias empresas, e o e-mail da empresa não precisa ser único.

### 1. Detectar o e-mail já cadastrado (`src/hooks/useAuth.tsx`)

- Ampliar o retorno de `signUp` com o sinal `alreadyRegistered`.
- Considerar já cadastrado quando não houver erro, existir `data.user`, a lista de identidades vier vazia (ou ausente) e não houver sessão.
- Manter `needsEmailConfirmation` apenas para o caso legítimo de e-mail novo aguardando confirmação.

### 2. Tratar o sinal na tela (`src/pages/Auth.tsx`)

- Quando `alreadyRegistered` for verdadeiro:
  - não exibir a tela de "confirme seu e-mail";
  - mostrar aviso: "Este e-mail já está cadastrado. Entre com sua senha ou use 'Esqueci minha senha'.";
  - oferecer atalhos para **Entrar** e **Recuperar senha**, já com o e-mail preenchido no campo correspondente;
  - registrar o evento de erro de cadastro com o motivo `email_already_registered`, mantendo a categorização de analytics existente.
- Manter `translateAuthError` como rede de segurança para quando o backend realmente devolver erro.

### 3. Testes

- Teste unitário do sinal `alreadyRegistered` cobrindo: identidades vazias (já cadastrado), identidade presente sem sessão (e-mail novo aguardando confirmação) e sessão presente (login imediato).

## Detalhes técnicos

- A detecção é feita apenas com dados que o cliente já recebe; nenhuma consulta extra a tabelas e nenhuma nova função de backend.
- A proteção contra enumeração de e-mail permanece ativa; o aviso é genérico o suficiente para não vazar informação além do que o próprio fluxo de recuperação de senha já expõe.
- Nenhuma migração de banco de dados é necessária.
