# Banner da loja sem corte

## O problema

Hoje a capa da página `/c/:slug` tem altura fixa (192px no mobile, 256px no desktop) e a imagem é exibida com recorte central (`object-cover`). Banners largos com texto — como "UMA SÓ ESCOLHA. MUITO SABOR. Pizza de Calabresa" — ficam cortados nas laterais e embaixo, e o cartão de identidade da loja sobe 80px sobre a imagem, escondendo mais um pedaço.

## O que muda

1. **Capa por proporção, não por altura fixa**: o banner passa a respeitar a proporção da arte (16:6 no desktop, 16:9 no mobile), com um limite máximo de altura para não empurrar o cardápio para baixo.
2. **Nada de recorte agressivo**: quando a imagem enviada não bate com a proporção do espaço, ela é exibida inteira e o fundo restante é preenchido com uma versão desfocada/ampliada da própria arte, mantendo o visual cheio sem cortar texto.
3. **Menos sobreposição**: o cartão de identidade sobe menos sobre a capa (e nada no mobile), preservando a parte de baixo do banner.
4. **Degradê mais suave**: o gradiente de dissolve começa mais abaixo, para não apagar o texto da arte.
5. **Orientação no editor**: na etapa do cardápio online (upload da capa), incluir a recomendação de tamanho ideal — 1600 × 600 px (proporção 16:6), mínimo 1200 × 450 px — e um aviso de que textos devem ficar na área central.

## Detalhes técnicos

- `src/pages/storefront/LojaOnline.tsx`: trocar `h-48 sm:h-64` por container com `aspect-[16/9] sm:aspect-[16/6] max-h-[420px]`; camada de fundo `object-cover blur-xl scale-110` + camada principal `object-contain`; ajustar `-mt-20` para `mt-0 sm:-mt-12` e afinar as paradas do gradiente.
- `src/components/orders/onboarding/StepCardapioOnline.tsx` (ou o componente que faz upload da capa): texto de ajuda com a proporção recomendada.
- Sem alterações de dados, RPCs ou storage; nenhuma LP existente perde configuração — apenas a renderização da capa melhora.
