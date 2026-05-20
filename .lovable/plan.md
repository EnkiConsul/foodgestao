# Landing Page de vendas — Gestor Plin

Criar uma landing page pública em `/` para vender o Gestor Plin como solução híbrida PF + PJ, com CTA principal "Iniciar teste de 14 dias". Visitantes não logados veem a LP; usuários logados continuam indo direto ao Dashboard.

## Estrutura da página (layout hero + grid)

1. **Top bar pública** — logo (TreePine + "Gestor Plin"), âncoras (Recursos, PF x PJ, Planos, FAQ) e botões "Entrar" / "Iniciar teste grátis".
2. **Hero** — título forte ("Suas finanças pessoais e da empresa em um só lugar"), subtítulo, CTA primário "Iniciar teste de 14 dias" + secundário "Ver planos", chip de prova ("Sem cartão de crédito"), mockup/ilustração do dashboard ao lado.
3. **Grid de benefícios (6 cards)** — Lançamentos unificados (contas a pagar/receber), Dashboard inteligente, Orçamentos com alertas, Fluxo de caixa projetado, Multiusuário com perfis de acesso, LGPD + modo privacidade.
4. **Comparativo PF x PJ** — duas colunas lado a lado mostrando o que cada contexto entrega na mesma conta, com seletor visual estilo o ContextSelector do app.
5. **Como funciona** — 3 passos: criar conta → onboarding em 4 etapas → começar a lançar.
6. **Planos** — puxa `plans` ativos e públicos do banco via Supabase (`is_active=true AND is_public=true`), exibe cards com nome, preço, destaque do plano popular e botão "Começar teste" que leva a `/checkout?plan=<slug>`.
7. **Comparativo PF x PJ recap / prova social** — citações curtas (placeholder honesto, sem inventar clientes reais).
8. **CTA final** — faixa com "Comece em menos de 2 minutos" e botão "Iniciar teste de 14 dias".
9. **Footer** — links institucionais, contato, redes, copyright.

## Roteamento

- `/` deixa de renderizar `Dashboard` direto. Passa a renderizar um componente `RootGate`:
  - Se `useAuth` retorna `user`, redireciona para `/dashboard` (nova rota dedicada para o dashboard logado).
  - Se não tem `user`, renderiza a nova página `Landing`.
- Adicionar rota `/dashboard` protegida apontando para o `Dashboard` atual, para manter todos os links internos funcionando (atualizar redirects internos onde for necessário — `Auth.tsx`, onboarding completion, etc., já costumam usar `/` que continuará funcionando via `RootGate`).
- Manter `/auth`, `/planos`, `/checkout`, `/onboarding`, etc., como já estão.

## Design e identidade

- Reuso total do design system (`index.css`): paleta azul `--primary` #2D6EB5, tokens `--success`, `--warning`, `--accent`, `--muted`. Nada de cores hardcoded.
- Tipografia Inter (já carregada). Headings com `font-bold tracking-tight`, body `text-muted-foreground`.
- Mockups: usar combinações de cards reais do app (KPIs, mini gráfico, lista de transações fictícias) para o hero, em vez de imagens externas, garantindo coerência visual.
- Ícones via `lucide-react` (já usado em todo o app).
- Layout responsivo (mobile-first): grid 1 coluna no mobile, 2-3 colunas no desktop.

## Arquivos

- `src/pages/Landing.tsx` — nova página completa.
- `src/components/landing/` — subcomponentes (`HeroSection`, `FeaturesGrid`, `PfPjCompare`, `HowItWorks`, `PricingSection`, `FinalCta`, `PublicHeader`, `PublicFooter`).
- `src/App.tsx` — adicionar `RootGate`, rota `/` → `Landing` para visitantes ou redirect para `/dashboard` para logados, e rota `/dashboard` protegida apontando para `Dashboard`.

## SEO

- `<title>` curto com palavra-chave: "Gestor Plin — Controle financeiro pessoal e empresarial".
- Meta description < 160 chars, H1 único no hero, alt texts nos visuais decorativos, viewport responsiva já configurado.
- Atualizar `index.html` (title + meta description + OG tags básicos).

## Fora de escopo

- Não criar formulário de captura de e-mail / newsletter.
- Não inventar logos de clientes reais.
- Não mexer no Backoffice nem em rotas administrativas.
