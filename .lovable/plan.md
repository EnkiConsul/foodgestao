# Corrigir exclusão de contas financeiras

## Diagnóstico confirmado

A exclusão usa a função segura `delete_account`:
- contas sem histórico são removidas definitivamente;
- contas com lançamentos são preservadas para auditoria e recebem `is_active = false` e `soft_deleted_at`.

O problema está na listagem de **Contas Bancárias**: ela solicita também contas inativas e não separa uma conta apenas desativada de uma conta excluída/arquivada. Após atualizar os dados, a conta arquivada volta para a lista como “Inativa” e ainda pode ser reativada.

## Implementação

1. **Ocultar contas excluídas da listagem principal**
   - Ajustar o carregamento/filtro em `ContasBancarias.tsx` para remover registros com `soft_deleted_at` preenchido.
   - Continuar exibindo contas apenas desativadas, preservando o recurso existente de ativar/desativar.

2. **Atualizar a tela imediatamente após excluir**
   - Remover otimisticamente a conta excluída da lista após o retorno bem-sucedido da função.
   - Recarregar os dados em seguida para confirmar o estado persistido sem provocar reaparecimento visual.
   - Manter as mensagens distintas: “Conta excluída” quando removida e “Conta arquivada” quando preservada por possuir histórico.

3. **Proteger ações sobre contas arquivadas**
   - Garantir que registros com `soft_deleted_at` não apareçam com botão de edição, exclusão ou chave de reativação, mesmo em respostas antigas/cache.
   - Manter o histórico financeiro intacto para lançamentos e relatórios.

4. **Validar o fluxo completo**
   - Testar exclusão de conta sem movimentações (remoção definitiva).
   - Testar exclusão de conta com movimentações (arquivamento e desaparecimento da lista).
   - Testar conta apenas desativada (continua visível e pode ser reativada).
   - Testar conta ligada ao Open Finance e confirmar que a desconexão não faz a conta reaparecer após atualização da tela.

## Escopo técnico

A correção será concentrada na tela e no estado da listagem. A função de exclusão do backend já aplica a regra correta de preservação de histórico e autorização, portanto não será alterada sem que a validação revele outro defeito.
