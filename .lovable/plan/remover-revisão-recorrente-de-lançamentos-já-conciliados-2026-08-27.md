# Remover revisão recorrente de lançamentos já conciliados

## Motivo confirmado

A sincronização do Open Finance compara novamente descrição, valor e data de cada item já conciliado. Quando o banco reenvia a descrição original ou uma nova versão do mesmo item, `pluggy-sync-item` chama `pluggy_register_origin_change`, cria uma pendência em `transaction_origin_changes` e o banner aparece na Conciliação e no Extrato. Por isso os mesmos lançamentos voltam a pedir revisão.

## Comportamento desejado

Depois que um lançamento for conciliado, os dados salvos no 360°FOOD serão definitivos. Sincronizações posteriores poderão atualizar dados ainda pendentes, mas não alterarão nem solicitarão revisão de lançamentos já conciliados.

## Alterações

1. **Parar de gerar revisões**
   - Remover de `pluggy-sync-item` o registro de alteração para itens com status `confirmed`.
   - Continuar deduplicando versões reenviadas pelo banco, sem recolocá-las na fila de conciliação e sem alterar o lançamento confirmado.
   - Preservar a proteção existente que impede atualização silenciosa de valor, data e conta em lançamentos confirmados.

2. **Remover a função das telas**
   - Retirar o banner e o carregamento de revisões de `ConciliacaoPluggy.tsx` e `ExtratoConciliacao.tsx`.
   - Remover o componente e hook exclusivos dessa funcionalidade.

3. **Encerrar as 77 revisões atuais**
   - Criar migração que marque todas as revisões pendentes como encerradas mantendo a versão atual do lançamento.
   - Limpar somente `needs_review/review_reason = alterado_na_origem`; outros motivos de revisão, como item removido no banco, permanecem intactos.
   - Desativar as RPCs de criação e resolução desse fluxo, mantendo os registros históricos para auditoria.

4. **Validar**
   - Cobrir com teste que alteração de descrição, valor ou data reenviada pelo banco não cria revisão nem modifica lançamento conciliado.
   - Confirmar que itens pendentes ainda podem ser atualizados normalmente e que versões repetidas continuam deduplicadas.
   - Executar os testes direcionados e a verificação de tipos.

## Resultado

A faixa “Revisar lançamentos com versão diferente no banco” deixa de existir, as pendências atuais somem e lançamentos conciliados permanecem exatamente como foram confirmados pelo usuário.
