# Open Finance: separar "pausar sincronização" de "desconectar / revogar acesso"

## Situação atual (verificada no código)

- A exclusão de conexão (`pluggy-disconnect-item`) **já chama** `DELETE /items/{itemId}` na Pluggy (`deleteItem` em `supabase/functions/_shared/pluggy.ts`). O que falta não é a chamada, é o resto do ciclo.
- Logo depois da revogação, a função **apaga a linha da conexão** (`pluggy_connections.delete`), o que derruba em cascata as contas Open Finance e o staging da conciliação. Não sobra registro de "quando/por quem foi revogado" nem estado `desconectado`. O histórico em `transactions` é preservado, mas lançamentos de extrato ainda pendentes de conciliação são perdidos.
- A desativação de conta bancária (`pluggy-pause-or-delete`) só marca `sync_paused_at` na conta e explicitamente **não revoga** nada — correto, mas hoje é a única forma de pausar, e não existe um botão de pausa próprio.
- Na tela de Conexões existe **um único** botão de lixeira ("Desconectar"), sem alternativa de pausa, e conexões com status `deleted` são filtradas da lista — ou seja, depois de revogar não há prova visual de que a revogação aconteceu.
- Bloqueio de novas sincronizações: o cron já ignora `status = 'deleted'` e contas pausadas; `pluggy-sync-item` recusa item `deleted`. Falta o mesmo tratamento explícito para o estado revogado quando ele passa a ser persistido.

## O que vamos fazer

1. **Duas ações distintas na tela de Conexões**
   - **Pausar sincronização** (reversível): interrompe as coletas automáticas, mantém o consentimento no banco e permite **Retomar** a qualquer momento. Card mostra selo "Sincronização pausada".
   - **Desconectar Open Finance (revogar acesso)** (definitivo): confirmação explicando que o acesso ao banco é cancelado, que será preciso nova autorização para reconectar e que **nenhum lançamento já registrado é apagado**.

2. **Revogação completa e auditável**
   - Revogar o consentimento na Pluggy (`DELETE /items/{id}`), com nova tentativa registrada quando o provedor falhar (a revogação local não fica presa a isso).
   - Marcar a conexão como **desconectada** em vez de apagar a linha: guardar data, autor e motivo da revogação; manter contas Open Finance e staging existentes.
   - Registrar entrada de auditoria ("conexão Open Finance revogada", banco, item, autor).

3. **Novas sincronizações bloqueadas**
   - Conexão desconectada é recusada em sincronização manual, cron e webhook, com mensagem clara ("conexão desconectada — reconecte o banco").

4. **Histórico preservado e visível**
   - Lançamentos financeiros, cartões e conciliações já feitas continuam intactos.
   - Conexões desconectadas passam a aparecer em uma seção discreta "Desconectados", com data da revogação e botão **Reconectar banco** (nova autorização), em vez de desaparecerem da tela.

5. **Exclusão de conta bancária**
   - Continua como hoje: quando o banco ainda alimenta outras contas em uso, apenas a conta Open Finance é desvinculada; quando não sobra nada em uso, a conexão é revogada — agora pelo novo caminho (revoga + marca desconectada + preserva histórico), sem apagar registros.
   - Desativar conta continua apenas **pausando**, e o texto na tela deixa isso explícito, com o caminho para revogar em Conexões.

## Detalhes técnicos

- Banco: novo valor `revoked` no enum `pluggy_connection_status` e colunas `revoked_at`, `revoked_by`, `revoke_reason`, `provider_delete_status` em `pluggy_connections` (migração com grants/RLS já existentes preservados).
- `supabase/functions/pluggy-disconnect-item/index.ts`: dividir em dois modos por parâmetro `mode` (`pause` | `revoke`, default `revoke`). No `revoke`, substituir o `delete` da conexão por `update {status:'revoked', revoked_at, revoked_by, provider_delete_status}` + `sync_paused_at` em todas as `pluggy_accounts` da conexão; manter a remoção pontual de conta quando `pluggy_account_id` é enviado e sobram contas em uso. Chamar `insert_audit_log`.
- Modo `pause`/`resume`: setar/limpar `sync_paused_at` + `sync_paused_reason='user_paused'` nas contas da conexão (nada é enviado à Pluggy).
- `pluggy-sync-item`, `pluggy-cron-sync` e `pluggy-webhook-worker`: tratar `revoked` junto de `deleted` nos filtros e nas recusas.
- `src/pages/ConexoesPluggy.tsx`: menu de ações por conexão (Pausar/Retomar, Reconectar, Desconectar), diálogo de confirmação reescrito, seção "Desconectados" (mostrar `revoked`, continuar ocultando `deleted` legado e conexões vazias).
- `src/pages/ContasBancarias.tsx`: textos de desativação/exclusão alinhados à distinção pausar × revogar.
- Testes: unitário do estado do card (ativo / pausado / desconectado) e regressão dos testes existentes de contas bancárias.
