## Problema

Na tela de Conciliação, cada lançamento vem de uma conta bancária já conectada via Open Finance, mas o campo "Conta de destino" fica vazio: hoje ele só é pré-preenchido quando o registro em staging tem `suggested_account_id`, o que nem sempre acontece. O usuário precisa escolher manualmente a conta que já é conhecida.

## Solução

Usar o vínculo que já existe entre a conta Pluggy e a conta local (`pluggy_accounts.linked_account_id`) como destino automático.

1. Ao carregar a tela, buscar todas as linhas de `pluggy_accounts` da empresa (`pluggy_account_id`, `linked_account_id`, `name`) e montar um mapa.
2. Ao pré-carregar as seleções de cada linha de staging, definir a conta na ordem: `suggested_account_id` → conta local vinculada ao `pluggy_account_id` da linha → vazio.
3. Manter a possibilidade de o usuário trocar a conta manualmente (o preenchimento é apenas o padrão).
4. Quando a conta Pluggy ainda não tiver `linked_account_id`, exibir o seletor vazio como hoje.

## Detalhes técnicos

- Arquivo: `src/pages/ConciliacaoPluggy.tsx`.
- No `load()`, incluir a consulta de `pluggy_accounts` no `Promise.all` (no modo escopado, ela já é consultada; reaproveitar a busca ampliando o `select` para todas as contas da empresa).
- Novo estado `linkedByPluggyAccount: Record<string, string>` usado na montagem de `acctMap`.
- Sem mudanças de banco de dados nem de Edge Functions.
