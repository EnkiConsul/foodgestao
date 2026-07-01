## Problema

Em `TransactionFormDialog.tsx` a query `accountsQuery` (linha 212) busca **todas** as contas ativas do usuário, sem filtrar por perfil de acesso (PF vs PJ / empresa). Por isso o dropdown "Conta" mostra contas de outros perfis.

## Correção

Filtrar `accountsQuery` pelo contexto ativo, igual ao que `src/pages/ContasBancarias.tsx` já faz:

- Adicionar `contextType` e `selectedCompanyId` à `queryKey` (para revalidar ao trocar o perfil).
- Aplicar `.eq("context", contextType)`.
- Se `contextType === "pj"` e `selectedCompanyId`, aplicar `.eq("company_id", selectedCompanyId)`.
- Se `contextType === "pj"` sem empresa selecionada, retornar `[]` (nenhuma conta).

## Ajuste complementar

No `useEffect` de auto-seleção (linha ~311) e no reset (`setAccountId(accounts[0]?.id ?? "")` linha 464), como o array já virá filtrado, o comportamento fica correto — apenas garantir que, ao trocar de perfil com o diálogo aberto, se a conta atual não pertencer ao novo conjunto, seja substituída pela primeira disponível (ou vazia).

## Arquivos alterados

- `src/components/transactions/TransactionFormDialog.tsx` (apenas a query de contas e a lógica de seleção padrão).

Nenhuma alteração de schema/RLS é necessária.
