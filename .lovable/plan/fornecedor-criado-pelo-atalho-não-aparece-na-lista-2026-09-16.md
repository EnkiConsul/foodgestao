# Fornecedor criado pelo atalho não aparece na lista

## O que está acontecendo

Um cliente/fornecedor só aparece no formulário de lançamento quando está vinculado à empresa em uso. No atalho dentro do lançamento, nenhuma empresa vem marcada por padrão; se o usuário não marcar, o cadastro é criado sem empresa e some da lista, mesmo com a mensagem "Contato criado!".

Confirmado nos dados: os três cadastros de hoje com o nome "Alessandra CNPJ" estão ativos, mas sem nenhuma empresa vinculada — por isso não aparecem. Os cadastros antigos que aparecem têm vínculo.

## Correção proposta

1. Atalho já vem com a empresa em uso
   - Ao abrir o cadastro rápido pelo formulário de lançamento, a empresa atual vem marcada.
   - O usuário ainda pode marcar outras empresas ou desmarcar.

2. Não deixar salvar sem empresa
   - Se nenhuma empresa estiver marcada, o salvamento é bloqueado com aviso claro: "Selecione ao menos uma empresa para este cliente/fornecedor."
   - Vale também para a tela de Contatos, evitando novos cadastros invisíveis.

3. Seleção automática após criar
   - Depois de salvar pelo atalho, o novo cadastro aparece na lista e já fica selecionado no lançamento.
   - Se, por algum motivo, ele não estiver visível na empresa atual, o formulário avisa em vez de ficar em silêncio.

4. Regularizar os cadastros já criados sem empresa
   - Listar os cadastros ativos sem empresa e vinculá-los à empresa de quem os criou, com registro em auditoria.
   - Os três "Alessandra CNPJ" duplicados: manter um e inativar os outros dois, conforme sua confirmação.

## Detalhes técnicos

- `TransactionFormDialog`: passar `defaultCompanyIds={[selectedCompanyId]}` (e `defaultContactType` conforme entrada/saída) ao `ContactFormDialog`.
- `ContactFormDialog`: validar `selectedCompanyIds.length > 0` antes do insert/update, com `toast.error`; usar `negarRegra` quando o padrão do módulo se aplicar, para não poluir a Auditoria de Erros.
- Após `onSaved`, aguardar a revalidação de `form-contacts`/`form-contact-companies` antes de aplicar `setContactId`, evitando seleção em lista ainda não atualizada.
- Backfill via SQL de dados (não migração de estrutura), idempotente, restrito a `contacts` ativos sem linha em `contact_companies`, respeitando o escopo do dono do cadastro; nada de mexer em saldos ou lançamentos.
- Teste unitário cobrindo: bloqueio sem empresa, pré-seleção da empresa atual e visibilidade do novo contato no filtro PJ.

## Fora do escopo

- Mudanças de layout do formulário ou da tela de Contatos.
- Alterar as regras de visibilidade por empresa já existentes.
