# Colaborador deve cair no Portal do Colaborador, nunca no cadastro de empresa

## O que está acontecendo (confirmado nos dados e no código)

O acesso do Nordman está correto: o usuário existe, está ligado ao cadastro dele, tem o papel de colaborador e pertence à empresa.

O problema é o destino depois de entrar:

- Ao entrar pela tela de login, o sistema sempre manda para a área da empresa (`/hub`), sem olhar o tipo de acesso.
- A proteção dessa área verifica se a pessoa tem empresa própria. O colaborador não tem (e o perfil dele está com onboarding não concluído), então ele é jogado para o assistente de cadastro da empresa.
- A escolha correta de destino por tipo de acesso só existe hoje quando a pessoa abre a raiz do site ("/"), não após o login.

## Correção proposta

1. Criar uma resolução única de destino pós-login: super admin / dono / administrador → área da empresa; colaborador → `/dp/meu`; ninguém mais → tela de acesso indisponível já existente/mensagem clara.
2. A tela de login passa a usar essa resolução (inclusive quando não há `redirect`), e ignora um `redirect` para área de empresa quando quem entrou é somente colaborador.
3. A proteção das telas de empresa deixa de enviar colaborador para o assistente de cadastro: se a pessoa é colaborador e não é dono/administrador, vai para `/dp/meu`.
4. O guarda do assistente de cadastro (`/onboarding`) faz a mesma checagem: colaborador sem empresa própria é redirecionado para o portal.
5. Manter a raiz ("/") como está, apenas reutilizando a nova resolução para evitar duas regras diferentes.

Nada de regra de negócio, permissão de banco ou isolamento entre empresas muda. Não haverá alteração de dados do Nordman nem de perfis.

## Detalhes técnicos

- Novo módulo `src/lib/auth/landing.ts` com `resolveLandingTarget(userId)`, consultando em paralelo: `user_roles` (super_admin), `companies.user_id`, `company_members` (owner/admin) e a RPC `is_dp_colaborador`. Retorna `{ kind: "empresa" | "portal" | "indisponivel", path }`.
- `src/pages/Auth.tsx`: `checkMfaAndRedirect` chama `resolveLandingTarget`; se o alvo é `portal` e o `redirect` sanitizado não começa com `/dp/meu`, usa `/dp/meu`.
- `src/routes/onboardingGuards.tsx`: em `ProtectedRoute`, antes de `Navigate to="/onboarding"`, se `resolveLandingTarget` retornar `portal`, redirecionar para `/dp/meu`. Em `OnboardingGuard`, mesma checagem.
- `src/App.tsx`: `RootGate` passa a usar `resolveLandingTarget` em lugar dos dois hooks locais duplicados (`useIsDpColaborador` + `useIsAdminOrOwner`), mantendo o spinner enquanto resolve.

## Testes e evidências

- Testes unitários de `resolveLandingTarget` (colaborador puro, dono, administrador, super admin, sem vínculo).
- Teste de `ProtectedRoute` garantindo que colaborador com `onboarding_completed = false` não é enviado para `/onboarding`.
- Verificação autenticada com navegador entrando como o usuário do Nordman e confirmando que a primeira tela é o portal do colaborador, em celular e computador.
- Rodar typecheck e a suíte de testes existente.

## Rollback

Alterações restritas a quatro arquivos de frontend (um novo). Reverter os arquivos restaura o comportamento anterior; não há migração de banco.
