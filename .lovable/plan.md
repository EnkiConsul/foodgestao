## Objetivo

Garantir que o usuário seja sempre levado à página correta de acordo com o estado de autenticação:

- **Não autenticado** → enviado para `/auth`.
- **Autenticado em `/auth`** → enviado para `/` (Dashboard) ou `/onboarding` se ainda não concluiu o onboarding.
- **Após logout** (de qualquer página) → enviado para `/auth` e cache de dados limpo.
- **Após login bem-sucedido** → enviado para `/` (já existe), preservando uma URL de retorno opcional (ex.: usuário deslogado tentou abrir `/lancamentos` e volta para lá após logar).

## Hoje

- `ProtectedRoute` já redireciona para `/auth` quando não há usuário. ✓
- `Auth.tsx` faz `navigate("/")` após login. ✓
- **Faltam:**
  1. Bloquear acesso a `/auth` quando o usuário já está logado (hoje continua mostrando o formulário).
  2. Logout no `AppSidebar` apenas chama `supabase.auth.signOut()` sem navegar nem limpar cache do React Query — pode deixar telas com dados antigos antes do redirect.
  3. Não há suporte a "redirect após login" (`?redirect=/rota-original`).

## Mudanças

### 1. `src/App.tsx` — guard para `/auth`

Criar um `PublicOnlyRoute` simples:

- Se `loading`, mostra spinner.
- Se `user` existe: `<Navigate to={searchParams.get("redirect") ?? "/"} replace />`.
- Caso contrário, renderiza o filho.

Aplicar em `<Route path="/auth" element={<PublicOnlyRoute><Auth /></PublicOnlyRoute>} />`.

### 2. `ProtectedRoute` — preservar destino original

Quando redireciona para `/auth`, anexar `?redirect=<pathname+search>` para que o login devolva o usuário à rota originalmente solicitada.

### 3. `src/pages/Auth.tsx` — usar `redirect` no pós-login

- Ler `redirect` via `useSearchParams`.
- Em `checkMfaAndRedirect()` e no fluxo de cadastro, navegar para `redirect` quando presente (apenas se começar com `/` para evitar open redirect), senão `/`.
- No `MfaChallenge` `onSuccess`, idem.

### 4. `src/hooks/useAuth.tsx` — `signOut` centralizado com redirect e limpeza

- Importar `useNavigate` e `useQueryClient`.
- `signOut` passa a:
  1. `await supabase.auth.signOut()`
  2. `queryClient.clear()` — evita exibir dados do usuário anterior.
  3. `navigate("/auth", { replace: true })`.
- Mantém assinatura `() => Promise<void>`.

### 5. `src/components/layout/AppSidebar.tsx` — usar `signOut` do hook

- Substituir o handler atual por `const { signOut } = useAuth(); ... onClick={signOut}`.
- Remove o `await import` dinâmico do client.

### 6. `src/components/auth/MfaChallenge.tsx` — manter consistente

- O `cancel()` já chama `supabase.auth.signOut()`; trocar para usar `useAuth().signOut()` para que também limpe o cache e redirecione (evita ficar em `/auth` num estado inconsistente).

## Detalhes técnicos

- `onAuthStateChange` em `useAuth` continua atualizando `session/user`, então o `PublicOnlyRoute` reagirá automaticamente após login (não dependemos só do `navigate`).
- Validação anti open-redirect: aceitar somente `redirect` que comece com `/` e não com `//`.
- `queryClient.clear()` é seguro pois o `QueryClientProvider` está acima do `AuthProvider` (mesma instância via `useQueryClient`).

## Arquivos afetados

- `src/App.tsx` (novo `PublicOnlyRoute`, `ProtectedRoute` com `redirect`)
- `src/hooks/useAuth.tsx` (`signOut` redireciona + limpa cache)
- `src/pages/Auth.tsx` (respeita `?redirect=`)
- `src/components/layout/AppSidebar.tsx` (usa `signOut` do hook)
- `src/components/auth/MfaChallenge.tsx` (usa `signOut` do hook)

## Fora do escopo

- Página inicial pública (landing) — pode ser proposta separada.
- Mudanças na lógica de onboarding.
