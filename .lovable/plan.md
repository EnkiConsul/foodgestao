## O que está acontecendo

Verifiquei o fluxo e o banco:

- Só existe um caminho que **grava** a conexão: o `onSuccess` do widget no navegador (`PluggyConnectDialog.tsx`) chamando `pluggy-sync-item` com `company_id`.
- O webhook (`pluggy-webhook`) chama `pluggy-sync-item` **sem** `company_id`; para um item novo (sem conexão salva) a função responde `company_id_required_on_first_connect` e nada é persistido.
- Não há tabela de "solicitação de conexão" (nenhuma referência a connect request no código), logo não há como saber a qual empresa pertence um item criado fora do navegador.
- Nos eventos recentes não há `item/created` do Inter e não existe conexão Inter em `pluggy_connections` (só Nubank e C6).
- A retomada após o consentimento depende de `sessionStorage` + parâmetros específicos na URL (`item_id`, `pluggy_item_id`, `oauth`, `code`). No Inter o consentimento termina no app do celular (QR Code); se a aba do desktop não voltar com exatamente esses parâmetros, ou se a volta ocorrer em outra aba/navegador, o widget nunca retoma e a conexão fica perdida.

Ou seja: o item pode até existir na Pluggy, mas o sistema só conclui a conexão se o navegador voltar exatamente no formato esperado. Isso é o que trava o Inter.

## O que fazer

### 1. Registrar a intenção de conexão antes de abrir o widget
Nova tabela `pluggy_connect_requests` (company_id, user_id, item_id_to_update, status, expires_at, item_id resolvido) com RLS por empresa e GRANTs. Criada pela função `pluggy-connect-token` no momento em que o token é emitido.

### 2. Webhook passa a concluir a conexão sem o navegador
- Tratar também `item/created` e `item/waiting_user_input`/`item/login_succeeded`.
- Quando não houver conexão para o item, resolver a empresa pela `pluggy_connect_requests` mais recente do usuário/empresa ainda aberta e chamar `pluggy-sync-item` com esse `company_id`, marcando a solicitação como concluída.
- Se não houver solicitação compatível, gravar o evento como pendente para reprocesso (sem falhar silenciosamente como hoje).

### 3. Retomada robusta no navegador
Em `PluggyConnectDialog.tsx` e `ContasBancarias.tsx`:
- Retomar sempre que houver registro de resume válido (não exigir parâmetros específicos na URL).
- Se o `connectToken` salvo estiver expirado, pedir novo token e reabrir com `updateItem`.
- Após o retorno, fazer polling curto (até ~90s) da conexão/solicitação no banco; ao aparecer, mostrar sucesso e atualizar a lista.
- Estado visual "Conexão em andamento — conclua no app do seu banco" com botão "Já autorizei, verificar agora".

### 4. Recuperação manual
Em `/admin/pluggy-status`: listar solicitações abertas/expiradas e permitir concluir informando o `item_id`, disparando `pluggy-sync-item` com a empresa correta.

## Detalhes técnicos

- Migration: tabela + índices (`user_id, status, created_at`), RLS restritiva, `GRANT SELECT` para `authenticated` e `ALL` para `service_role`.
- `pluggy-connect-token`: insere a solicitação (expira em 30 min) e retorna também seu id.
- `pluggy-sync-item`: aceitar `connect_request_id` como fonte alternativa de `company_id` quando chamado pelo service role.
- Nenhuma alteração no motor de saldos, categorização ou nas RPCs financeiras.
