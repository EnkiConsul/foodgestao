## Problema
No final do onboarding (`src/pages/Onboarding.tsx`, linha 171), tentamos gravar `profile_type: "empresarial"` no `profiles`, mas o enum `profile_type` no banco só aceita `pf | mei | microempresa | hibrido`. O PATCH retorna 400 (`invalid input value for enum profile_type: "empresarial"`), `onboarding_completed` nunca vira `true`, e o Hub devolve o usuário para `/onboarding`.

Além disso, a RPC `fn_cadastrar_empresa_onboarding` já retorna sucesso e cria a empresa — só a marcação de conclusão do perfil falha.

## Correção

**1. `src/pages/Onboarding.tsx`**
- Remover `profile_type` do update; deixar apenas `onboarding_completed: true`. O `profile_type` já é definido no signup/perfil e não precisa mudar aqui (a empresa vive em `companies`, não no enum de perfil).
- Tratar erro do update (log + toast) para não avançar silenciosamente caso falhe.

**2. `src/hooks/useOnboardingSubmit.tsx` (opcional, defensivo)**
- Se a RPC retorna sucesso mas o `update profiles` falhar, ainda mostrar sucesso (a empresa foi criada), mas logar para diagnóstico.

## Validação
- Rodar o fluxo de onboarding novamente e confirmar:
  - PATCH `/profiles` retorna 204.
  - Tela "Cadastro concluído!" aparece.
  - Clicar em "Acessar Painel" navega para `/` e permanece (não volta para `/onboarding`).
