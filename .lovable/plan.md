## O que entendi

Você quer um **relatório de Fluxo de Caixa em formato de tabela/matriz**, no estilo do modelo anexo (Contas Online):

- Linhas = **categorias em hierarquia numerada** (1., 1.9., 1.9.1., 2.3.1.1.4.), exatamente na mesma ordem e nomes já cadastrados em Categorias.
- Colunas = **meses do período** (JAN, FEV, MAR, ABR...) + **MÉDIA** + **TOTAL**.
- Dois blocos: **Receitas (Entradas)** e **Despesas (Saídas)**, cada um com o subtotal no cabeçalho colorido, e uma linha final de **SALDO** (Entradas − Saídas) por mês.
- Valores vindos dos **lançamentos reais** do módulo financeiro, respeitando empresa/contexto (PF/PJ).
- Filtros escolhidos pelo usuário: **ano, mês inicial, mês final e base da data (Vencimento ou Pagamento)**.
- Isso é uma **nova página em Relatórios** (`/relatorios/fluxo-caixa`); a página atual `/fluxo-caixa` com o gráfico continua intacta.

## Layout proposto (UX/UI)

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ Fluxo de Caixa                            [Exportar CSV] [Imprimir/PDF]    │
│ Relatório gerencial por categoria                                          │
├────────────────────────────────────────────────────────────────────────────┤
│ BARRA STICKY: ‹ 2026 ›  [Janeiro ▾] [Abril ▾]  [Base: Pagamento ▾]         │
│                              [Só com movimento ⌵] [Expandir/Recolher]      │
├────────────────────────────────────────────────────────────────────────────┤
│ KPIs: Entradas | Saídas | Saldo do período | Média mensal                   │
├────────────────────────────────────────────────────────────────────────────┤
│ Categoria (col. fixa)          JAN     FEV     MAR     ABR   MÉDIA   TOTAL │
│ ▸ ENTRADAS  (faixa verde)   234.259  275.538 336.948 290.330 ...    ...    │
│    1. RECEITAS                 ...                                        │
│      1.9. SALDO DEPÓSITOS      ...                                        │
│        1.9.1. Depósito Cli.    ...                                        │
│ ▸ SAÍDAS   (faixa vermelha) ...                                           │
│    2.3.1.1.4. Aluguel Sede     ...                                        │
│ ═ SALDO (faixa destacada)    0,01  1.584,31  799,79 19.167,19 ...         │
└────────────────────────────────────────────────────────────────────────────┘
```

Decisões de design:
- **Coluna de categoria fixa (sticky left)** e cabeçalho de meses fixo (sticky top) — a tabela rola horizontalmente sem perder referência.
- **Números tabulares alinhados à direita**, zeros exibidos como `–` (igual ao modelo), verde para entradas e vermelho para saídas via tokens semânticos (`text-success` / `text-destructive`), nunca cores fixas.
- **Hierarquia**: numeração + indentação de 16px/nível (mesmo padrão de `src/lib/categories/display.ts`), com chevron para expandir/recolher ramos; níveis pais em peso maior.
- **Zebra + hover de linha inteira** e realce da linha ao clicar (como o destaque amarelo do modelo).
- **Drill-down**: clicar em um valor de mês abre um painel lateral com os lançamentos daquela categoria/mês.
- **Mobile**: a matriz vira navegação por **um mês por vez** (seletor de mês no topo) com lista hierárquica recolhível e barra de proporção — sem scroll horizontal sofrido.
- Respeita o **modo privacidade** (`usePrivacy`) e mantém a densidade compacta já usada no sistema.

## Implementação técnica

1. **Nova página** `src/pages/relatorios/FluxoCaixa.tsx` + rota `/relatorios/fluxo-caixa` em `App.tsx` (lazy) e entradas em `src/config/mobileNav.tsx` (desktop e mobile, grupo Relatórios).
2. **Dados**: query paginada em `transactions` com `applyFinancialScope` (nunca `.eq('user_id')`), filtrando por `status != cancelado` e pelo intervalo da data escolhida (`due_date` ou `payment_date` conforme o filtro). Categorias via `get_accessible_categories` (mesma fonte de `/categorias`) para garantir nomes/ordem idênticos.
3. **Motor de cálculo** em `src/lib/relatorios/fluxoCaixaMatriz.ts` (puro, testável):
   - monta a árvore com `buildCategoryTree` e gera o índice numerado;
   - soma por (categoria, mês) usando o tipo efetivo do lançamento (entrada/saída; parcelamento pela direção);
   - **propaga totais dos filhos para os pais** (acumulado, como no modelo), calcula MÉDIA e TOTAL, e a linha SALDO;
   - trata "Sem categoria".
4. **Testes unitários** (vitest) do motor: propagação de pais, base de data, parcelados, meses vazios.
5. **Exportações**: CSV UTF‑8 com BOM e `;` (padrão do projeto) e impressão/PDF da matriz.

Sem alterações de banco de dados e sem mexer nas funcionalidades existentes.
