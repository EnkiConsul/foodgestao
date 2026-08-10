# Cardápio online — direção "Gourmet boutique"

Refinar apenas a página pública `/c/:slug` (LojaOnline) para a direção escolhida, mantendo toda a lógica de pedido, status da loja, horários, entrega e carrinho.

## Direção travada

- Paleta: fundo quente `#FAF7F2`, superfícies brancas, terracota `#C4654A` / `#E8A87C`, sálvia `#87A878` / verde `#4A6741`, textos em pedra escura.
- Tipografia: Outfit nos títulos, Figtree no corpo.
- Layout: hero + grade, cartão de identidade da loja em destaque.

A cor primária extraída da logo da loja continua tendo prioridade sobre o terracota quando existir, para não quebrar a identidade de cada cliente.

## O que muda visualmente

1. **Capa e cartão da loja**
   - Capa mais alta com máscara em degradê que se dissolve no fundo quente (sem faixa preta dura).
   - Cartão da loja com cantos 2rem, sombra suave e logo em moldura branca de 96px.
   - Nome em Outfit bold + indicador de status (ponto luminoso verde quando aberto) e badge "Aberto agora" à direita.

2. **Selos de informação**
   - Grade 2×2 no mobile e 4 colunas no desktop, cada selo centralizado em bloco arredondado claro, rótulo em maiúsculas espaçadas e valor em negrito.
   - Corrigir o selo de pagamento que hoje aparece como vírgula solta quando não há formas configuradas (mostrar "A combinar").

3. **Ações**
   - "Pedir no WhatsApp" como botão sólido verde sálvia com ícone, "Acompanhar pedido" como botão secundário discreto.

4. **Busca + categorias**
   - Bloco sticky único (busca acima, chips de categoria abaixo) com fundo translúcido e blur.
   - Chips arredondados: ativo em terracota sólido, inativos brancos com borda; scroll-spy mantido.

5. **Destaques e produtos**
   - Título de seção com régua fina ao lado.
   - Cards de produto: cantos 1.5rem, foto 128px arredondada com leve zoom no hover, preço em terracota, botão "Adicionar" com rótulo em maiúsculas (ícone `+` só no mobile).
   - Estado vazio e "a partir de" preservados.

6. **Horários**
   - Bloco escuro arredondado com ícone de relógio em marca d'água e linhas divididas por hairline, no lugar da tabela clara atual.

7. **Barra de carrinho**
   - Barra flutuante centralizada (largura máxima, cantos arredondados, sombra colorida), com contador, total e seta; mantém o indicador de progresso até o pedido mínimo.

## Detalhes técnicos

- Alterações concentradas em `src/pages/storefront/LojaOnline.tsx`.
- Tema: estender os tokens `--sf-*` em `src/lib/orders/storefront.ts` com os valores da direção escolhida (bg, surface, border, muted, primary, accent, sage) e usar variáveis em vez de hex solto no JSX.
- Fontes Outfit + Figtree carregadas apenas no escopo do storefront (link no `<head>` via efeito da página pública ou `index.html`), sem afetar o app interno.
- Mobile-first: hero 160px, selos 2 colunas, botão + compacto; sem mudanças em RPCs, carrinho, checkout ou dados.
