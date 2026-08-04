# Sugerir contas com IA — tornar o processo progressivo e cancelável

## O que está acontecendo

A função de sugestão está funcionando: no teste que rodei agora ela devolveu sugestões válidas, e os logs do gateway mostram que a sua última execução fez as 5 chamadas de IA com sucesso (17:27:20 a 17:27:49, todas status 200).

O problema é de experiência: o botão pede 40 categorias de uma vez, e o servidor processa em blocos de 8 **em sequência dentro de uma única requisição**. São 5 chamadas de IA de ~7s cada, ou seja ~40 segundos com a tela apenas "carregando", sem nenhum retorno parcial e sem forma de cancelar — o que dá a impressão de travado.

## O que vou fazer

1. **Processar por página, com retorno parcial**
   - O diálogo passa a chamar a função em lotes pequenos (8 categorias por chamada), em sequência.
   - Cada lote que volta é adicionado imediatamente à lista, então as primeiras sugestões aparecem em poucos segundos.

2. **Barra de progresso e botão Cancelar**
   - Indicador "analisando 16 de 40…" durante a execução.
   - Botão **Cancelar** interrompe as próximas chamadas e mantém o que já foi sugerido (nada é perdido).

3. **Escolha do volume**
   - Seletor de quantidade a analisar (8 / 24 / 40), com 24 como padrão, para runs mais curtas.

4. **Erros claros por lote**
   - Se um lote falhar (limite de uso, crédito, erro de IA), a mensagem aparece com a opção de "tentar novamente este lote", sem perder os lotes anteriores.

## Detalhes técnicos

- `supabase/functions/suggest-chart-account/index.ts`: aceita `offset` (ou lista de `codes`) para paginar as categorias sem vínculo, e mantém `limit` pequeno; nenhuma mudança na lógica de elegibilidade/pontuação nem no modelo (`openai/gpt-5.6-sol`).
- `src/components/admin/SuggestChartAccountsDialog.tsx`: loop de páginas com `AbortController`, estado de progresso, acumulação de sugestões e tratamento de erro por página. Aplicação em lote e histórico/desfazer continuam iguais.
