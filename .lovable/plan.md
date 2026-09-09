# Adiantamento não deve ser cobrado no mês da admissão depois do pagamento

## Causa confirmada

- Karen foi admitida em **29/07/2026**, marcada como optante de adiantamento, na unidade Pakerê Garavelo, cujo **dia do adiantamento é 15**.
- A regra de elegibilidade (`src/lib/dp/pendencias-documentos.ts`) já trata o caso de **desligamento** — quem sai antes do dia do pagamento não deve adiantamento naquele mês — mas **não existe nenhuma regra equivalente para admissão**. Por isso ela entrou como pendente em 07/2026: só se verifica se estava ativa em algum dia do mês.

## Correção

No cálculo de elegibilidade do adiantamento, passar a considerar a data de admissão:

- Admitido dentro da competência **depois do dia do pagamento** do adiantamento da unidade → não é cobrado adiantamento naquele mês (primeira competência com adiantamento passa a ser a seguinte).
- Admitido no dia do pagamento ou antes → segue sendo cobrado normalmente.
- Sem dia de adiantamento configurado na unidade, nada muda.

Isso vale igualmente para as três telas que usam a mesma fonte: pendências da tela inicial, lista de pendências do cadastro e Conferência de Documentos na importação.

Contracheque e folha de ponto do mês da admissão continuam sendo cobrados (o salário proporcional e o ponto do período existem).

## Carência de 30 dias no pedido feito pelo colaborador

Para evitar pedidos e cancelamentos em sequência, o pedido feito **pelo portal do colaborador** passa a valer somente na competência compatível com a data de hoje + 30 dias:

- O sistema soma 30 dias à data do pedido e, sobre essa data, aplica a regra do dia de pagamento: se ela cair antes do dia do adiantamento, vale naquela competência; se cair no dia ou depois, vale na competência seguinte.
- A tela mostra claramente a competência em que o pedido passa a valer, antes de confirmar.
- Isso vale tanto para ativar quanto para cancelar pelo portal.
- Pedidos registrados **pelo gestor** continuam sem carência, inclusive com data retroativa.

## Detalhes técnicos

- `src/lib/dp/pendencias-documentos.ts`: no ramo `tipo === "adiantamento"` de `elegivelDocumento`, adicionar a checagem de `data_admissao` na competência contra `opts.diaAdiantamento` (espelhando a regra atual de `data_desligamento`).
- `src/components/dp/documentos/DocConsistenciaPanel.tsx`: garantir que o `diaAdiantamento` da unidade é repassado no check mensal (hoje o painel monta os checks localmente).
- `src/test/unit/*`: casos de teste para admissão antes, no dia e depois do dia do pagamento, e regressão do caso de desligamento.
- Sem mudanças de banco de dados.
