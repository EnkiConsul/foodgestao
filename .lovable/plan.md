# Tornar 2FA opcional

Hoje o app **força** o usuário a configurar 2FA no login. O card já existe em `Configurações` — basta remover a obrigatoriedade. O desafio MFA continua sendo pedido para quem **já tem** um fator verificado (não enfraquece a segurança de quem ativou).

## Mudanças

### 1. `src/App.tsx` — remover bloqueio
- Em `ProtectedRoute`: remover a verificação `!hasVerified` do `needsAal2`. Só redirecionar para `/auth` quando `aal.nextLevel === "aal2" && currentLevel !== "aal2"` (ou seja: o usuário já tem fator verificado e precisa elevar a sessão).
- Em `PublicOnlyRoute`: mesmo ajuste — `mfaRequired` passa a ser apenas `needsAal2`, sem a parte de "não tem fator verificado".

### 2. `src/pages/Auth.tsx` — remover enrollment forçado
- Remover o estado `mfaEnrollRequired` e a renderização do `<MfaEnrollRequired />`.
- Manter apenas o `<MfaChallenge />` quando `needsAal2` for verdadeiro (usuários que já têm 2FA ativo).
- Em `checkMfaState` / `checkMfaAndRedirect`: ignorar o caso `!hasVerified` — redirecionar direto para o destino.

### 3. `src/components/auth/MfaEnrollRequired.tsx`
- Manter o arquivo (não usado mais no fluxo de login, mas pode ser reaproveitado pelo `TwoFactorCard` no futuro). Sem alterações.

### 4. `src/components/settings/TwoFactorCard.tsx`
- Já existe e permite ativar/desativar 2FA. Nenhuma mudança necessária.

### 5. Validação
- Logout → login → vai direto para `/dashboard` sem pedir QR code.
- Em `Configurações`, ativar 2FA → próximo login pede o código de 6 dígitos normalmente.

## Fora do escopo
- Não removemos a edge function `admin-reset-mfa` (continua útil quando o usuário trava ao ativar 2FA na tela de configurações).
- Não mexemos no `TwoFactorCard`.
