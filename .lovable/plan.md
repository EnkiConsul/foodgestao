## O que os dados mostram

Verifiquei o banco antes de propor qualquer correção:

- Usuário `eucastrosilvio@gmail.com` (`9bde0e92…`) pertence a **PRAIANOS BAR E RESTAURANTE LTDA** (`bab7a4ac…`), empresa ativa, módulo financeiro ativo, 1 membro.
- **Nenhuma linha** em `pluggy_connections` para essa empresa (só existem 3 conexões, todas de outras empresas: Inter Empresas, Nubank, C6).
- **Nenhuma linha** em `pluggy_connect_requests` para esse usuário/empresa (só há 2 solicitações, ambas de outro usuário).
- Em `pluggy_webhook_events`, o último evento de item (`item/created`, `item/updated`, `login_succeeded`) é de **30/07**; desde então só chegam eventos `connector/status_updated` (que não têm `itemId` e não geram conexão).

Conclusão factual: **o backend do 360°FOOD nunca recebeu nada dessa conexão** — nem intenção de conexão, nem webhook de item. Portanto o problema não está na tela de listagem nem em RLS; está antes disso: ou o item foi criado no lado da Pluggy sem que nosso fluxo registrasse, ou o widget nunca chegou a criar o item.

A causa exata ainda **não está confirmada** — as duas hipóteses acima exigem consultar a Pluggy. Então a primeira etapa do plano é diagnóstico, não correção.

## Etapa 1 — Confirmar o que existe na Pluggy (diagnóstico)

Consultar a API da Pluggy (`GET /items`, filtrando por `clientUserId` do usuário e por conector Banco do Brasil) através de uma função de diagnóstico restrita a super admin, para saber:

- Existe item do Banco do Brasil criado nos últimos dias? Qual `status` (`updated`, `waiting_user_input`, `login_error`, `created`)?
- Qual `clientUserId` está associado?

O resultado define o caminho:

- **Item existe na Pluggy** → é falha de retorno/registro no nosso lado (o `connect_request` não foi criado ou o webhook não casou). Vamos materializar a conexão (Etapa 2) e fechar a lacuna (Etapa 3).
- **Item não existe** → a autorização no banco não concluiu (comum no BB via QR Code/app); orientar reconexão com a Etapa 4 já aplicada.

## Etapa 2 — Recuperação imediata do cliente (se o item existir)

Usar o fluxo manual já existente (`/admin/pluggy-status` → Solicitações de conexão → “Concluir”, que chama `pluggy-sync-item`) informando o `item_id` e a empresa Praianos. Isso cria `pluggy_connections`, contas e lançamentos em staging para conciliação, sem o cliente precisar reconectar.

Complemento necessário: hoje a tela de conclusão manual só lista `pluggy_connect_requests` existentes. Como não há nenhuma para esse cliente, adicionar na página admin um bloco **“Vincular item manualmente”** com campos empresa + `item_id`, que chama a mesma função. Sem isso não é possível recuperar o caso atual pela interface.

## Etapa 3 — Fechar a lacuna de registro

Motivo provável do “sumiço”: o `pluggy_connect_requests` só é gravado quando o front envia `company_id` ao criar o token, e o webhook `item/created` só materializa a conexão quando encontra uma solicitação aberta correspondente. Se a solicitação não existe (ou já expirou — a janela é de 1 hora), o item chega e é descartado.

Ajustes:

1. No `pluggy-connect-token`, garantir que a solicitação seja sempre registrada e falhar de forma visível (log + erro) quando `company_id` não vier, em vez de seguir silenciosamente.
2. No `pluggy-webhook`, quando chegar um evento de item **sem** solicitação aberta correspondente, resolver a empresa pelo `clientUserId` do item na Pluggy e materializar a conexão. Se ainda não for possível, gravar o evento como pendente com o motivo, para aparecer no painel admin em vez de se perder.
3. Ampliar a validade da solicitação de conexão (1 h é curto para fluxos de QR Code no app do banco) e reaproveitar solicitação recente já expirada durante uma janela de tolerância.

## Etapa 4 — Visibilidade para o cliente

Em `/contas-bancarias/conexoes`, quando existir uma solicitação de conexão recente sem conexão materializada, exibir um cartão de estado “Conexão em andamento / não concluída” com ação de tentar novamente — hoje a tela mostra apenas “Nenhum banco conectado”, o que não distingue “nunca tentou” de “tentou e falhou”.

## Detalhes técnicos

- Arquivos: `supabase/functions/pluggy-connect-token/index.ts`, `supabase/functions/pluggy-webhook/*`, nova função de diagnóstico `pluggy-admin-find-items` (super admin), `src/components/admin/PluggyConnectRequests.tsx`, `src/pages/ConexoesPluggy.tsx`.
- Sem alteração de schema prevista, exceto possível coluna de motivo/pendência em `pluggy_webhook_events` (com GRANTs e RLS restritos a super admin/service role).
- Nenhuma alteração destrutiva em `transactions` já conciliadas.
