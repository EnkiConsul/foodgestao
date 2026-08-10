# Corrigir a ficha do produto no cardápio online

Ao clicar no produto, a ficha abre mas fica ilegível/quebrada: fundo transparente, texto escuro sobre a foto, foto gigante e as opções (variações, complementos, quantidade, botão Adicionar) ficam sobrepostas ao conteúdo da página.

## Causa

As cores e fontes da loja (`--sf-*`) são aplicadas apenas na `<div>` raiz da página do cardápio. As fichas (produto, checkout, acompanhar pedido) são renderizadas em um portal no `body`, fora dessa div — então todas as variáveis ficam sem valor: fundo/superfície viram transparente, texto perde cor e a fonte volta ao padrão. Além disso, no desktop a ficha ocupa a largura inteira da tela, o que espalha a foto e os controles.

## Correção

1. Aplicar o tema da loja dentro das próprias fichas: passar o tema (`theme` + `primary_color`) para a ficha do produto, para a ficha de checkout e para o diálogo de acompanhamento, e aplicar as variáveis no elemento de conteúdo de cada uma.
2. Limitar a largura da ficha em telas grandes (centralizada, largura máxima confortável) mantendo o comportamento de "sobe de baixo" no celular.
3. Ajustar a foto do produto na ficha para altura controlada por proporção, sem estourar o topo, e garantir que o conteúdo role com a barra inferior (quantidade + Adicionar) sempre visível e legível.
4. Revisar contraste dos textos e da barra inferior com as cores do tema aplicadas.

## Detalhes técnicos

- `src/pages/storefront/LojaOnline.tsx`: repassar `store.store.theme` e `store.store.primary_color` para `StorefrontProductSheet`, `StorefrontCheckoutSheet` e `StorefrontTrackDialog`.
- `src/components/storefront/StorefrontProductSheet.tsx`, `StorefrontCheckoutSheet.tsx`, `StorefrontTrackDialog.tsx`: aceitar essas props e espalhar `themeStyle(theme, primary)` no `style` do `SheetContent`/`DialogContent`, junto do fundo/cor já usados.
- Classe do `SheetContent` do produto: adicionar largura máxima centralizada em `sm+` e `aspect-[16/9]`/altura máxima para a imagem, mantendo `overflow-y-auto` e a barra `sticky bottom-0`.
- Sem mudanças de banco, RPC ou regras de preço.
