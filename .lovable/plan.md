## Objetivo
Quebrar o chunk único de ~3 MB em pedaços carregados sob demanda, priorizando o que é raramente usado no primeiro acesso (módulos DP, Relatórios, Admin, Landing, PDF worker) e agrupando libs pesadas em vendor chunks estáveis para melhorar cache.

## Diagnóstico confirmado
- `src/App.tsx`: **57 imports estáticos de páginas**, zero `React.lazy`. Toda a árvore de rotas (DP, Admin, Relatórios, Checkout, Legal, Landing) entra no bundle inicial mesmo em `/dashboard`.
- `vite.config.ts`: sem `build.rollupOptions.output.manualChunks` — Rollup joga tudo (React, Radix, Recharts, pdfjs, Supabase, react-hook-form, etc.) num único chunk grande.
- `src/lib/statement-import/nubankPdf.ts`: importa `pdfjs-dist` e o worker via `?worker` **estaticamente**. Consumido só por `ImportStatementDialog`, mas hoje entra no bundle principal via a cadeia `Lancamentos → ImportStatementDialog`.

## Escopo da mudança

### 1. Lazy por rota em `src/App.tsx`
Converter todas as rotas de página para `React.lazy(() => import(...))` e envolver `<Routes>` num único `<Suspense fallback={<PageSpinner />}>`. Manter eager somente as rotas críticas do primeiro paint autenticado:
- `Landing`, `Auth`, `Hub`, `Dashboard` → eager (entrypoints prováveis)
- Todo o resto (DP/*, Admin/*, Relatorios/*, Checkout, Faturas, Legal, Onboarding, Lancamentos, FluxoCaixa, Orcamento, Categorias, Contatos, etc.) → lazy

Reusar o spinner que já aparece em `RootGate`/`PortalProtected` como fallback do Suspense (extrair para `components/PageSpinner.tsx`).

### 2. Lazy do `ImportStatementDialog` dentro de `Lancamentos`
`nubankPdf.ts` + `pdfjs-dist` + worker representam boa parte do peso. Converter o import de `ImportStatementDialog` em `Lancamentos.tsx` para `lazy()` + `Suspense`, para que pdfjs só desça quando o usuário abrir "Importar extrato". O worker (`?worker`) já é chunk separado; o problema é `pdfjs-dist` no bundle principal — resolvido pelo lazy da diálogo.

### 3. `manualChunks` em `vite.config.ts`
Adicionar `build.rollupOptions.output.manualChunks` agrupando vendors estáveis para cache de longo prazo:
- `react-vendor`: `react`, `react-dom`, `react-router-dom`, `react/jsx-runtime`
- `radix`: todos os `@radix-ui/*`
- `charts`: `recharts`, `d3-*`
- `supabase`: `@supabase/supabase-js`
- `forms`: `react-hook-form`, `@hookform/resolvers`, `zod`
- `pdf`: `pdfjs-dist` (garantia extra caso alguma outra rota importe)

Função `manualChunks(id)` baseada em `node_modules/<pkg>`.

### 4. Verificação
- `bun run build` antes/depois: registrar tamanho do maior chunk e do initial JS carregado em `/dashboard`.
- Rodar `bunx vitest run` (145 testes) para garantir que nada da refatoração de lazy quebra imports/tipos.
- Testar navegação rápida entre `/dashboard → /dp → /relatorios → /lancamentos → abrir Importar extrato` para conferir Suspense e ausência de flashes.

## Detalhes técnicos
- `React.lazy` exige `export default` nas páginas. Todas as páginas em `src/pages/**` já usam default export — compatível.
- `Suspense` fica **dentro** dos providers e **dentro** de cada `<Route element={...}>` layout que já tem `<Outlet />`? Não: colocar um `<Suspense>` externo em `AppRoutes` cobre todas as rotas com um único fallback centralizado.
- `useSearchParams`/`useLocation` continuam funcionando porque os wrappers (`PublicOnlyRoute`, `SubscriptionGuard`, etc.) permanecem eager — só o componente de página é lazy.
- `manualChunks` como função (não objeto) evita listar cada pacote Radix individualmente.
- Não mexer em `src/integrations/supabase/client.ts` (auto-gen). Vendor chunk agrupa via `node_modules` no `manualChunks`.

## Fora de escopo
- Não substituir libs (recharts/pdfjs) — só mover para chunks separados.
- Não mexer em PWA/Workbox cache.
- Não refatorar componentes de página além do necessário para lazy default export.
