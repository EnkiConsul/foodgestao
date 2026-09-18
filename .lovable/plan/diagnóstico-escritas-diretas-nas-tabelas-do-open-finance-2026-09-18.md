# Diagnóstico — escritas diretas nas tabelas do Open Finance

Somente inventário. Nada foi alterado em código, migrations ou banco.

## Resumo

- Só **duas** tabelas recebem escrita a partir do aplicativo com o usuário logado: `pluggy_staging_transactions` e `pluggy_accounts`.
- `pluggy_connections`, `pluggy_connect_requests` e todas as `pluggy_v2_*` são escritas **apenas pelo servidor** (service_role), embora as permissões ainda permitam escrita pelo aplicativo.
- As permissões atuais são largas: `authenticated` tem SELECT/INSERT/UPDATE/DELETE em **todas** as oito tabelas; o que segura o acesso são as políticas por empresa. Em `pluggy_connect_requests` o papel público (`anon`) também tem permissão de escrita concedida, sem nenhuma política que a autorize (o acesso é negado por ausência de política, mas a concessão está aberta).

## Tabela por tabela

### pluggy_staging_transactions
1. Escritas no aplicativo: `src/pages/ConciliacaoPluggy.tsx` — linha 981 (`update suggested_account_id = null`), 1032 (`delete` de pendentes), 1093–1097 (`update` de fornecedor/cliente em lote), 1364 (`update description`). Servidor: `pluggy-sync-item` (inserção/atualização do extrato importado, linhas 938–1021), `pluggy-webhook-worker` (87), `pluggy-disconnect-item` (112, exclui pendentes da conta removida).
2. Aplicativo com sessão do usuário nos quatro casos acima; o restante é service_role.
3. Ações de negócio: limpar extrato pendente, reprocessar sugestões de conta, reprocessar fornecedor/cliente, editar a descrição antes de conciliar.
4. Substituível por RPC/Edge sem perda de experiência: sim, nos quatro casos — são operações em lote por id, com retorno simples; a confirmação e o "ignorar" já usam RPC (`pluggy_confirm_staging`, `pluggy_confirm_staging_card`, `pluggy_confirm_staging_transfer`, `pluggy_ignore_staging`, `pluggy_mark_duplicate_staging`).
5. Políticas: `pluggy_staging_member_read` (SELECT, membro), `pluggy_staging_editor_insert/update/delete` (authenticated, `private.pluggy_can_edit(auth.uid(), company_id)`). Permissões: authenticated com S/I/U/D.

### pluggy_accounts
1. Escrita no aplicativo: `src/components/credit-cards/PluggyCreditCardReviewDialog.tsx` linhas 111–119 (`update` de `credit_review_status`, `credit_review_at`, `credit_review_by`, `linked_credit_card_id`, `name`). Servidor: `pluggy-sync-item` (573–830, espelho de contas e vínculos), `pluggy-pause-or-delete` (53), `pluggy-disconnect-item` (83, 115, 147).
2. Aplicativo com sessão do usuário apenas na revisão de cartões; o resto é service_role.
3. Ação de negócio: autorizar/ignorar/vincular um cartão de crédito detectado no Open Finance.
4. Substituível por Edge/RPC sem quebrar a experiência: sim — a tela já cria o cartão e depois marca a revisão; as duas gravações poderiam ficar numa única chamada de servidor (ganho extra de atomicidade).
5. Políticas: `pluggy_accounts_member_read` (SELECT) e `pluggy_accounts_editor_insert/update/delete` (dono da empresa ou `private.member_can_edit(..., 'accounts')`). Permissões: authenticated com S/I/U/D.

### pluggy_connections
1. Nenhuma escrita no aplicativo (apenas leitura em `ConexoesPluggy.tsx`, `ConciliacaoPluggy.tsx`, `admin/PluggyStatus.tsx`). Servidor: `pluggy-sync-item` (122, 259, 529–548, 1085), `pluggy-cron-sync` (96, 126, 136, 147, 167), `pluggy-disconnect-item` (86, 133), `pluggy-webhook-worker` (110, 131), `pluggy-reconcile-items` (72), `pluggy-admin-find-items` (194).
2. 100% service_role.
3. Ações: criar/atualizar conexão, status de sincronização, pausa/retomada, revogação de consentimento, reconciliação administrativa.
4. Já está no servidor; o que resta é fechar as permissões de escrita do aplicativo (hoje concedidas sem uso).
5. Políticas: SELECT por membro; INSERT/UPDATE/DELETE para authenticated (dono ou editor de contas) — sem consumidor. Permissões: authenticated com S/I/U/D.

### pluggy_connect_requests
1. Nenhuma escrita no aplicativo (leitura em `PluggyConnectDialog.tsx` 344, `ConexoesPluggy.tsx` 189, `admin/PluggyConnectRequests.tsx` 64). Servidor: `pluggy-connect-token` (188, 195, 237), `pluggy-sync-item` (97, 291, 426, 438), `pluggy-reconcile-items` (57), `pluggy-admin-find-items` (175).
2. 100% service_role.
3. Ação: acompanhar a autorização feita no aplicativo do banco até concluir a conexão.
4. Já está no servidor.
5. Política: só `pluggy_connect_requests_member_read` (SELECT). Permissões: authenticated **e anon** com S/I/U/D — escrita bloqueada apenas por não existir política de escrita.

### pluggy_v2_connections / pluggy_v2_accounts / pluggy_v2_sync_runs / pluggy_v2_transactions_raw
1. Nenhuma escrita no aplicativo (nenhuma referência em `src/`, fora dos tipos gerados). Servidor: `supabase/functions/_shared/pluggy-v2-materialize.ts` — `pluggy_v2_connections` (upsert, 65), `pluggy_v2_sync_runs` (upsert 91, update 216), `pluggy_v2_accounts` (upsert 117), `pluggy_v2_transactions_raw` (upsert 196); acionado por `pluggy-sync-item` (import na linha 6). Leituras de contagem em `pluggy-webhook-worker` (182) e `pluggy-connect-token` (172).
2. 100% service_role.
3. Ação: materializar item, contas e extrato da integração nova, com registro de cada execução.
4. Já está no servidor.
5. Políticas: `pv2_*_service_role_all` (ALL, service_role), leitura por empresa para authenticated, e ainda INSERT/UPDATE/DELETE para authenticated nas três primeiras (`pluggy_v2_sync_runs` tem uma política `ALL` para authenticated) — sem consumidor no aplicativo. Permissões: authenticated com S/I/U/D em todas.

## Observações técnicas

- Nenhuma tabela da lista concede acesso a `anon` por política; apenas `pluggy_connect_requests` tem a concessão de tabela aberta para `anon`.
- Funções de servidor da integração e sua exposição: `pluggy-webhook`, `pluggy-webhook-worker` e `pluggy-cron-sync` rodam sem verificação de sessão (`verify_jwt = false` em `supabase/config.toml`), autorizadas por segredo próprio; `pluggy-sync-item`, `pluggy-connect-token`, `pluggy-disconnect-item`, `pluggy-pause-or-delete`, `pluggy-reconcile-items`, `pluggy-admin-find-items` exigem sessão e checam permissão (`pluggy_user_can_edit`) antes de gravar.
- Superfície mínima para eliminar escrita direta do aplicativo, se um dia for decidido: 5 pontos de código (4 em `ConciliacaoPluggy.tsx`, 1 em `PluggyCreditCardReviewDialog.tsx`).
- Módulo financeiro segue fora do meu escopo de alteração (fica com o Rafael); este documento é apenas o inventário solicitado.
