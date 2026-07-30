## Contexto verificado

- `handleToggleActive` (`src/pages/ContasBancarias.tsx`) só altera `accounts.is_active` — hoje **não** apaga nada de Open Finance. Confirmado também que os triggers de `accounts` (saldo, delete, updated_at) não tocam em Pluggy.
- `pluggy_accounts.linked_account_id → accounts(id) ON DELETE SET NULL`: ao excluir a conta, o vínculo é apenas limpo; a conexão do banco continua ativa na Pluggy.
- Já existe o fluxo completo de remoção por conexão: edge function `pluggy-disconnect-item` (apaga o item na Pluggy, staging pendente e a `pluggy_connections`, com cascade em `pluggy_accounts`), usada hoje em `/contas-bancarias/conexoes`.

## O que será feito

Quando o usuário **excluir uma conta bancária** que possui vínculo Open Finance, excluir também a conexão daquele banco — e somente dela. A desativação (toggle Ativa/Inativa) continua sem mexer em Open Finance.

### 1. Detectar o vínculo no diálogo de exclusão
Em `ContasBancarias.tsx`, ao abrir o diálogo de exclusão, buscar em `pluggy_accounts` a linha com `linked_account_id = conta.id` (mesma empresa) e trazer `connection_id` + nome do banco.

### 2. Aviso claro no diálogo
Se houver vínculo, mostrar um bloco de alerta: "Esta conta está conectada via Open Finance ao banco X. A conexão com este banco também será removida (o histórico já importado é mantido)." Sem vínculo, o diálogo permanece exatamente como está.

### 3. Excluir a conexão junto
No `handleDelete`, após o `delete_account` retornar sucesso (hard ou arquivamento), invocar `pluggy-disconnect-item` com o `connection_id` daquela conta. Se a conexão tiver outras contas vinculadas (mais de uma `pluggy_accounts` na mesma conexão), remover apenas o vínculo/registro daquela conta e **preservar a conexão** — assim nunca se derruba o banco inteiro por causa de uma conta secundária.

### 4. Tratamento de erro
Falha ao remover a conexão não desfaz a exclusão da conta: exibir toast de aviso ("Conta excluída, mas a conexão Open Finance não pôde ser removida — tente em Conexões") e recarregar as listas.

## Detalhes técnicos

- Arquivos: `src/pages/ContasBancarias.tsx` (estado do diálogo, consulta de vínculo, chamada da function) e, se necessário, um pequeno ajuste em `supabase/functions/pluggy-disconnect-item/index.ts` para aceitar exclusão apenas do `pluggy_account` quando a conexão tiver múltiplas contas.
- Nenhuma alteração de schema, nenhuma mudança na página `/contas-bancarias/conexoes`, e a integração Pluggy permanece intacta.
