## Remover o PerfOverlay completamente

### Passos

1. **Desmontar do App**: remover import e uso de `<PerfOverlay />` em `src/App.tsx` (e/ou `src/main.tsx`, onde estiver montado).
2. **Deletar arquivos**: `src/components/dev/PerfOverlay.tsx` e `src/lib/perf.ts`.
3. **Limpar instrumentação residual**: remover chamadas a `markRouteStart`, `markRouteReady`, `recordRender`, `isPerfEnabled`, `subscribePerf`, `getRouteTimings`, `getRenderStats` (ou equivalentes exportados por `@/lib/perf`) em qualquer arquivo do projeto.
4. **Validar**: rodar `bunx tsgo --noEmit` para garantir que nenhum import quebrou.

Resultado: o chip "perf" nunca mais aparece, o atalho Ctrl+Shift+P deixa de existir e o bundle fica menor. Nenhum comportamento de negócio é afetado.