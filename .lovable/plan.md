# Por que a tela fica alternando

O replay mostra: formulário de login → "Preparando configuração..." → navegação para `/auth?redirect=/dashboard` → formulário de login, repetindo a cada ~1,5s.

A causa é uma cadeia entre 3 pontos:

1. **`PublicOnlyRoute` (em `src/App.tsx`)** roda o `useEffect` de checagem de MFA toda vez que a referência de `user` muda. Como `useAuth` dispara `onAuthStateChange` em `TOKEN_REFRESHED` (e em vários outros eventos), o objeto `user` ganha referência nova mesmo quando o id é o mesmo. Isso recoloca `mfaChecking=true`, faz a tela trocar para spinner / desmontar a Auth.

2. **`Auth.tsx`** tem o mesmo padrão no `useEffect([user])` — ao receber novo `user`, chama `checkMfaState` e, se não há fator verificado, ativa `MfaEnrollRequired`.

3. **`MfaEnrollRequired`** roda no mount um `listFactors → unenroll(todos não verificados) → enroll(novo)`. Cada `enroll/unenroll` mexe na sessão, o Supabase emite novo evento de auth, `user` ganha nova referência, `PublicOnlyRoute` re-renderiza, o componente desmonta/remonta e o ciclo recomeça (criando fatores TOTP descartáveis a cada volta).

O `navigate` para `/auth?redirect=/dashboard` aparece porque, entre dois ciclos, o `ProtectedRoute` chega a ser renderizado e empurra de volta para `/auth`.

# O que mudar

Mantém a funcionalidade (login + MFA obrigatório) intacta, só estabiliza os efeitos.

## 1. `src/App.tsx` — `PublicOnlyRoute` e `ProtectedRoute`
- Trocar a dependência dos `useEffect` de MFA de `[user]` para `[user?.id]`, para não re-disparar a checagem quando só a referência do objeto muda (token refresh, etc.).
- Em `PublicOnlyRoute`, não voltar a `mfaChecking=true` quando o id do usuário continua o mesmo (evita o flicker para spinner que desmonta `Auth`).

## 2. `src/pages/Auth.tsx`
- Mesma troca: `useEffect([user?.id])`.
- Guardar com um `ref` para não re-executar `checkMfaState` se já decidimos o estado para aquele `user.id`.

## 3. `src/components/auth/MfaEnrollRequired.tsx`
- Proteger o `useEffect` de bootstrap com um `useRef` (`didEnrollRef`) para garantir execução única por montagem real, evitando que StrictMode/remounts criem múltiplos fatores TOTP.
- Antes de chamar `enroll`, se `listFactors` já retornar um fator **não verificado** recente, reutilizar (ler `id`/`secret` via um novo `enroll` só se necessário) em vez de unenroll+enroll cego — reduz tráfego e elimina o efeito colateral na sessão.

## Detalhes técnicos
- Nenhuma mudança em RLS, edge functions ou banco.
- Sem mudança de UI/visual; só estabilização de efeitos.
- Após a correção: ao logar com MFA obrigatório, o usuário vê **uma vez** "Preparando configuração..." e em seguida o QR code, sem piscar.

## Validação
- Recarregar `/auth` deslogado → form estável.
- Logar com conta que tem MFA pendente → vai para tela de enroll e permanece.
- Logar com conta que já tem TOTP verificado → vai para `MfaChallenge` e permanece.
- Conferir no painel do Supabase Auth que **não** ficam acumulando fatores TOTP "unverified" a cada tentativa.
