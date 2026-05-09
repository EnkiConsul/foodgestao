## Causa do problema

Verifiquei o banco: o seu `profiles.onboarding_completed` já está como `true` (provavelmente de um teste anterior ou de quando você usou "Pular onboarding"). 

No turno anterior eu adicionei esta proteção em `src/App.tsx` (`OnboardingGuard`):

```tsx
if (completed) return <Navigate to="/" replace />;
```

Resultado: sempre que você abre `/onboarding`, ele te chuta direto para `/`. Não é o "concluir a etapa do perfil" que dispara o redirect — é o guard que dispara assim que carrega a página, no momento em que o React renderiza após o autosave do step (mudança de estado → re-render → guard re-checa). Por isso parece que aconteceu "depois" da ação.

## Plano

1. **`src/App.tsx` — `OnboardingGuard`**: remover o `Navigate to="/"` automático. Deixar o usuário permanecer em `/onboarding` mesmo se `onboarding_completed = true` (pode estar revisitando para revisar/completar etapas que pulou).

2. **Manter** a proteção no `ProtectedRoute`: se onboarding **não** estiver concluído, enviar para `/onboarding`. Isso garante que novos usuários ainda sejam guiados pelo checklist.

3. **Resetar o seu perfil de teste** (opcional, posso fazer com sua aprovação): voltar `onboarding_completed = false` para o seu user_id, para você conseguir testar o fluxo do começo.

## Comportamento depois do fix

- Usuário novo (`onboarding_completed=false`) → `/` redireciona para `/onboarding`, fica lá até clicar "Liberar Dashboard".
- Usuário com onboarding já concluído → `/` abre o Dashboard normalmente; `/onboarding` continua acessível se ele digitar a URL (não chuta).
- Concluir uma etapa do checklist → apenas marca o item, sem redirect.
