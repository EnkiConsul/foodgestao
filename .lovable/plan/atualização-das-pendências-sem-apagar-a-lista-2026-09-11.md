# Atualização das pendências sem apagar a lista

## Objetivo
Manter as pendências já exibidas na tela de início durante qualquer atualização, evitando que o quadro fique vazio ou mostre novamente o carregamento completo.

## Alterações
- Preservar uma cópia da última lista carregada com sucesso no quadro de **Pendências do Sistema**.
- Durante atualização manual ou provocada pela conclusão de uma ação, continuar exibindo essa lista, seus totais e agrupamentos sem alteração visual temporária.
- Mostrar somente a seta de atualização girando enquanto a nova apuração estiver em andamento.
- Trocar a lista antiga pela nova de uma só vez quando a atualização terminar com sucesso.
- Se a atualização falhar, manter a lista anterior visível e conservar o tratamento de erro existente.
- Exibir “Carregando” somente no primeiro acesso, quando ainda não existir nenhuma lista anterior disponível.

## Validação
- Testar o primeiro carregamento sem dados em memória.
- Testar o botão **Atualizar** com pendências já visíveis e confirmar que elas não desaparecem.
- Testar uma atualização disparada após concluir uma pendência.
- Confirmar que totais, grupos e horário da última atualização só mudam quando o novo resultado estiver pronto.

## Detalhes técnicos
Ajustar o estado de apresentação de `PendenciasCard` para separar a lista confirmada da consulta em andamento. O indicador continuará usando `isFetching`, enquanto a área de conteúdo usará o último resultado confirmado até o término da nova consulta. Adicionar teste direcionado para evitar regressão desse comportamento.
