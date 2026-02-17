

# Simplificar Status para 3: Pago, A Vencer, Atrasado

## Resumo

Reduzir os status exibidos de 7 (Realizado, Pendente, Em dia, Vence em breve, Atrasado, Pago, Parcial) para apenas **3 status universais**: **Pago**, **A Vencer**, **Atrasado**.

## Logica Unificada

| Situacao | Status Exibido | Cor |
|---|---|---|
| Transacao confirmada sem vencimento | **Pago** | verde (default) |
| Transacao com vencimento e amount_paid >= amount | **Pago** | verde (default) |
| Transacao pendente sem vencimento | **A Vencer** | secondary |
| Transacao com vencimento, nao paga, nao atrasada | **A Vencer** | secondary |
| Transacao com vencimento, due_date no passado, nao paga | **Atrasado** | destructive |
| Transacao pendente sem vencimento e com data no passado | **Atrasado** | destructive |

Resumindo:
- "Parcial" e "Vence em breve" e "Em dia" viram **A Vencer** (se nao esta totalmente pago e nao esta atrasado)
- "Realizado" e "Confirmado" viram **Pago**
- "Pendente" sem vencimento futuro vira **A Vencer**

## Detalhes Tecnicos

### Arquivo: `src/pages/Lancamentos.tsx`

1. **`computeBillStatus`**: Simplificar para retornar apenas "pago", "a_vencer" ou "atrasado". Aplicar para TODAS as transacoes (nao apenas as com due_date).

2. **`billStatusConfig`**: Reduzir para 3 entradas:
   - `pago`: label "Pago", variant "default"
   - `a_vencer`: label "A Vencer", variant "secondary"
   - `atrasado`: label "Atrasado", variant "destructive"

3. **Coluna Status na tabela**: Remover a bifurcacao entre transacoes com/sem due_date. Todas usam o mesmo `computeBillStatus`.

4. **Filtros rapidos "Status"**: Trocar "Realizado"/"Pendente" por "Pago", "A Vencer", "Atrasado" com 3 checkboxes.

5. **Variaveis de estado**: Substituir `filterRealizado`/`filterPendente` por `filterPago`, `filterAVencer`, `filterAtrasado`.

6. **Logica de filtragem no useMemo**: Usar o novo status computado para filtrar.

7. **Linha "SALDO ANTERIOR REALIZADO"**: Renomear para "SALDO ANTERIOR".

8. **Exportacao CSV**: Usar o novo status unificado.

9. **Tipo BillStatus**: Atualizar o tipo local para refletir os 3 novos valores (ou criar um novo tipo `TransactionDisplayStatus`).

