# Corrigir os gestos de arraste no celular

Dois gestos combinados não estão respondendo no aparelho:

1. Na tela Início, arrastar da esquerda para a direita não abre o Hub de módulos (a empresa tem 4 módulos ativos, então o destino correto é o Hub).
2. Nas telas de menu, arrastar de cima para baixo não volta ao menu anterior (arrastar de baixo para cima já avança corretamente).

## Causa provável

Os dois gestos que falham são justamente os que competem com gestos nativos do navegador:
o arraste para baixo no topo da página aciona o "atualizar página" do próprio navegador, e o
arraste a partir da borda esquerda aciona o "voltar" nativo. Quando o navegador assume o gesto,
ele encerra o toque com um evento de cancelamento — e o app só escuta o fim normal do toque,
por isso a navegação nunca acontece. O arraste para cima não sofre disso, e é o único que funciona.
Isso explica o comportamento relatado, mas ainda não foi confirmado no aparelho.

## O que será feito

1. Impedir que o navegador roube esses arrastes dentro do módulo: bloquear o "atualizar" nativo
   e o "voltar" nativo por arraste na área do aplicativo.
2. Passar a decidir o gesto durante o movimento do dedo (e não só ao soltar), e também tratar
   o toque cancelado — assim o gesto vale mesmo se o navegador interromper.
3. Tornar a troca de telas mais rápida: a navegação dispara no instante em que o arraste cruza a
   distância mínima, sem esperar o dedo sair da tela, e a distância mínima é reduzida levemente
   (com a janela de tempo ampliada), para que arrastes curtos e naturais já respondam de imediato.
4. Confirmar que a faixa de borda usada no arraste da esquerda cobre a área real de toque e que
   listas com rolagem lateral no Início não estão engolindo o gesto.
5. Validar no navegador em tamanho de celular: Início → Hub (esquerda→direita), Início → Cadastro
   (baixo→cima), Cadastro → Início e Rotina → Documentos (cima→baixo), além de manter o
   "atualizar" por arraste no Início e nas telas de uso e o menu Mais na borda direita.

## Detalhes técnicos

- `src/index.css` / `DpShell`: `overscroll-behavior-y: contain` e `overscroll-behavior-x: contain`
  no contêiner do shell, com `touch-action` preservado para rolagem normal.
- `src/components/dp/nav/useMenuSwipeVertical.ts`: acompanhar `touchmove` para registrar direção e
  deslocamento máximo, disparar no primeiro momento em que o limiar é vencido, escutar também
  `touchcancel`; `MIN_DELTA_Y` 80 → 56 e `MAX_DURATION_MS` 600 → 800.
- `src/hooks/useEdgeGestures.ts`: mesmo tratamento (`touchmove` + `touchcancel`) para os arrastes
  de borda; manter `destinoGestoEsquerda` inalterado (regra Hub × Analytics já está correta).
- Sem mudanças em `menuSwipe.ts`/`edgeGestureTargets.ts`; os testes existentes continuam válidos.
