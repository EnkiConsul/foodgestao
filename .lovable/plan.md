## Problema

O botão do olho no `AppHeader` usa `useState` local — clicar não faz nada além de trocar o ícone, porque os componentes que mascaram valores leem de `usePrivacy()` (que vem do `profiles.privacy_mode` no backend).

## Correção

1. **`src/hooks/usePrivacy.tsx`** — expor função `togglePrivacy()` que faz `UPDATE profiles SET privacy_mode = !privacy_mode` para o usuário atual e invalida a query `["privacy-mode", user.id]`.
2. **`src/components/layout/AppHeader.tsx`** — remover `useState` local; consumir `privacyMode` e `togglePrivacy` de `usePrivacy()`; usar no `onClick` e no ícone.

Resultado: clicar no olho realmente mascara/desmascara os valores em todo o app e persiste a preferência.