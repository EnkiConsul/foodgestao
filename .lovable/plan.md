# Pendências: custo de recalcular a cada acesso + seta girando sem atualizar a hora

## 1. Impacto de recalcular a cada acesso (1.000 empresas)

Hoje o funcionamento é: a apuração roda uma vez por dia (03:00 de São Paulo), mais quando alguma ação do gestor marca o resultado como desatualizado, mais o botão manual. Ao abrir a tela, o sistema só lê o resultado já pronto.

Se voltar a recalcular a cada acesso:

- Cada abertura de tela dispara a apuração completa da empresa (colaboradores, documentos, competências, férias, benefícios). Hoje isso é 1 vez por dia por empresa; com recálculo por acesso, uma empresa com 5 gestores abrindo o painel 6 vezes ao dia passa a ~30 apurações/dia.
- Com 1.000 empresas nesse ritmo, sai de ~1.000 apurações/dia para ~30.000/dia, com picos concentrados no início da manhã (todos abrindo o painel ao mesmo tempo). É aí que aparece lentidão: a tela demora para montar e o banco fica ocupado com trabalho repetido que devolve exatamente o mesmo resultado.
- O resultado, na prática, é idêntico ao atual na maior parte dos acessos, porque nada mudou desde a última apuração.

Recomendação: manter o modelo atual (diário + ações + botão manual) e acrescentar apenas uma rede de segurança leve: ao abrir a tela, recalcular somente se o resultado estiver marcado como desatualizado (já funciona) **ou** se a última apuração tiver mais de 6 horas. Isso dá frescor sem multiplicar o custo por acesso.

## 2. Seta girando sem mudar o horário

Causa: a seta gira sempre que a tela está buscando dados, inclusive quando ela apenas relê o resultado já apurado (nesse caso o horário "Atualizado" não muda, porque nenhuma apuração nova rodou). E quando a apuração roda e não encontra diferença, o horário também não avança.

Correções:

- A seta só gira quando uma apuração de verdade está em andamento (botão manual, ou recálculo automático por estar desatualizado/vencido). Leitura simples do resultado não gira mais nada.
- Sempre que a apuração roda até o fim, o horário da última atualização passa a ser registrado, mesmo que o conteúdo não tenha mudado. Assim, se a seta girou, a hora muda.
- "Carregando…" continua apenas no primeiro acesso, sem apagar a lista existente.

## Detalhes técnicos

- `src/hooks/useDpPendencias.tsx`: expor um estado próprio de apuração (`isRefreshing`) separado do `isFetching` do React Query; disparar `dp-refresh-pendencias` quando `sujo_desde > apurado_em` **ou** `apurado_em` mais antigo que 6h; após a chamada, reler `dp_pendencias_apuracoes` e propagar o novo `apurado_em`.
- `dp-refresh-pendencias` / `private.dp_refresh_document_pending`: gravar `apurado_em = now()` ao concluir, inclusive sem alterações no conjunto de pendências.
- `src/components/dp/home/PendenciasCard.tsx`: `RefreshCw` com `animate-spin` e `disabled` ligados a `isRefreshing`, não a `isFetching`; manter `useStablePendencias` como está.
- Testes: atualizar `PendenciasCard.test.tsx` para cobrir "relendo sem apurar → sem giro" e "apurando → gira e horário avança".
