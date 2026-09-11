# Por que o C6 da Raptor parou de sincronizar (e o que mais está errado)

## O que os dados mostram (verificado agora)

- A conta C6 **35507609-8** aparece nas duas empresas (Raptor e Familia), mas o banco informa **um único CNPJ: 58.241.366/0001-32**, que é exatamente o CNPJ da **Raptor Systems**. A Familia não tem CNPJ cadastrado. Ou seja: **essa conta C6 é da Raptor**, não da Familia.
- Ontem (10/09, 13:59) a ligação C6 da Raptor foi **encerrada** durante a limpeza de duplicidades, sob a premissa de que o C6 era da Familia. Desde então: último recebimento da Raptor em 10/09 12:10, nenhum aviso do banco depois disso, próxima sincronização parada em 10/09 13:07.
- O extrato dessa mesma conta continua entrando na **Familia**: 272 lançamentos aguardando conferência lá; na Raptor, zero.
- A conta financeira C6 da Raptor (a que você tem aberta agora) tem 26 lançamentos próprios e segue apontando para uma ligação encerrada.

### Outros problemas encontrados nas demais empresas

1. **Familia / Neon**: ligação antiga encerrada com 2 contas ainda apontando para ela; a ligação nova tem 1 conta sem vínculo.
2. **Praianos / Banco do Brasil**: 2 ligações encerradas e 1 ativa; a ativa volta com "sucesso parcial" e 2 contas sem vínculo. 625 lançamentos aguardando conferência.
3. **Raptor / BTG**: presa em "atualizando" desde 29/08, sem nenhuma conta gerada e sem aviso na tela.
4. **Contas sem vínculo (cartões)**: 1 em Aperte 3D, 1 no Bmg, 1 no C6, 1 no Santander, 1 no Neon, 2 no BB — aparecem no sistema mas não alimentam nada até serem autorizadas.
5. **Nubank (Familia) e BB (Praianos)** voltam como "sucesso parcial" e isso não é explicado na tela.

## O que será feito

### 1. Devolver o C6 para a Raptor (correção principal)
- Reativar a ligação C6 da Raptor e religar a conta financeira C6 dela à ligação ativa.
- Encerrar o espelho do C6 na Familia e mover os 272 lançamentos pendentes desse C6 para a Raptor (nada conferido é apagado; o histórico fica).
- Reagendar a sincronização e rodar uma sincronização imediata para o extrato voltar a aparecer na Raptor.

### 2. Impedir que a mesma conta seja atribuída à empresa errada
- Na hora de ligar/atribuir um banco, comparar o **CNPJ/CPF que o banco informa** com o cadastro da empresa. Se não bater, avisar em qual empresa aquele documento está e pedir confirmação explícita antes de criar.
- Ao encerrar uma ligação por duplicidade, exigir a mesma checagem de documento, para não desligar a empresa dona da conta.

### 3. Contas apontando para ligação encerrada
- Rotina que detecta conta financeira ligada a conexão encerrada e a religa à conexão ativa do mesmo banco/conta (Neon da Familia e BB da Praianos entram aqui).

### 4. Deixar o estado visível na tela de Conexões e Conciliação
- Faixa por conexão: última sincronização, próxima programada, e motivo quando parada ("encerrada", "requer nova autorização", "banco em manutenção", "sucesso parcial: o banco entregou parte dos dados"), com botão "Sincronizar agora".
- Conexão presa em atualização por mais de 24h (BTG) passa a aparecer como "requer nova autorização" com botão para reconectar.
- Aviso com a contagem de contas/cartões aguardando autorização e link direto para a fila.

### 5. Testes
- Teste da regra de atribuição por documento (documento diferente exige confirmação; documento igual atribui à empresa correta).
- Teste da religação de conta apontando para conexão encerrada.

## Detalhes técnicos

- Correção de dados: reabrir `pluggy_connections` `1e780019…` (item `8454d7c5…`) da Raptor (`status='updated'`, `next_sync_at` recalculado); `pluggy_accounts` `7b0a3805…` mantida ligada a `accounts.84dc8b61…`; encerrar `pluggy_accounts` `54607bb4…` (Familia) e repontar seus `pluggy_staging_transactions` pendentes (272) para `company_id` Raptor + conta `84dc8b61…`; nada com `status='confirmed'` é alterado.
- `pluggy-sync-item` / `pluggy-webhook-worker`: na resolução de empresa, comparar `pluggy_accounts.raw->>'taxNumber'` (normalizado) com `companies.cnpj`; divergência retorna `owner_document_mismatch` com o nome da empresa dona, e o front reenvia com confirmação.
- Rotina de religação: `pluggy_accounts.connection_id` de conexões `deleted` com conexão ativa do mesmo `connector_id` + `number_masked` na mesma empresa.
- Detecção de item preso: conexões em `updating` com `updated_at` > 24h → `requires_reauth` na leitura.
- Frontend: `src/pages/ConexoesPluggy.tsx`, `src/pages/ConciliacaoPluggy.tsx`, `src/hooks/useExtratoConciliacao.tsx`, `src/lib/pluggy/connectionState.ts` (novos estados).
- `next_sync_at` sempre reagendado no fim do sync manual, com o intervalo do cron.
- Sem migração de schema, exceto índice auxiliar se necessário para a busca por documento.

## Verificação

- Conta C6 da Raptor com extrato novo na Conciliação da Raptor e nada mais entrando na Familia.
- Neon (Familia) e BB (Praianos) sincronizando na conta financeira correta.
- BTG aparecendo como "requer nova autorização".
- Tentar atribuir uma conta cujo CNPJ é de outra empresa exibe confirmação antes de criar.
