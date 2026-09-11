# Pendências: manter a última lista ao abrir o sistema + renomear o card

## Problema

Hoje o card guarda a última apuração apenas na memória da aba. Ao abrir o sistema
de manhã (página recarregada), não existe nada guardado, então o card aparece
vazio com "Carregando…" até a nova apuração terminar — exatamente o que você
pediu para não acontecer.

## O que vai mudar

1. **Última lista guardada no aparelho.** Ao concluir uma apuração, o card salva
   no navegador o retrato daquele momento (pendências, totais e horário) por
   empresa. Ao abrir o sistema, esse retrato aparece na hora, com a seta girando
   indicando que a atualização está em andamento; quando a nova apuração termina,
   a lista é trocada de uma vez.
2. **"Carregando…" só no primeiro acesso mesmo** — quando nunca houve apuração
   guardada para aquela empresa.
3. **Troca de empresa** limpa o quadro e usa o retrato daquela empresa, se houver.
4. **Renomear o card** de "Pendências do Sistema" para apenas "Pendências".

## Detalhes técnicos

- Novo módulo `src/lib/dp/pendencias-cache.ts`: leitura/escrita em `localStorage`
  com chave por empresa (`dp_pendencias_snapshot:<companyId>`), versão do formato,
  validade máxima (descartar retrato com mais de 7 dias) e proteção contra JSON
  inválido/quota.
- `Pendencia.icon` (componente Lucide) não é serializável: o snapshot grava os
  campos de dados e um `iconKey` derivado; na leitura, o ícone é resolvido por um
  mapa `tipo/iconKey → LucideIcon` no mesmo módulo, com `Bell` como fallback.
- `useStablePendencias` em `src/components/dp/home/PendenciasCard.tsx` passa a
  inicializar/hidratar a partir do cache (`ready: true` quando há snapshot) e a
  gravar o snapshot quando uma apuração é confirmada (`!isLoading && !isFetching`),
  incluindo `lastCalculatedAt`/`dataUpdatedAt` para o texto "Atualizado …".
- Título alterado no cabeçalho do card; ajustar a asserção correspondente em
  `src/components/dp/home/PendenciasCard.test.tsx`.
- Testes: hidratação a partir do cache, preservação durante `isFetching`,
  gravação após conclusão, limpeza ao trocar de empresa e cache corrompido.
- Verificação visual em 407×748 em `/dp` simulando primeiro carregamento com
  snapshot presente.
