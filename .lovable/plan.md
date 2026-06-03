# Corrigir loop de login causado por 2FA

## Problema
Após o login, o app redireciona em loop entre `/auth` e `/dashboard`. A causa é o erro 422 `mfa_factor_name_conflict` ao tentar criar um fator TOTP — já existe um fator com o `friendlyName` "Authenticator YYYY-MM-DD" para o usuário, e a limpeza atual não consegue removê-lo.

## Mudanças

### 1. `src/components/auth/MfaEnrollRequired.tsx`
- `friendlyName` único por tentativa: `` `Authenticator ${Date.now()}` `` em vez de data do dia.
- Limpeza robusta: percorrer `listFactors()` e fazer `unenroll` de todo fator com `status !== "verified"`, capturando erros individuais (`Promise.allSettled`).
- Tratar especificamente erro 422 `mfa_factor_name_conflict`: chamar a nova edge function `admin-reset-mfa` para limpar fatores órfãos e refazer o enroll uma vez antes de cair em `stage="error"`.
- Mensagens de erro mais claras em `translateMfaError` para o código `mfa_factor_name_conflict`.
- Botão "Resetar 2FA e tentar de novo" na tela de erro que chama `admin-reset-mfa` + recarrega.

### 2. Nova edge function `supabase/functions/admin-reset-mfa/index.ts`
- Autenticada (lê JWT do header `Authorization`, usa `supabase.auth.getUser` para obter `userId`).
- Usa `SUPABASE_SERVICE_ROLE_KEY` com `auth.admin.mfa.listFactors({ userId })` para enxergar **todos** os fatores (incluindo os invisíveis ao client).
- Faz `auth.admin.mfa.deleteFactor({ id })` em cada fator **não verificado**.
- Não deleta fatores `verified` (segurança).
- Registrada em `supabase/config.toml` com `verify_jwt = true`.

### 3. Validação
- Logout → login novamente → confirmar que o QR code aparece sem 422 nos `auth_logs`.
- Verificar no replay que não há mais loop `/auth ↔ /dashboard`.

## Fora do escopo
- Não alteramos `ProtectedRoute` / `PublicOnlyRoute` (a lógica deles está correta; o loop some quando o enroll funciona).
- Não desabilitamos a obrigatoriedade de 2FA.
