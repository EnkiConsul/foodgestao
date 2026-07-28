## Objetivo

Hoje a conciliação é conjunta: `/contas-bancarias/conciliacao` mostra a fila de todos os bancos conectados da empresa, com um filtro "Conexão" iniciando em "Todas". A mudança: quando o usuário entrar pelo botão **Conciliação** do card de uma conta bancária, a tela deve exibir apenas os lançamentos daquela conta, sem opção de trocar para as demais.

## Como vai funcionar

1. No card da conta (Contas Bancárias), o botão passa a navegar para a conciliação levando a identificação da conta integrada.
2. Na tela de conciliação, ao chegar com esse escopo:
   - Título indica a conta (ex.: "Conciliação — C6 BANK"), com o logo/badge do banco.
   - A lista traz somente os lançamentos daquela conta Open Finance.
   - O seletor de conexão fica oculto (escopo travado).
   - O botão de sincronizar age apenas na conexão daquela conta.
   - O botão voltar retorna para Contas Bancárias.
3. Acessando a conciliação sem escopo (por link direto ou pelo menu), o comportamento atual continua: fila completa da empresa com filtro "Todas".

## Detalhes técnicos

- `src/pages/ContasBancarias.tsx`: o botão do card navega para `/contas-bancarias/conciliacao?account=<accounts.id>`. Para isso, a busca em `pluggy_accounts` passa a guardar o mapa `linked_account_id → { pluggy_account_id, connection_id, name }` em vez de apenas o Set de ids.
- `src/pages/ConciliacaoPluggy.tsx`:
  - Lê `account` via `useSearchParams`; resolve em `pluggy_accounts` (por `linked_account_id` + `company_id`) o `pluggy_account_id` e o `connection_id`.
  - Com escopo ativo: filtra `pluggy_staging_transactions` por `pluggy_account_id` (filtro no servidor, na própria query), fixa `connectionId` e não renderiza o `Select` de conexões.
  - `syncNow` usa só a conexão resolvida.
  - Se o parâmetro não resolver (conta sem vínculo Open Finance), mostra aviso e cai no modo conjunto.
- Sem mudanças de banco de dados, RLS ou Edge Functions.
