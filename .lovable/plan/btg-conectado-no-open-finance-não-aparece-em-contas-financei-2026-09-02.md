# BTG conectado no Open Finance não aparece em Contas Financeiras

## O que os dados mostram

- Não existe **nenhuma** conexão BTG criada hoje. Em toda a base, o único item BTG é de **25/08** (empresa Raptor Systems), e ele está parado em `status = updating` / `execution_status = LOANS_IN_PROGRESS` desde 29/08, sem nenhuma conta materializada.
- Na empresa que você está usando hoje (Familia), as solicitações de conexão de hoje foram: 4 marcadas como **expiradas** (19:01, 19:02, 19:08, 19:17) e 1 **concluída** às 19:22, que resolveu o item do **Banco Bmg**. Nenhuma solicitação foi aberta depois disso, ou seja, a autorização do BTG não foi registrada pelo app.
- As contas que apareceram hoje (Bmg, Santander, Neon) foram criadas exatamente no instante em que a solicitação correspondente foi concluída — o caminho funciona quando o item é capturado.
- **Os webhooks da Pluggy não chegam desde 27/08** (último evento registrado: 27/08 10:55, zero nas últimas 24h). Então hoje o único jeito de um item ser capturado é o retorno do widget; se o item não volta por ali, nada nem ninguém o resgata depois.

Ou seja: o BTG provavelmente foi autorizado dentro de uma sessão do widget cuja solicitação já estava concluída/expirada (uma solicitação = um item), e o item ficou órfão na Pluggy. Isso ainda é hipótese — a confirmação depende de listar os itens existentes na conta Pluggy.

## O que será feito

### 1. Confirmar e resgatar o item BTG (agora)
- Listar os itens da conta Pluggy e localizar o item BTG criado hoje para a sua empresa.
- Se existir, vinculá-lo à empresa e rodar a sincronização, criando a conta financeira e o extrato pendente normalmente.
- Se não existir, isso significa que a autorização não foi concluída no BTG e o caminho correto é reconectar — nesse caso eu aviso e sigo direto para os itens 2 e 3.

### 2. Reconciliação de itens órfãos (não depender do retorno do widget)
- Nova rotina de "importar conexões existentes": compara os itens da Pluggy com as conexões registradas e traz os que faltam, atribuindo à empresa da solicitação mais recente do usuário.
- Botão na tela de Open Finance: "Verificar conexões pendentes", com resultado explícito (nenhuma, ou X conexões importadas).
- Permitir mais de um item por solicitação de conexão, para que conectar dois bancos na mesma sessão do widget não perca o segundo.

### 3. Voltar a receber webhooks da Pluggy
- Verificar o registro do webhook na Pluggy e a URL configurada, reativar o recebimento e confirmar com um evento de teste.
- Alerta no painel admin quando não houver evento recebido nas últimas 24h (hoje isso passou silencioso por 6 dias).

### 4. Item BTG travado em LOANS_IN_PROGRESS (Raptor Systems)
- Tratar item preso em atualização: reconsultar e, se continuar preso além do limite, marcar a conexão como "requer atenção" na tela em vez de ficar eternamente "atualizando".

## Detalhes técnicos

- `supabase/functions/pluggy-connect-token` / callback de conexão: permitir múltiplos `resolved_item_id` por solicitação (tabela de itens resolvidos ou nova solicitação por item).
- Nova função `pluggy-reconcile-items`: `GET /items` na Pluggy, diff contra `pluggy_connections` + `pluggy_v2_connections`, materialização via `pluggy-sync-item` / `materializePluggyItemV2`.
- Frontend: tela de Open Finance (ação de verificação + feedback) e badge de estado "requer atenção".
- Sem migração de schema além da tabela/coluna de itens resolvidos por solicitação.

## Verificação

- Conta BTG visível em Contas Financeiras com saldo do banco e extrato pendente na Conciliação.
- Conectar dois bancos seguidos na mesma sessão do widget resulta em duas conexões registradas.
- Evento de webhook de teste registrado em `pluggy_webhook_events` com status processado.
