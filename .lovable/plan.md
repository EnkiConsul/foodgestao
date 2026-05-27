
## Objetivo

Transformar a home `/` (Landing.tsx) numa LP otimizada para campanhas pagas (Meta/Google) com foco em iniciar trial de 14 dias sem cartão. Manter identidade azul atual (#2D6EB5, tokens existentes) e SEO da rota raiz.

## Estrutura da nova LP (ordem dos blocos)

1. **Header sticky enxuto** — logo + 1 CTA "Testar 14 dias grátis". Sem menu de âncoras (reduz fuga em tráfego pago). Versão mobile colapsa para só o CTA.

2. **Hero (acima da dobra)**
   - H1 forte: "Controle financeiro pessoal e da sua empresa, sem planilha."
   - Subtítulo: 1 linha cobrindo MEI, PJ e PF.
   - Bullets curtos com check (3): "Sem cartão", "Cancelamento em 1 clique", "Dados protegidos (LGPD)".
   - CTA primário "Começar teste grátis" + CTA secundário "Ver demonstração" (scroll para mockup).
   - Selos: "+X usuários", "Nota 4.9", "Multiempresa" (placeholders editáveis).
   - À direita: mockup já existente `HeroMockup` — reaproveitar.

3. **Faixa de logos/segmentos** — chips com "MEI", "Autônomos", "Pequenas empresas", "Famílias", "Casais" (sem logos falsos).

4. **Bloco "Planilha vs Gestor Plin"** — tabela comparativa em 2 colunas (Excel/Sheets ❌ vs Gestor Plin ✅) com 6-7 linhas: atualização manual, erro de fórmula, fluxo de caixa projetado, alertas de vencimento, multiusuário, acesso mobile, LGPD/backup. CTA inline.

5. **Para quem é** — 3 cards (MEI, Empresa, Pessoal) com 3 bullets cada e CTA "Testar grátis com meu perfil" que leva a `/auth?tab=signup&persona=mei|pj|pf` (parâmetro só para pré-seleção futura).

6. **Recursos principais** — reusar grid `features` existente (6 itens), enxugando para os 4 de maior apelo em ads: contas a pagar/receber, dashboard, fluxo projetado, multiusuário.

7. **Como funciona em 3 passos** — reaproveitar `steps`.

8. **Garantia + risco zero** — faixa destacada: "14 dias grátis · sem cartão · cancele quando quiser".

9. **Planos resumidos** — manter fetch de `plans` do Supabase, mas mostrar apenas plano destaque + link "ver todos os planos" para `/planos` (ou âncora). Reduz fricção.

10. **FAQ curto** — reusar `faqs` (4 itens).

11. **CTA final full-width** — repete oferta + botão grande.

12. **Footer minimalista** — links institucionais + termos/privacidade.

## Itens técnicos

- **Arquivo**: editar `src/pages/Landing.tsx` (substitui a atual; rota `/` continua igual em `App.tsx`).
- **SEO/Head**: adicionar `react-helmet-async` no `main.tsx` (HelmetProvider) e `<Helmet>` na Landing com `<title>` (<60ch), `description` (<160ch), canonical `https://gestorplin.com/`, og:title/description/url/type, JSON-LD `SoftwareApplication` + `Organization`. Atualizar `index.html` para remover canonical duplicado.
- **Tracking para patrocinado**:
  - Suporte a UTM: ler `utm_source/medium/campaign/term/content` da URL e propagar nos CTAs para `/auth?tab=signup` (querystring preservada) para attribution pós-cadastro.
  - Placeholders comentados para Meta Pixel e Google Ads/Analytics em `index.html` (apenas estrutura, sem IDs — usuário cola depois). Pixel `<noscript>` no `<body>`, não no `<head>`.
  - Evento de conversão sugerido: disparar `dataLayer.push({event:'cta_click_trial'})` nos botões de CTA principal (sem dependência externa).
- **Performance**: lazy-load das seções abaixo da dobra via `loading="lazy"` em imagens (se houver) e divisão do componente em subcomponentes locais. Sem libs novas.
- **Identidade**: usar tokens semânticos (`bg-primary`, `text-primary`, `bg-success/10` etc.) — sem cores hardcoded.
- **Responsivo**: foco em 360-414px (maior parte do tráfego de ads vem de mobile); revisar hero, comparativo e cards.

## Fora de escopo

- Geração de novas imagens/vídeo do produto (uso do `HeroMockup` em SVG/HTML já existente).
- Integração real com Pixel/GA (apenas estrutura/placeholder — IDs entram depois).
- Criação de página `/planos` separada (link já levará para âncora `#planos` se ainda existir; senão fica para próxima iteração).
- Backend, RLS, migrations — nenhum.

## Critério de pronto

- `/` renderiza nova LP, mobile e desktop ok.
- CTAs preservam UTMs ao navegar para `/auth?tab=signup`.
- Lighthouse SEO ≥ 95 na home (title/description/canonical/JSON-LD presentes).
- Comparativo "Planilha vs Gestor Plin" visível e legível no mobile 360px.
