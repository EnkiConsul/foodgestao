## Painel de Indexação — Search Console

Criar uma tela no Backoffice (super admin) que consulta a API do Google Search Console e mostra o status de indexação e último recrawl das URLs principais.

### URLs monitoradas
- `https://gestorplin.com/`
- `https://gestorplin.com/guias/das-mei`
- (obs.: `/landing` não existe como rota; a landing é `/`. Não será incluída.)

### UX
- Nova página `src/pages/admin/SeoIndexacao.tsx`, rota `/admin/seo-indexacao`, protegida por `SuperAdminRoute`.
- Link "Indexação SEO" (ícone `Search`) na sidebar do Backoffice.
- Tabela com colunas: URL, Status de Cobertura, Verdict, Último Crawl, Robots, Canonical Google vs Declarado, Ações.
- Badge colorido por verdict (`PASS`, `PARTIAL`, `FAIL`, `NEUTRAL`).
- Botão "Atualizar" por linha + "Atualizar todas".
- Indicador `FreshnessIndicator` reaproveitado para mostrar quando a consulta foi feita.

### Backend
- Edge Function `inspect-search-console` (verify_jwt validado em código, restrita a super_admin):
  - Recebe `{ urls: string[] }`.
  - Para cada URL, faz `POST` ao gateway:
    `https://connector-gateway.lovable.dev/google_search_console/v1/urlInspection/index:inspect`
    com `Authorization: Bearer LOVABLE_API_KEY` e `X-Connection-Api-Key: GOOGLE_SEARCH_CONSOLE_API_KEY`.
  - Body: `{ inspectionUrl, siteUrl: "https://gestorplin.com/" }`.
  - Retorna o `inspectionResult.indexStatusResult` resumido (coverageState, verdict, lastCrawlTime, robotsTxtState, indexingState, googleCanonical, userCanonical) por URL.
  - Erros do Google são propagados com status apropriado.

### Frontend
- Hook `useSeoInspection` (React Query) chamando a Edge Function via `supabase.functions.invoke`.
- Formatação de `lastCrawlTime` em PT-BR + relativa ("há 3 dias").
- Link "Abrir no Search Console" por URL.

### Arquivos
- `supabase/functions/inspect-search-console/index.ts` (novo)
- `src/pages/admin/SeoIndexacao.tsx` (novo)
- `src/hooks/useSeoInspection.tsx` (novo)
- `src/App.tsx` — registrar rota
- `src/components/layout/AppSidebar.tsx` — link no menu admin

### Pré-requisitos
- Connector `google_search_console` já está vinculado ao projeto (confirmado em iteração anterior).
- `LOVABLE_API_KEY` e `GOOGLE_SEARCH_CONSOLE_API_KEY` disponíveis na Edge Function.
