## Estado atual (já implementado na conversa anterior)

Verificado em `src/hooks/useDpPendencias.tsx` e `src/components/dp/home/PendenciasCard.tsx`:

- Hook retorna sempre `atrasoDias: number` (positivo = atrasado, 0 = hoje, negativo = futuro).
- Card já renderiza os três badges no `map()` de pendências e no diálogo de detalhes:
  - `atrasoDias > 0` → badge vermelho `"Atrasado Xd"`
  - `atrasoDias === 0` → badge âmbar `"Vence hoje"`
  - `atrasoDias < 0` → badge verde `"Vence em Xd"`

Ou seja, o comportamento pedido já está no código atualmente publicado no preview. Se você ainda vê pendências sem o dia, é cache do navegador/Service Worker.

## Plano

Nenhuma alteração de código. Ações operacionais:

1. Force refresh no preview em `/dp` (Ctrl+F5) ou abra `?sw=off` uma vez para limpar o SW e recarregar.
2. Confirmar visualmente que as pendências SECHSEG aparecem com o badge `"Atrasado 81d"` (vermelho).

Se após o refresh ainda não aparecer o badge, abrir novo plano com screenshot do card renderizado + saída do console para investigar por que os itens SECHSEG específicos estão vindo com `atrasoDias` diferente do esperado (ex.: ano/mês da última negociação já cobrindo o vigente).