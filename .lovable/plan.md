# Cards de documento no celular: distribuição e botão verde

Ajuste só visual na lista de documentos (Histórico Completo).

## O que muda

1. **Documento sem comprovante de pagamento** (Espelho de Ponto, por exemplo): a primeira linha tem apenas Ver e Baixar e hoje eles ficam encostados à esquerda. Passam a ficar centralizados e com a mesma largura, igual à linha de Excluir e Substituir. Quando existem três botões (Ver, Comprovante, Baixar), a distribuição continua como está.
2. **Botão que ficou verde**: no celular, depois de tocar em "Comprovante" o botão fica com o realce verde preso, porque o destaque de passar o mouse não existe em tela de toque mas continua aplicado. Passa a valer apenas em aparelhos com mouse, então o botão volta ao normal assim que a ação termina.

## Detalhes técnicos

- `src/pages/dp/DpHistoricoCompleto.tsx` (bloco mobile do card): trocar a primeira linha de `grid grid-cols-3` para `flex items-center justify-center gap-1`, com cada botão em `flex-1` e `max-w` compatível (limite maior quando há três botões), mantendo a segunda linha como está.
- `tailwind.config.ts`: habilitar `future: { hoverOnlyWhenSupported: true }`, para que as variantes `hover:` (inclusive `hover:bg-accent` do botão ghost) só se apliquem sob `@media (hover: hover)`. Corrige o realce preso em toda a interface mobile sem alterar o comportamento no desktop.
- Nada de mudança em regras de negócio, banco, permissões ou no portal do colaborador.
