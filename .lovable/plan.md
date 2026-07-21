## Diagnóstico (confirmado via Playwright na produção)

O domínio `gestor360food.com` carrega o HTML, mas o React nunca monta (`<div id="root">` fica vazio). O runtime lança:

```
ReferenceError: Cannot access '_' before initialization
  at /assets/charts-CPXksVZQ.js:9:16763
```

Isto é um erro clássico de **Temporal Dead Zone causado por dependência circular** entre chunks criados pelo `manualChunks` do Vite. Em `vite.config.ts` (linha 63), agrupamos `recharts` + `d3-*` num chunk `"charts"`, mas `recharts` depende internamente de módulos que ficam em outros chunks (ex.: `react-vendor`, `react-is` fora do padrão `/d3-*/`), gerando referências cíclicas resolvidas antes da inicialização em produção. O bundle de dev não sofre porque Vite serve ESM sem manual chunking.

O preview de dev funciona porque não passa pelo Rollup manualChunks — só a build de produção quebra, o que bate exatamente com o sintoma: preview OK, domínio publicado branco.

## Correção proposta

### `vite.config.ts` — remover o chunk manual `"charts"`

Deixar Rollup decidir automaticamente onde colocar `recharts` e `d3-*`. Isso elimina a fronteira de chunk que hoje racha o grafo de dependências e causa o TDZ.

Alterar o bloco `manualChunks(id)` para remover **apenas** a linha:

```ts
if (id.includes("/recharts/") || id.match(/\/d3-[^/]+\//)) return "charts";
```

Os demais chunks (`pdf`, `radix`, `supabase`, `forms`, `react-vendor`) permanecem — eles não apresentam a mesma característica circular e ajudam no cache.

### Verificação

Após a alteração, republicar (`Publish → Update`) e:

1. Confirmar via `curl -s https://gestor360food.com | grep -o 'src="/assets/[^"]*"'` que o chunk `charts-*.js` não existe mais.
2. Rodar Playwright headless em `https://gestor360food.com/` e checar que `document.getElementById('root').innerHTML.length > 0` e que não há `pageerror`.
3. Abrir a Landing Page e o Dashboard (que usam recharts) para garantir que os gráficos ainda montam.

## Por que não outras hipóteses

- **Cache do Service Worker**: o HTML servido é fresco e referencia hash novo (`index-BdWIXy5h.js` retorna 200). O erro aparece já na primeira execução do bundle, antes de qualquer SW ativar. Não é SW.
- **DNS / hospedagem**: bundle serve com 200, HTML íntegro, headers de SPA fallback OK. Não é infra.
- **Publicação incompleta**: o hash do JS bate com o servido, ou seja, o deploy chegou — só está quebrado em runtime.

## Fora de escopo

Nenhuma outra mudança de lógica ou UI. A correção é 1 linha em `vite.config.ts` seguida de re-publicação.
