# Acelerar o Dashboard ao trocar de empresa

## O que está acontecendo

A demora não vem do banco: as empresas têm poucos dados (a maior tem 100 lançamentos e 68 categorias), e as funções de leitura de contas/categorias são simples. O atraso é de comportamento do app:

1. Ao trocar de empresa, todo o cache de consultas financeiras é **apagado** (`removeQueries` em `useCompanyContext`). Como cada consulta já é identificada por empresa, apagar tudo não aumenta a segurança — só obriga a buscar tudo de novo do zero a cada troca, inclusive ao voltar para a empresa anterior.
2. O Dashboard não mostra estado de carregamento: enquanto os dados não chegam, ele renderiza cartões e gráficos com valores zerados. Visualmente parece "travado" ou errado, o que amplifica a sensação de lentidão.
3. O widget de projeção de fluxo de caixa faz 4 chamadas **em sequência** (contas → lançamentos → cartões → faturas) e repete a busca de contas que o próprio Dashboard já fez, somando idas e voltas desnecessárias.
4. Nada é pré-carregado no momento em que a empresa é escolhida: a busca só começa depois que a tela re-renderiza.

## O que será feito

**1. Preservar o cache por empresa**
- Trocar o "apagar tudo" por: cancelar as buscas em andamento do escopo anterior e apenas invalidar (não descartar) o cache. Os dados de cada empresa continuam separados pelas chaves de consulta.
- Aumentar o tempo de retenção em memória dessas consultas, para que voltar a uma empresa já visitada seja instantâneo (dados aparecem na hora e atualizam em segundo plano).

**2. Pré-carregar ao escolher a empresa**
- No seletor de empresa, disparar o pré-carregamento das consultas do Dashboard (lançamentos do período, categorias, contas) assim que a nova empresa é selecionada, em paralelo com a navegação/re-render.

**3. Estados de carregamento reais no Dashboard**
- Skeletons nos cartões de totais, nos gráficos e nas listas enquanto a primeira carga do novo escopo não termina — em vez de mostrar zeros.
- Indicador discreto de atualização quando há dados em cache sendo revalidados.

**4. Reduzir idas e voltas**
- Na projeção de fluxo de caixa: executar as buscas independentes em paralelo e reutilizar a mesma consulta de contas do Dashboard (mesma chave de cache), eliminando a chamada duplicada.

## Detalhes técnicos

- `src/hooks/useCompanyContext.tsx`: no efeito de mudança de escopo, substituir `queryClient.removeQueries({ predicate: keyMatchesFinancial })` por `cancelQueries` + `invalidateQueries` com o mesmo predicado; manter a lista `FINANCIAL_KEY_PREFIXES`.
- `src/App.tsx`: `gcTime` maior (ex. 15 min) para consultas financeiras/DP, mantendo `staleTime` atual.
- `src/components/layout/ContextSelector.tsx`: em `handleChange`, `queryClient.prefetchQuery` das chaves `dashboard-transactions` / `dashboard-categories` / `dashboard-accounts` do novo `companyId` (funções de busca extraídas para um módulo compartilhado com o Dashboard para evitar duplicação).
- `src/pages/Dashboard.tsx`: expor `isPending`/`isFetching` das três consultas e renderizar `Skeleton` nos blocos correspondentes.
- `src/hooks/useCashFlowProjection.tsx`: `Promise.all` para lançamentos + cartões; contas via `queryClient.ensureQueryData` na chave `dashboard-accounts`; faturas seguem dependentes dos cartões.
- Sem mudança de banco de dados, RLS ou regras de negócio; escopo por empresa permanece idêntico.

## Verificação

- Typecheck e suíte de testes.
- Medição no preview (Playwright): tempo entre a troca de empresa e os números aparecerem, antes e depois; confirmar que a segunda visita a uma empresa já vista é imediata e que nenhum dado de outra empresa aparece durante a transição.
