# Corrigir a simulação mensal de VA e VT

## Objetivo

Fazer a aba **Por colaborador** e as calculadoras de **VA/VT** apresentarem o mesmo valor correto, considerando o ciclo de pagamento e a realidade de cada colaborador.

## Regras do cálculo

1. **Próximo período a pagar**
   - Usar a escala publicada quando existir; caso contrário, usar a jornada vigente.
   - Retirar as folgas dominicais e extras registradas no calendário, inclusive as agendadas.
   - Retirar dias de férias que coincidam com o período coberto pelo depósito.

2. **Diferença do período anterior**
   - Comparar os dias que foram pagos com as ocorrências até a data de corte.
   - Descontar falta, folga extra, atestado/licença e férias conforme as regras de VA ou VT configuradas pela empresa/colaborador.
   - Não classificar ausência como falta quando o colaborador não utiliza controle de ponto.

3. **Intermitentes**
   - Não usar jornada semanal nem fallback de 22 dias.
   - Considerar somente as datas distintas de convocações aceitas dentro do período coberto pelo depósito.
   - No período anterior, comparar as convocações aceitas com ponto, folgas e férias para apurar diferenças.
   - Sem convocação aceita, mostrar **0 dias — aguardando convocações**, sem inventar uma base provisória.

## Unificação das telas

- Tornar o motor já usado nas calculadoras a fonte única para VA e VT.
- Fazer a aba **Por colaborador** consumir o mesmo resultado: dias previstos, ajustes do período anterior, dias finais e valor a depositar.
- Exibir um resumo legível por colaborador, por exemplo:
  - `25 previstos − 1 folga dominical − 1 diferença anterior = 23 dias`;
  - `8 dias convocados` para intermitentes;
  - avisos de jornada ausente ou convocação pendente quando aplicável.
- Recalcular os KPIs de custo bruto/líquido com o valor efetivamente projetado.

## Detalhes técnicos

- Ajustar `useDpValeCalculadora.tsx` para carregar `regime` e convocações aceitas nas janelas de cobertura e conferência.
- Resolver configurações de trabalho pela vigência aplicável a cada data, evitando escolher uma configuração antiga por ordem incidental.
- Ampliar o domínio em `va-calculo.ts` para:
  - aceitar datas previstas explícitas (escala ou convocação);
  - retirar férias também do período futuro;
  - devolver um detalhamento único de folgas, férias e diferenças anteriores.
- Substituir o cálculo simplificado de `useDpBeneficiosCadastro.tsx` pelo resultado do motor unificado, preservando quantidade fixa quando expressamente configurada.
- Atualizar `DpBeneficios.tsx` e `ValeCalculadora.tsx` apenas para apresentar o novo detalhamento, mantendo o layout responsivo atual.
- Não há necessidade de alteração no banco de dados.

## Validação

Adicionar testes para:
- jornada 6x1 com domingo fora da jornada;
- folga dominical rotativa e folga extra no calendário;
- férias no próximo período e no período anterior;
- diferença de dias pagos no período anterior;
- intermitente com convocações aceitas, duplicadas no mesmo dia e sem convocações;
- paridade do resultado entre **Por colaborador**, **Calculadora de VA** e **Calculadora de VT**.
