# Conciliação: por que a sincronização do Open Finance falha

## O que os dados mostram (verificado agora)

1. **Contas grandes param na segunda página do extrato.** O último erro registrado (hoje, 06:07, após 5 tentativas) é do banco: *"Invalid cursor. The 'after' parameter must contain only the cursor value"*. A rotina de leitura de lançamentos pede a página seguinte usando o valor errado, então qualquer conta com mais de uma página de lançamentos falha por inteiro e nada novo entra na conciliação. É o caso do Banco do Brasil Empresas (1.225 linhas pendentes, última em 09/09).
2. **Três conexões chegam sem empresa definida.** Eventos dos itens `069d4aa1…`, `2f9eb17b…` e `e8048082…` foram descartados com "empresa não resolvida" e ficaram na lixeira de eventos. Essas conexões existem no banco, mas o app não consegue atribuí-las a nenhuma empresa, então nunca aparecem na conciliação.
3. **Neon (empresa Familia) parou em 03/09.** A conta financeira Neon continua ligada a uma conexão já encerrada; a conexão nova tem contas sem vínculo. Resultado: sincroniza, mas o extrato não chega na conta certa.
4. **A empresa aberta agora no seu navegador (ClicSorte) não tem nenhuma conexão Open Finance** — nela a conciliação fica vazia por ausência de conexão, não por erro.
5. **A sincronização automática roda só de 6 em 6 horas** (00:07, 06:07, 12:07, 18:07), mas a tela mostra "próxima sincronização" com horário antigo (07:07), o que passa a impressão de atraso. Os antigos disparos de 15/5 minutos não existem mais.
6. Um item do Neon voltou com "site indisponível ou em manutenção" — falha do banco, precisa ser mostrada como tal em vez de silenciar.

## O que será feito

### 1. Corrigir a paginação do extrato (causa principal)
Passar a usar o cursor de paginação no formato exigido pelo provedor e reprocessar os eventos que ficaram parados, para que as contas com muitos lançamentos voltem a sincronizar por completo.

### 2. Reprocessar o que ficou na lixeira
Botão para reenviar os eventos parados após a correção, com resultado explícito (quantos foram reprocessados e quantos continuam falhando).

### 3. Conexões sem empresa
Rotina de "verificar conexões pendentes" que lista os itens sem empresa e permite vincular à empresa correta em um clique, aproveitando a solicitação de conexão mais recente do usuário.

### 4. Religar a conta Neon
Vincular as contas da conexão Neon ativa às contas financeiras existentes (sem apagar histórico) e evitar que a troca de conexão deixe conta apontando para conexão encerrada.

### 5. Deixar o estado visível na tela
Na Conciliação e em Conexões: última sincronização, próxima programada (coerente com o intervalo real), e faixa de aviso quando a última tentativa falhou, com o motivo em linguagem simples ("banco em manutenção", "reconectar", "erro ao ler lançamentos") e botão "Sincronizar agora".

### 6. Testes
Teste da paginação por cursor (duas páginas) e do caminho de erro que hoje derruba a sincronização inteira.

## Detalhes técnicos

- `supabase/functions/_shared/pluggy.ts` → `listTransactions`: trocar `after=<next>` por chamada em `GET /v2/transactions{next}` (ou `pageCursor`, como já faz `listTransactionsV2` em `_shared/pluggy-client.ts`); remover `dateFrom`/`dateTo` não aceitos na rota v2 e aplicar o filtro de período localmente.
- `pluggy-webhook-worker`: ação de requeue de `pluggy_webhook_events` com `status='dead_letter'` (zera `attempt_count`, limpa `next_attempt_at`).
- Nova função `pluggy-reconcile-items` (ou ação no painel admin) para itens com `pending_manual_link`.
- Correção pontual de dados: `pluggy_accounts.linked_account_id` da conexão Neon ativa (`fc8812e3…`) apontando para as contas financeiras da empresa `09d6063b…`.
- Frontend: `src/pages/ConciliacaoPluggy.tsx` e `src/pages/ConexoesPluggy.tsx` (estado de sync, erro amigável, sincronizar agora).
- Sem migração de schema.

## Verificação

- Banco do Brasil sincroniza mais de uma página sem erro e as linhas novas aparecem na Conciliação.
- Nenhum evento novo em lixeira com erro de cursor.
- Neon volta a trazer extrato para a conta financeira correta.
- Tela mostra última/próxima sincronização coerentes e o motivo de falha quando houver.
