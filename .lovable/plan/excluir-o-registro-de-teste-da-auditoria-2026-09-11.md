# Excluir o registro de teste da auditoria

## Confirmado

Esse registro não representa uma falha real do sistema. Ele foi criado por uma validação automatizada no navegador, sem usuário autenticado. O sistema não contém essa mensagem nas telas em uso; ela aparece apenas no teste da formatação dos detalhes.

Foi localizado um único registro correspondente, com 5 repetições e 1 chamado vinculado.

## O que será feito

1. Excluir o chamado e seu histórico vinculados ao teste.
2. Excluir as ocorrências vinculadas, se existirem.
3. Excluir o registro agregado “Falha controlada de validação” da auditoria.
4. Confirmar que não resta nenhum registro com essa mensagem para a empresa informada.

## Limite da alteração

Nenhum erro real, outro chamado ou código da aplicação será alterado. A exclusão será restrita ao identificador exato do registro encontrado.
