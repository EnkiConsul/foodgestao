## O que os dados mostram

Consultei o backend para o usuário `eucastrosilvio@gmail.com` (id `9bde0e92-…c2f99`):

- **Nenhuma conexão do Banco do Brasil** existe. As únicas conexões salvas são Inter Empresas, Nubank e C6 Bank Empresas — todas de outras empresas.
- **Nenhuma solicitação de conexão** (`pluggy_connect_requests`) registrada para esse usuário — a tabela está vazia.
- **Nenhum evento `item/created`** recebido da Pluggy hoje; os eventos recentes são só `connector/status_updated` (sem item vinculado).

Ou seja: sim, houve falha — a autorização do Banco do Brasil **nunca chegou a criar/registrar um item** no ambiente de produção do nosso lado. Sem solicitação registrada e sem webhook de item, o sistema não tem como vincular a conta.

## Causa identificada (confirmada no código)

Em `supabase/functions/pluggy-connect-token/index.ts`, a solicitação de conexão só é criada **quando o front envia `company_id`**. Quando não envia, a função apenas registra `connect_token_without_company_id` nos logs e devolve `connectRequestId: null`. Os logs de produção mostram exatamente esse erro, e as chamadas observadas enviam corpo `{}`.

Consequência: em fluxos que terminam fora do navegador (Open Finance por QR Code/app do banco, como no BB), não existe nenhuma âncora para o webhook resolver a empresa — a conexão se perde silenciosamente.

## Plano

1. **Garantir o `company_id` na origem**
   - Auditar todos os pontos que chamam `pluggy-connect-token` (diálogo de conexão em Contas Bancárias e painel admin) e passar sempre a empresa ativa.
   - Na Edge Function, recusar a emissão do token (400 com mensagem clara) quando não houver `company_id` num fluxo de nova conexão, em vez de emitir token “órfão”.

2. **Sinalizar a falha ao usuário**
   - No diálogo de conexão, se o retorno vier sem `connectRequestId`, bloquear a abertura do widget e exibir mensagem orientando a selecionar a empresa/recarregar, evitando autorização perdida no banco.

3. **Rede de segurança no webhook**
   - Em `pluggy-webhook`, ao receber `item/created`/`item/updated` sem solicitação correspondente, resolver a empresa pelo `clientUserId` do item (usuário → empresa ativa/única) e registrar o item; se não for possível resolver, gravar o evento como pendente de vínculo manual em vez de descartar.

4. **Recuperação do caso do cliente**
   - Após o item aparecer, vincular pelo painel `/admin/pluggy-status` (consulta por e-mail + vínculo manual).
   - Se o item do BB não existir na Pluggy em produção, orientar o cliente a refazer a conexão — agora com o registro corrigido, a autorização por QR Code será concluída mesmo sem retorno ao navegador.

## Detalhes técnicos

Arquivos envolvidos: `supabase/functions/pluggy-connect-token/index.ts`, `supabase/functions/pluggy-webhook/index.ts`, `src/components/accounts/PluggyConnectDialog.tsx`, `src/components/admin/PluggyConnectRequests.tsx`. Sem mudanças de schema; apenas leitura/escrita nas tabelas já existentes `pluggy_connect_requests`, `pluggy_webhook_events` e `pluggy_connections`.
