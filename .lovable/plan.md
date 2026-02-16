

# Migrar funcionalidades de "Contas a Pagar" para "Lancamentos"

## Objetivo
Unificar os modulos "Contas a Pagar" e "Lancamentos" em uma unica tela, adicionando uma segunda aba dentro da pagina de Lancamentos para gerenciar contas (bills). Apos a migracao, a rota `/contas` sera removida e todos os links atualizados.

## Abordagem

A pagina de Lancamentos ganhara um sistema de abas (Tabs) com duas secoes:
- **Lancamentos** -- conteudo atual da pagina (transacoes realizadas)
- **Contas a Pagar/Receber** -- todo o conteudo que hoje esta na pagina `Contas.tsx` (bills com filtros, cards de resumo, lista, pagamento parcial, barra de progresso)

## Etapas de implementacao

### 1. Adicionar Tabs na pagina Lancamentos
- Importar `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` do shadcn/ui
- Envolver o conteudo atual em `TabsContent value="lancamentos"`
- Criar `TabsContent value="contas"` com todo o conteudo migrado de `Contas.tsx`

### 2. Migrar logica de Contas para dentro de Lancamentos
- Mover toda a logica de estado, fetch, filtros, computeStatus, totais e a listagem de bills diretamente para dentro do `TabsContent value="contas"`, extraindo em um componente interno ou inline
- Importar `BillFormDialog` e `PaymentDialog` na pagina Lancamentos
- Manter os mesmos filtros (busca, tipo, status), cards de resumo (A Pagar, A Receber, Atrasadas) e a listagem com badges, barra de progresso e acoes (pagamento, exclusao)

### 3. Remover a rota e pagina /contas
- Remover a rota `/contas` de `App.tsx`
- Remover a importacao de `Contas` em `App.tsx`
- O arquivo `src/pages/Contas.tsx` pode ser mantido ou removido (preferivel remover para manter o projeto limpo)

### 4. Atualizar navegacao
- **AppSidebar.tsx**: Remover o item "Contas a Pagar" da lista `mainItems`
- **BottomNav.tsx**: Substituir o item "Contas a Pagar" (url `/contas`) por outro item relevante ou remove-lo, mantendo 5 itens no maximo

### 5. Adicionar botao "Nova Conta" na aba de contas
- O FAB mobile e o botao desktop abrirao `BillFormDialog` quando a aba "Contas" estiver ativa, e `TransactionFormDialog` quando estiver em "Lancamentos"

## Detalhes tecnicos

### Estrutura da pagina Lancamentos apos a migracao

```text
Lancamentos.tsx
+-- Tabs (defaultValue="lancamentos")
|   +-- TabsList
|   |   +-- TabsTrigger "Lancamentos"
|   |   +-- TabsTrigger "Contas a Pagar"
|   +-- TabsContent "lancamentos"
|   |   +-- (conteudo atual: navegacao mensal, filtros, tabela, saldo)
|   +-- TabsContent "contas"
|       +-- (conteudo migrado: cards resumo, filtros, lista de bills)
+-- BillFormDialog
+-- PaymentDialog
+-- TransactionFormDialog
+-- AlertDialog (exclusao)
```

### Arquivos modificados
- `src/pages/Lancamentos.tsx` -- adicionar Tabs e integrar bills
- `src/App.tsx` -- remover rota `/contas` e import
- `src/components/layout/AppSidebar.tsx` -- remover item "Contas a Pagar"
- `src/components/layout/BottomNav.tsx` -- remover/substituir item "Contas a Pagar"

### Arquivos removidos
- `src/pages/Contas.tsx`

### Nenhuma alteracao no banco de dados
- A tabela `bills` e todas as RLS policies permanecem inalteradas
- Os componentes `BillFormDialog` e `PaymentDialog` continuam funcionando sem modificacao

