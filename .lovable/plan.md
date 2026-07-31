## Problema confirmado

O DRE está somando custos e despesas em vez de subtrair. No print: Receita Líquida 6.226,39 e Custos 2.482,29, mas o Lucro Bruto aparece como 8.708,68 (6.226,39 + 2.482,29) e o EBITDA 12.757,42 (8.708,68 + 4.048,74) — resultando em margens impossíveis (139,9% e 204,9%).

Causa (verificada):
- A função de relatório `chart_accounts_report` devolve `saldo_proprio`/`saldo_consolidado` já **com sinal**: entradas positivas, saídas negativas. Ou seja, contas de custo, despesa e imposto chegam ao front com valor **negativo**.
- Em `src/components/relatorios/contabeis/DreReport.tsx` os totais são usados como se fossem valores positivos: `lucro_bruto = receita_liquida - custos`. Com `custos = -2.482,29`, a subtração vira soma (dupla negação). O mesmo acontece em impostos, despesas operacionais e financeiras.
- A tabela de metadados já tem a informação correta de sinal por natureza (`dre_sign`: receita = 1; custo/despesa/imposto = -1), mas ela não está sendo usada no cálculo.

Nenhuma mudança de dados é necessária — os lançamentos e vínculos contábeis estão corretos; o erro é só na montagem do DRE.

## Correção

1. **Normalizar os totais por natureza** em `DreReport.tsx`:
   - Calcular cada grupo como magnitude positiva, aplicando o sinal da natureza (`dre_sign`) vindo do relatório: receita = saldo; custo/despesa/imposto = saldo × (−1).
   - Com isso a cascata volta a funcionar corretamente: Receita Líquida = Receita − Impostos; Lucro Bruto = Receita Líquida − Custos; EBITDA = Lucro Bruto − Despesas Operacionais; Resultado = EBITDA − Despesas Financeiras.
   - Fallback: se a natureza não vier preenchida, usar o mapa padrão por código raiz (4 receita, 5 custo, 6 despesa operacional, 7 despesa financeira, 8 imposto).

2. **Linhas da DRE e KPIs**: manter as linhas de dedução exibidas como negativas (ex.: `− R$ 2.482,29`) e os subtotais/margens recalculados. As margens passarão a refletir valores reais (Lucro Bruto/Receita Líquida ≤ 100%).

3. **Exportação em PDF**: aplicar os mesmos totais corrigidos (o PDF usa o mesmo objeto de totais, então acompanha a correção automaticamente — apenas conferir os sinais das linhas de dedução).

4. **Detalhamento por Conta Contábil** (`AccountTreeTable.tsx`): apresentar as contas de resultado em magnitude por natureza (despesas em positivo, no padrão contábil), mantendo o `% AV` sobre a Receita Líquida. A árvore continua clicável para o razão.

5. **Validação**: abrir `/relatorios/contabeis` com a empresa Raptor no mesmo período do print e conferir que Lucro Bruto = Receita Líquida − Custos e que as margens ficam coerentes; conferir também o PDF exportado.

### Detalhes técnicos

Arquivos alterados: `src/components/relatorios/contabeis/DreReport.tsx` (função `totalByNature` → passa a aplicar o sinal) e `src/components/relatorios/contabeis/AccountTreeTable.tsx` (exibição por magnitude). Sem migração de banco e sem alteração na RPC.
