## Diagnóstico confirmado

A liberação feita pelo Calendário está gravando a data como `liberada: true`, mas a tela **Datas Bloqueadas** não reflete isso porque há duas divergências no fluxo atual:

1. **Cache/query key diferente**
   - Calendário Geral invalida `dp_datas_bloqueadas_geral` e `dp_datas_bloqueadas`.
   - Datas Bloqueadas lê `dp_datas_bloqueadas_admin`.
   - Resultado: ao liberar no calendário, a lista de Datas Bloqueadas pode continuar com dados antigos até recarregar/refetch específico.

2. **Escopo de unidade diferente**
   - No Calendário, se o filtro estiver em uma unidade específica, o override é salvo com `unidade_id` daquela unidade.
   - Em Datas Bloqueadas, a mesclagem de regras automáticas só procura override global com chave `data|`.
   - Resultado: uma liberação por unidade pode não ser aplicada visualmente à linha automática global da lista.

## Plano de correção

1. **Unificar invalidação de cache após liberar data no Calendário Geral**
   - Em `src/pages/dp/DpFolgas.tsx`, após `liberarData`, invalidar também:
     - `dp_datas_bloqueadas_admin`
     - `dp_bloqueio_regras`
   - Assim, ao abrir/voltar para Datas Bloqueadas, a lista já busca o estado atualizado.

2. **Unificar invalidação no Calendário Admin**
   - Em `src/pages/dp/DpAdminCalendario.tsx`, após `liberarData`, invalidar também:
     - `dp_datas_bloqueadas_admin`
     - `dp_datas_bloqueadas_geral`
   - Mantém os três pontos do módulo DP sincronizados.

3. **Corrigir a leitura de overrides em Datas Bloqueadas**
   - Em `src/pages/dp/DpBloqueios.tsx`, ajustar `datasFiltradas` para reconhecer override liberado tanto:
     - global: `data + unidade_id null`
     - por unidade: `data + unidade_id da unidade selecionada`
   - Quando o filtro estiver em **Todas**, preservar a visualização correta sem misturar indevidamente escopos.

4. **Preservar comportamento esperado dos botões**
   - Data automática liberada deve aparecer como liberada e exibir **Bloquear Novamente**.
   - Data automática não liberada deve exibir **Liberar Data**.
   - Bloqueio manual continua com editar/excluir.

## Resultado esperado

Ao liberar uma data bloqueada diretamente no Calendário, a tela **Datas Bloqueadas** passa a mostrar o status atualizado sem inconsistência de cache e respeitando o escopo correto da unidade/global.