# Pendências: apuração diária em fila + seta girando sem atualizar a hora

## 1. Apuração continua 1x por dia, empresa por empresa

Decisão: manter a apuração automática apenas no horário fixo diário (03:00 de São Paulo). Nada de recalcular a cada acesso — com 1.000 empresas, isso sairia de ~1.000 apurações por dia para dezenas de milhares, com pico logo na abertura do painel de manhã e tela lenta sem nenhum ganho, já que quase sempre o resultado é o mesmo.

Ao abrir a tela continua valendo o que já existe hoje: leitura do resultado pronto e recálculo só se alguma ação tiver marcado a empresa como desatualizada, ou pelo botão manual.

Mudança de robustez: a rotina diária passa a processar as empresas **uma por vez, em fila**, em vez de tudo no mesmo instante. Assim, com 1.000 empresas, o banco trabalha de forma constante e leve, sem pico. Se uma empresa falhar, ela é anotada e a fila continua nas seguintes.

## 2. Seta girando sem mudar o horário

Causa: a seta gira sempre que a tela está buscando dados, inclusive quando ela apenas relê o resultado já apurado — e nesse caso o horário "Atualizado" não muda, porque nenhuma apuração nova rodou. Quando a apuração roda e não encontra diferença, o horário também não avança.

Correções:

- A seta só gira quando uma apuração de verdade está em andamento (botão manual ou recálculo por estar desatualizado). Leitura simples do resultado não gira mais nada.
- Sempre que a apuração roda até o fim, o horário da última atualização passa a ser registrado, mesmo sem mudança no conteúdo. Se a seta girou, a hora muda.
- "Carregando…" continua apenas no primeiro acesso, sem apagar a lista existente.

## Detalhes técnicos

- `dp-refresh-pendencias`: no modo diário (sem `companyId`), iterar as empresas sequencialmente com um pequeno intervalo entre elas, capturando erro por empresa e seguindo a fila; manter o cron atual `0 6 * * *` UTC.
- `private.dp_refresh_document_pending` / `dp_pendencias_apuracoes`: gravar `apurado_em = now()` ao concluir, inclusive quando o conjunto de pendências não mudou.
- `src/hooks/useDpPendencias.tsx`: expor `isRefreshing` próprio (apuração em curso) separado do `isFetching` do React Query; após invocar a função, reler `apurado_em` e propagar. Nenhuma nova condição de recálculo por tempo.
- `src/components/dp/home/PendenciasCard.tsx`: `RefreshCw` com `animate-spin`/`disabled` ligados a `isRefreshing`, não a `isFetching`; `useStablePendencias` permanece como está.
- Testes: `PendenciasCard.test.tsx` cobrindo "relendo sem apurar → sem giro" e "apurando → gira e horário avança".
