# Deletar a Landing Page

A rota `/` deixa de exibir o site de marketing e passa a levar direto para `/auth`. Todo o material da LP (seções, painel admin e conteúdo de marketing no banco) é removido.

## Comportamento novo da raiz

- Visitante sem sessão em `/` → redirecionado para `/auth`.
- Usuário logado continua como hoje: admin/owner vai para `/hub`, colaborador para `/dp/meu`.
- Páginas legais (`/privacidade`, `/termos`, `/cookies`, `/encarregado-dados`) continuam funcionando — elas não usam componentes da LP.
- Cardápio público (`/c/:slug`) não é afetado.

## O que será removido

Frontend:
- `src/pages/Landing.tsx` e a pasta inteira `src/components/landing/` (Hero, Pain, Segments, Solutions, Modules, Features, HowItWorks, Trust, FAQ, Contact, FinalCta, PlanMatrix, Fidelidade360, PersonasStrip, MobileCtaBar, CtaPrimary, PublicHeader, PublicFooter).
- `src/lib/landing-defaults.ts`, `src/lib/landing/planMatrix.ts`, `src/lib/landing/scroll.ts`, `src/lib/landing/utm.ts` e o hook `src/hooks/useLandingContent.tsx`.
- Painel admin: `src/pages/admin/LandingPage.tsx`, a rota `/admin/landing-page` e os itens de menu em `AdminSidebar.tsx` e `mobileNav.tsx`.
- Metadados/JSON-LD específicos da LP no `index.html` ficam com título e descrição simples do produto (sem seções de marketing).

Backend:
- Migração que apaga apenas as linhas de marketing da tabela `landing_content` (hero, nav, features, faq, footer etc.). A tabela permanece, pois `useLegalContent` a usa para os documentos legais.
- O flag `show_on_landing` do catálogo de módulos deixa de ter efeito público; o switch correspondente sai de `ModulosCatalogoCard.tsx` (permanece `show_on_hub`).

SEO:
- `public/sitemap.xml` e `public/robots.txt` ajustados para não anunciar a home de marketing.

## Detalhes técnicos

- `src/App.tsx`: `RootGate` passa a retornar `<Navigate to="/auth" replace />` no caso sem usuário; remover o import eager de `Landing` e o lazy de `AdminLandingPage`.
- Verificar após a remoção que nenhum import órfão de `@/components/landing/*`, `@/lib/landing/*` ou `useLandingContent` permanece, e rodar o typecheck.
- Os arquivos de teste e utilitários que não referenciam a LP ficam intactos.

## Observação

Esta remoção é destrutiva: perde-se o conteúdo de marketing editado no banco e todos os componentes da LP. Recriar depois exigiria refazer o trabalho.
