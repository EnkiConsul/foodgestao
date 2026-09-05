# Deixar a main verde antes de qualquer publicação

Rodei agora as etapas obrigatórias. Três estão vermelhas e nenhuma publicação deve sair até que fiquem verdes.

## Diagnóstico (medido nesta sessão)

| Etapa | Estado | O que está errado |
| --- | --- | --- |
| Checagem de tipos (strict) | Vermelho | 3 erros, todos em `src/lib/calc-expression.ts` (teto é 0) |
| Padrão de código (ESLint) | Vermelho | 0 erros, mas 1476 avisos contra teto de 1471 — subiu 5 |
| Testes | Vermelho | 2 falhas em `src/test/perf/dre-performance.test.tsx` |
| Migrações, config de funções, freeze | Verde | sem pendências |
| `deno check` das funções de servidor | Não concluído | a checagem passa de 10 minutos aqui; roda no CI |

Detalhes das falhas:

1. `calc-expression.ts` linha 93: a variável `left` é inferida como `any` porque é usada dentro da própria expressão que a redefine, e o compilador ainda a considera possivelmente nula nas linhas 93 e 95.
2. Os 5 avisos novos vieram dos arquivos criados no bloco de segurança das funções de servidor (utilitários compartilhados e as duas suítes de teste de autorização).
3. O teste de desempenho do DRE espera render inicial abaixo de 3000 ms e mediu 3220 ms; o segundo caso estoura o limite de 5000 ms do próprio teste. É lentidão de ambiente/limite apertado, não erro de cálculo — precisa ser confirmado antes de mexer no limite.

## Correções

### 1. Erros de tipo em `calc-expression.ts`
Anotar explicitamente o acumulador (`let left: number | null`) e o resultado intermediário como `number`, com a verificação de nulo feita uma única vez antes do laço, de forma que o tipo pare de ser circular. Comportamento do cálculo permanece idêntico — a suíte `src/test/unit/calcExpression.test.ts` cobre e deve continuar passando.

### 2. Avisos do ESLint de volta ao teto
Tipar os pontos que geraram os 5 avisos novos nos utilitários e testes de autorização (trocar `any` por tipos reais ou `unknown` com validação). Depois de corrigidos, a contagem volta a 1471 e o teto continua onde está — sem aumentar o teto em nenhuma hipótese.

### 3. Testes de desempenho do DRE
Medir três execuções seguidas isoladas para separar variação de ambiente de regressão real:
- se o tempo se mantiver acima de 3000 ms de forma consistente, investigar o render (memoização das linhas hierárquicas) e otimizar;
- se for variação de máquina, ajustar o teste para medir o que importa (comparação entre primeiro render e re-render, em vez de um número absoluto) e dar folga de tempo ao segundo caso, mantendo a proteção contra perda de memoização.

Em nenhum dos casos o teste será removido ou marcado como ignorado.

### 4. Revalidação
Ao final: checagem de tipos, ESLint, suíte completa e build. Só então a main é considerada verde.

## Observação sobre o `deno check`
Essa etapa não termina dentro do limite de tempo desta sessão. Ela continua obrigatória no CI, e a lista de exceções (`scripts/deno-check.baseline.json`, hoje com 3 funções) só pode encolher. Se o CI reprovar nela, trato como item separado.

## Notas técnicas
- Arquivos previstos: `src/lib/calc-expression.ts`, os arquivos novos em `supabase/functions/_shared/` e `src/test/functions/`, e `src/test/perf/dre-performance.test.tsx`.
- Sem migração de banco, sem alteração de tela, sem mudança em regras de negócio.
- Tetos de `scripts/quality-ceilings.json` permanecem em 0/0/1471.
