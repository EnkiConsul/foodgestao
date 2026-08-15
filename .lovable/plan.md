# Extrato de Conciliação (comparativo banco x plataforma)

Novo relatório acionado por um botão **Extrato de Conciliação** na página de conciliação, inspirado no modelo Kamino: cabeçalho com o período, faixa de indicadores e duas colunas comparando o extrato do banco com o que foi lançado na plataforma.

## O que o cliente vê

1. Botão **Extrato de Conciliação** no topo de `/contas-bancarias/conciliacao` (ao lado de Sincronizar / Auditoria) e também no final do fluxo, após confirmar lançamentos (aparece no rodapé de ações em lote: "Conciliação concluída — ver extrato").
2. Abre um relatório com:
   - **Cabeçalho**: nome da conta financeira / banco, período (data inicial e final dos lançamentos) e data de geração.
   - **Faixa de indicadores** (4 cartões, como no modelo):
     - Extrato — Créditos (total + nº de lançamentos)
     - Extrato — Débitos (total + nº de lançamentos)
     - Créditos sem Conciliação (em vermelho quando > 0)
     - Débitos sem Conciliação
     - Mais uma linha de fechamento: total do extrato x total conciliado na plataforma x **diferença**.
   - **Comparativo lado a lado**: à esquerda o lançamento do banco (data, descrição original, valor); à direita o lançamento correspondente na plataforma (descrição final, categoria, contato, conta financeira, forma de pagamento) ou o selo "Sem conciliação" / "Ignorado".
   - **Seção de divergências**: lista apenas os itens pendentes/ignorados, para conferência rápida.
3. Filtros no relatório: período (data inicial/final), conexão/conta e status (todos, conciliados, sem conciliação).
4. Exportação: botão **Imprimir / Salvar PDF** e **Excel (.xlsx)**, usando os utilitários já existentes de exportação de relatórios.

## Regras de dados

- Lado banco = `pluggy_staging_transactions` do período (todos os status, inclusive `duplicate`).
- Lado plataforma = `transactions` vinculadas via `pluggy_staging_transaction_id` (ou `matched_transaction_id`), trazendo categoria, contato, conta e forma de pagamento.
- Créditos = valores positivos; Débitos = negativos; "sem conciliação" = status `pending` ou `duplicate` sem lançamento vinculado.
- Diferença = (total do extrato) − (total conciliado). Fica destacada em vermelho quando diferente de zero.
- Respeita o escopo multiempresa e o modo privacidade (valores mascarados na tela, mas visíveis nos arquivos exportados, como no padrão atual).

## Detalhes técnicos

- `src/lib/conciliacao/extrato.ts` (puro, testável): monta o modelo do extrato a partir das linhas de staging + transações vinculadas (agrupamento por dia, totais, contagens, divergências).
- `src/hooks/useExtratoConciliacao.tsx`: busca paginada das linhas de staging do período e das transações vinculadas.
- `src/pages/ExtratoConciliacao.tsx` em `/contas-bancarias/conciliacao/extrato`, com querystring de conta/conexão e período; rota adicionada no `App`.
- Exportação reutilizando `openPrintable` e `downloadXlsx` de `src/lib/relatorios/fluxoCaixaExport.ts` (mesma identidade visual 360°FOOD).
- Testes unitários dos totais e da classificação de divergências em `src/test/unit/`.
