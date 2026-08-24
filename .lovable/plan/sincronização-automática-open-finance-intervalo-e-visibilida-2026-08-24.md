# Sincronização automática Open Finance: intervalo e visibilidade

## Objetivo
Tornar a sincronização automática das contas conectadas via Open Finance mais frequente (a cada 6h) e exibir, nas telas de Conexões e Conciliação, quando ocorreu a última sincronização e quando a próxima está programada.

## Alterações técnicas

### 1. Backend — reduzir intervalo mínimo de sync
- Atualizar a função `public.enqueue_open_finance_scheduled_syncs()` para enfileirar conexões ativas que não sincronizaram há pelo menos **6 horas** (hoje está em 12 horas).
- Manter os cron jobs existentes:
  - `open-finance-enqueue-syncs` a cada 15 minutos.
  - `open-finance-drain-syncs` a cada 5 minutos.
  - `pluggy-enqueue-daily` às 05:00 UTC (cobertura diária).

### 2. Frontend — tela de Conexões (`src/pages/ConexoesPluggy.tsx`)
- Incluir no carregamento das conexões os campos: `last_synced_at`, `next_sync_at`, `last_sync_status`, `last_sync_attempt_at`, `last_sync_error`.
- Exibir, para cada conexão ativa:
  - Última sincronização: data/hora de `last_synced_at` ou `last_sync_attempt_at`.
  - Próxima sincronização: data/hora de `next_sync_at`.
  - Status/erro da última tentativa, se houver.
- Usar tooltip ou linha secundária para manter a lista limpa.

### 3. Frontend — tela de Conciliação (`src/pages/ConciliacaoPluggy.tsx`)
- No cabeçalho, quando houver uma conta/conexão selecionada, mostrar:
  - Última sincronização da conexão vinculada.
  - Próxima sincronização programada.
- Atualizar o estado quando a sincronização manual for disparada pelo botão "Sincronizar".

## Critérios de aceitação
- A função `enqueue_open_finance_scheduled_syncs()` usa `interval '6 hours'`.
- A tela de Conexões mostra claramente a última e a próxima sincronização de cada conexão.
- A tela de Conciliação mostra a mesma informação para a conexão ativa.
- Build/typecheck passa sem erros.
