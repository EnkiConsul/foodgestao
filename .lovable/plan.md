
# Inserir Totais de Receitas e Despesas no Final da Tabela

## O que sera feito

Adicionar uma linha de rodape (footer) na tabela de lancamentos exibindo o total de Receitas e o total de Despesas do periodo filtrado, usando o componente `TableFooter` ja disponivel.

## Como ficara visualmente

A tabela tera uma linha final com fundo destacado contendo:
- **Total Receitas**: valor em verde, alinhado a direita
- **Total Despesas**: valor em vermelho, alinhado a direita
- **Saldo do Periodo** (receitas - despesas): valor colorido conforme positivo/negativo

## Detalhes Tecnicos

### Arquivo: `src/pages/Lancamentos.tsx`

1. **Calcular totais sobre todas as displayRows** (nao apenas confirmadas): Adicionar um novo `useMemo` ou ajustar o existente `totals` para somar receitas e despesas de TODAS as linhas exibidas (independente de status), ja que agora o sistema usa status unificados.

2. **Adicionar `TableFooter`** apos o `TableBody` (linha ~717), com uma ou duas linhas:
   - Uma `TableRow` com celulas mostrando:
     - Label "TOTAIS" com `colSpan` cobrindo as primeiras colunas
     - Valor total de receitas (verde)
     - Valor total de despesas (vermelho)  
     - Saldo do periodo na coluna de saldo

3. **Import**: O componente `TableFooter` ja esta exportado pelo `src/components/ui/table.tsx` -- basta adicioná-lo ao import existente.

4. **Condicional**: O footer so aparece quando `displayRows.length > 0`.
