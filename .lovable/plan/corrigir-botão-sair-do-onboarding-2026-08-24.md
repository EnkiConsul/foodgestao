# Corrigir botão "Sair" do onboarding

## O que está acontecendo

O botão "Sair" (e o "Sair mesmo assim" do aviso de confirmação) leva o usuário para `/`. Como a conta está logada e o cadastro ainda não foi concluído, a página inicial devolve o usuário para o painel, que por sua vez exige onboarding concluído e devolve para `/onboarding`. Resultado: a tela pisca e volta para o wizard — nunca é possível sair.

## Correção

- No aviso "Deseja sair do cadastro?", ao confirmar: encerrar a sessão do usuário e então ir para a página inicial pública. Assim não há mais redirecionamento de volta ao wizard.
- Deixar o texto do aviso claro: sair encerra a sessão e os dados preenchidos serão perdidos.
- Mostrar estado de carregamento no botão de confirmação enquanto a saída acontece, evitando cliques repetidos.
- Manter o comportamento atual da etapa 3 (sucesso): ali o cadastro já está concluído, então "Acessar painel" continua indo direto para o painel sem encerrar a sessão.

## Detalhes técnicos

- `src/pages/Onboarding.tsx`: `requestExit` continua abrindo o `AlertDialog`; a ação de confirmação passa a chamar `supabase.auth.signOut()` (via helper de auth já usado no projeto) e depois `navigate("/", { replace: true })`, com flag local de `exiting` para desabilitar o botão.
- Nenhuma mudança nos guards (`src/routes/onboardingGuards.tsx`) nem no `RootGate` — a regra de bloquear o painel sem onboarding concluído permanece.
