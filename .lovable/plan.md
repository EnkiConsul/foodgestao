# Erro ao salvar a colaboradora Karine

## O que está acontecendo

A Karine está com um estado inconsistente no cadastro: marcada como **inativa**, mas **sem data de demissão**. Existe uma regra no banco que impede qualquer registro inativo sem data de demissão. Como essa regra é avaliada em toda gravação, qualquer edição dela é recusada — mesmo que você só altere dados pessoais ou remuneração.

Confirmado: a Karine é o único registro nessa situação (1 de 14 colaboradores).

Além disso, o aviso de erro apareceu sem detalhe porque a mensagem do banco não chegou até a tela.

## Correções

1. **Regularizar a Karine**: como ela não tem desligamento formal registrado, reativá-la no cadastro (ficha volta a ser editável normalmente). Se ela realmente foi desligada, o desligamento deve ser refeito pelo fluxo de desligamento, informando a data.
2. **Impedir que volte a acontecer**: bloquear no banco a criação/atualização de registros inativos sem data de demissão continua valendo, mas a tela passa a orientar: quando o colaborador estiver inativo sem data de demissão, o formulário pede a data da demissão (ou reativação) antes de salvar, em vez de deixar o banco recusar.
3. **Mostrar o motivo do erro**: o aviso "Erro ao salvar" passa a exibir sempre a mensagem retornada pelo backend, e mensagens conhecidas ganham texto em português claro.

## Detalhes técnicos

- Migração de dados: `update dp_colaboradores set ativo = true where ativo = false and data_desligamento is null` (afeta só a Karine), mantendo a trigger `dp_colaborador_desligamento_guard` como está.
- `src/components/dp/ColaboradorFormDialog.tsx`:
  - derivar `isDesligado` também de `colaborador.ativo === false` (hoje só olha `data_desligamento`), para o campo de data de demissão aparecer e ser validado nesse caso;
  - no `catch` do `submit`, normalizar o erro (`error.message || error.details || error.hint`) para nunca exibir descrição vazia, com tradução da mensagem da trigger de desligamento.
