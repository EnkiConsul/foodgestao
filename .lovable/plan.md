

# Reformulacao do Layout de Lancamentos

## Objetivo
Transformar a pagina de Lancamentos de um layout baseado em cards para um layout tabular inspirado na imagem de referencia, com navegacao por meses, saldo acumulado e painel lateral de filtros.

## Mudancas visuais principais

### 1. Barra de acoes (topo)
- Botoes "+ Adicionar" e "Transferencia" no canto esquerdo
- Dropdown "Ordenar por" (data, valor, descricao)
- Campo de busca textual no canto direito

### 2. Navegacao por mes
- Seletor de ano com setas de navegacao (ex: "< 2026 >")
- 12 abas de mes (Janeiro a Dezembro) com o mes atual destacado
- Campos opcionais de data inicio/fim para filtro customizado
- A query ao banco filtra pelo mes/ano selecionado

### 3. Tabela de lancamentos (area principal)
- Substituir os cards individuais por uma tabela usando os componentes `Table` ja existentes
- Colunas: Data | Descricao | Tipo (D/C) | Valor | Saldo acumulado
- Linha de destaque no topo: "SALDO ANTERIOR" mostrando o saldo acumulado ate o mes anterior
- Valores de receita em verde, despesa em vermelho
- Coluna de saldo calculada progressivamente (saldo anterior +/- cada lancamento)
- Botoes de acao por linha (editar, excluir) com icones pequenos

### 4. Painel lateral de filtros (desktop)
- Visivel apenas em telas maiores (hidden em mobile, acessivel via botao)
- Filtro por conta bancaria (select)
- Checkboxes de tipo: Credito / Debito
- Checkboxes de status: Realizado / Nao Realizado / Vencido / A Vencer
- Checkbox para Transferencias entre Contas
- Botoes "Filtrar" e "Limpar"

### 5. Cards de resumo
- Manter os 3 cards de Receitas/Despesas/Saldo, mas posiciona-los de forma mais compacta acima da tabela

## Detalhes tecnicos

### Arquivo modificado: `src/pages/Lancamentos.tsx`
Reescrita significativa do componente:

1. **Novos estados**:
   - `selectedYear` e `selectedMonth` para navegacao temporal
   - `filterAccount` para filtro por conta
   - `filterStatus` para checkboxes de status (realizado, pendente, etc.)
   - `sortBy` e `sortOrder` para ordenacao
   - `previousBalance` para o saldo anterior ao mes

2. **Query ao banco refatorada**:
   - Filtrar por `transaction_date` dentro do mes/ano selecionado
   - Query separada para calcular o saldo anterior (soma de todas as transacoes antes do mes selecionado)
   - Ordenacao por data ascendente (para calcular saldo progressivo corretamente)

3. **Calculo de saldo acumulado**:
   - Calcular `previousBalance` somando receitas e subtraindo despesas de meses anteriores
   - Para cada linha da tabela, calcular o saldo progressivo: saldo anterior + receitas - despesas ate aquela linha

4. **Layout com grid**:
   - Desktop: `grid grid-cols-[1fr_280px]` com tabela a esquerda e filtros a direita
   - Mobile: coluna unica, filtros acessiveis via Sheet/Drawer

### Componentes reutilizados
- `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell` (ja existem)
- `Checkbox` para filtros
- `Select` para conta e ordenacao
- `Sheet` para filtros em mobile
- `Tabs` para navegacao de meses

### Nenhuma mudanca no banco de dados
- Apenas mudancas de frontend/layout
- A query ja suporta os filtros necessarios (status, account_id, transaction_type, date range)

