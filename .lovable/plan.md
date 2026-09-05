# Folga de fim de semana — textos da frequência falam em "domingo" mesmo com sábado negociado

## Problema

Na janela de regras de folgas (Pessoas > Folgas > Regras > Editar), quando os dias de descanso negociados incluem sábado + domingo, o seletor "Modelo de frequência" continua mostrando "X domingos por mês", e as opções "Todo domingo" / "Equivale a 1 domingo a cada..." também falam só de domingo. Os campos ao lado ("Folgas de fim de semana por mês") já se adaptam — só esses rótulos ficaram para trás.

## O que muda

Apenas textos na janela de regras — nada muda no cálculo nem nos dados gravados:

1. **Modelo de frequência** (geral e mulheres): quando houver mais dias de descanso além do domingo, a opção passa a ser "X folgas de fim de semana por mês"; no padrão CLT/só domingo, segue "X domingos por mês". A opção "A cada X semanas" não muda.
2. **Opção "Todo domingo"** do campo de quantidade por mês: vira "Toda semana (dia marcado)" quando houver sábado negociado.
3. **Texto de equivalência** "Equivale a 1 domingo a cada X semana(s)": passa a "Equivale a 1 folga a cada X semana(s)" quando houver sábado negociado.
4. **Resumo no card da unidade** (lista de unidades): se usar a mesma constante com menção a domingo, adaptar igualmente.

A regra de decisão reaproveita o `apenasDomingo` já calculado na janela (domingo sozinho = textos dominicais; sábado ou outros dias = textos de "folga de fim de semana").

## Detalhes técnicos

- `src/lib/dp/dsr-rules.ts`: manter `MODO_FREQUENCIA_LABEL` como está e exportar uma variante/parâmetro para o texto de fim de semana (ex.: `MODO_FREQUENCIA_LABEL_FDS` ou função `modoFrequenciaLabel(apenasDomingo)`), sem mudar o tipo `ModoFrequencia` nem valores gravados.
- `src/components/dp/folgas/FolgaRegrasFormDialog.tsx`: nos dois seletores de modelo e nos campos de quantidade por mês, escolher o rótulo conforme `apenasDomingo`; ajustar os textos auxiliares de equivalência.
- `src/pages/dp/cadastros/DpConfiguracoesJornada.tsx`: conferir o resumo da frequência no card da unidade e adaptar se citar "domingo".
- Verificar `src/lib/dp/regras-labels.ts`, que também usa a constante, e adaptar só se aparecer em tela de folgas.
- Verificação: `bunx tsgo --noEmit -p tsconfig.app.json`, `bunx vitest run src/lib/dp/__tests__/dsr-rules.test.ts src/test/unit/folgaLimites.test.ts src/test/unit/folgaJanela.test.ts`, lint nos arquivos alterados e conferência visual na janela de regras da unidade Pakerê.

## Fora do escopo

- Alterar cálculo de DSR, teto mensal ou qualquer dado gravado.
- Mexer em outras telas de folgas (calendário, portal).
