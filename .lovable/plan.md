# Ajustes de responsividade da Landing Page

Refinar o `src/pages/Landing.tsx` para que a LP fique bem apresentada em telas pequenas (≤ 414px), médias (tablet) e desktop, mantendo o mesmo design system azul. Nenhuma alteração de funcionalidade ou conteúdo — só tipografia, espaçamentos, grids e elementos visuais responsivos.

## Pontos a corrigir

1. **Header público**
   - Em mobile o botão "Iniciar teste grátis" some (fica só o menu hamburguer). Manter o CTA visível mesmo no mobile como botão compacto ("Testar grátis") e deixar "Entrar" só no menu mobile.
   - Reduzir altura do header em mobile (`h-14`) e padding do container.

2. **Hero**
   - Reduzir tamanho do H1 em telas muito pequenas (`text-3xl` no mobile, escalando para `text-6xl` no desktop) e ajustar `leading` para evitar quebras feias.
   - Subtítulo menor no mobile (`text-base`).
   - Botões de CTA em coluna full-width no mobile (`w-full`) e lado a lado a partir de `sm`.
   - Diminuir padding vertical da seção em mobile (`py-12` → `lg:py-28`).
   - Chips de prova ("Sem cartão de crédito" etc.) com gap menor e wrap garantido.

3. **HeroMockup**
   - Os 3 KPIs em `grid-cols-3` ficam apertados em ~360px. Em mobile usar `grid-cols-1` ou mostrar só 2 KPIs principais; voltar para 3 colunas a partir de `sm`.
   - Reduzir tamanho dos valores e padding interno no mobile.
   - Esconder a barra "fake browser" decorativa em telas muito pequenas? Não — manter mas com texto truncado.

4. **Grid de recursos**
   - Padding vertical menor no mobile (`py-14` → `lg:py-24`).
   - Manter 1 coluna no mobile (já está), gap menor.

5. **PF x PJ**
   - Corrigir bug atual: o switch tem `inline-flex w-full max-w-sm ... sm:flex` (combinação confusa). Trocar por `flex w-full max-w-sm mx-auto`.
   - O Card interno vira `grid-cols-1` no mobile e `sm:grid-cols-2` (já está, mas reduzir padding `p-6 sm:p-8`).

6. **Como funciona**
   - Cards já empilham bem; só reduzir padding vertical da seção no mobile.

7. **Planos**
   - Em mobile, 1 coluna (já está). Reduzir tamanho do preço (`text-3xl` mobile → `text-4xl` desktop).
   - Garantir que o badge "Mais popular" não sobreponha o card vizinho — adicionar `mt-3` no grid em mobile para dar espaço ao badge.

8. **FAQ**
   - Já fica 1 coluna no mobile; só reduzir padding.

9. **CTA final**
   - Padding interno do card menor no mobile (`p-6 sm:p-10 lg:p-14`).
   - Título `text-2xl sm:text-3xl lg:text-4xl`.
   - Botão `w-full sm:w-auto`.

10. **Footer**
    - Empilha bem; só reduzir gap e tamanhos no mobile.

## Princípios

- Mobile-first: começar com tamanhos compactos e escalar para cima com `sm:` / `md:` / `lg:`.
- Continuar usando exclusivamente tokens semânticos do design system.
- Nenhum novo asset, nenhuma nova dependência.
- Sem mexer em rotas, conteúdo de planos, copy ou design desktop existente.

## Arquivos

- `src/pages/Landing.tsx` — único arquivo alterado.
