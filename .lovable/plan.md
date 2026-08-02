## Situação atual

Na conciliação (`/conciliacao`), cada lançamento importado tem apenas dois seletores: **Conta** e **Categoria**. Ao confirmar, o sistema cria sempre uma entrada (valor positivo) ou uma saída (valor negativo). Não há como dizer "isso é uma transferência entre minhas contas", então hoje o usuário acaba criando uma receita e uma despesa fictícias — o que infla o resultado no DRE e nos relatórios.

## O que será entregue

1. **Novo seletor "Tipo" em cada linha**: `Entrada/Saída (automático)` ou `Transferência entre contas`.
2. Ao escolher **Transferência**, o campo Categoria é substituído por **"Conta de destino"** (se o valor for negativo/saída) ou **"Conta de origem"** (se positivo/entrada), listando as demais contas da empresa.
3. Ao confirmar, o lançamento é criado como `transferencia`, com conta de origem e destino preenchidas — impacto líquido zero no consolidado e fora do DRE, mas com saldo de cada conta atualizado corretamente.
4. **Anti-duplicidade da perna espelho**: se a outra ponta da transferência também vier do Open Finance (mesma data, valor oposto, conta indicada), ela é marcada automaticamente como duplicada/ignorada na conciliação, com aviso na tela, evitando lançar a transferência duas vezes.
5. **Ação em lote**: com vários lançamentos selecionados que compartilham a mesma conta, será possível confirmar todos como transferência para uma conta destino única (mesmo padrão da barra de ações em lote existente).
6. Badge **"Transferência"** nas linhas já confirmadas dessa forma.

## Detalhes técnicos

- Nova RPC `pluggy_confirm_staging_transfer(p_staging_ids uuid[], p_account_id uuid, p_counterpart_account_id uuid)`, `SECURITY DEFINER`, espelhando as checagens de autorização da `pluggy_confirm_staging` (empresa da conta + `company_members`), validando que ambas as contas pertencem à mesma empresa e são diferentes.
- A RPC insere uma única transação `transaction_type = 'transferencia'` com `account_id` = conta de origem e `destination_account_id` = conta de destino (invertendo conforme o sinal do valor), `status = 'confirmado'`, e atualiza o staging para `confirmed` com `matched_transaction_id`.
- Dentro da mesma RPC, busca na `pluggy_staging_transactions` a perna espelho pendente (conta Pluggy vinculada à contraparte, mesma data ±3 dias, valor oposto) e a marca como `duplicate` apontando para a mesma transação.
- `recompute_account_balance` é disparado para as duas contas afetadas (motor de saldo permanece a única fonte do saldo — nada de escrita direta em `current_balance`).
- Frontend: `src/pages/ConciliacaoPluggy.tsx` ganha o estado `rowKind`/`rowCounterpart` por linha e roteia a confirmação para a RPC nova quando o tipo é transferência; a barra de ações em lote recebe o mesmo modo. Nenhuma alteração nas funções de saldo/relatório existentes.
- Regeneração dos tipos do cliente para a nova RPC.
