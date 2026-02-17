

## Adicionar Campos de Recorrencia ao Formulario de Lancamento

### O que sera feito
Adicionar campos opcionais ao formulario de lancamento para configurar recorrencia, permitindo que o usuario marque um lancamento como recorrente e defina a frequencia e data de fim.

### Campos a serem adicionados
- **Switch "Lancamento recorrente"** - ativa/desativa a secao de recorrencia
- **Select "Frequencia"** - opcoes: Diario, Semanal, Quinzenal, Mensal, Bimestral, Trimestral, Semestral, Anual
- **Input date "Data final da recorrencia" (opcional)** - ate quando a recorrencia sera criada

Os campos de recorrencia aparecerao apenas quando o switch estiver ativado, usando uma animacao suave de expansao.

### Alteracoes tecnicas

**Arquivo: `src/components/transactions/TransactionFormDialog.tsx`**

1. **Novos estados**:
   - `isRecurring: boolean` (default `false`)
   - `recurrenceType: string` (default `"mensal"`)
   - `recurrenceEndDate: string` (default `""`)

2. **Importacoes adicionais**:
   - `Switch` de `@/components/ui/switch`

3. **Posicao no formulario**: Os campos de recorrencia serao inseridos apos o campo "Data de vencimento" e antes do campo "Conta", agrupados visualmente

4. **Payload de submit**: Incluir `is_recurring`, `recurrence_type` e `recurrence_end_date` no payload enviado ao banco

5. **Interface `EditableTransaction`**: Adicionar `is_recurring`, `recurrence_type` e `recurrence_end_date` para suportar edicao

6. **`resetForm`**: Limpar os novos campos (`isRecurring = false`, `recurrenceType = "mensal"`, `recurrenceEndDate = ""`)

7. **Populate on edit**: Preencher os campos ao editar um lancamento recorrente existente

### Estrutura visual no formulario
```
[Switch] Lancamento recorrente

  (se ativado:)
  Frequencia:        [Select: Mensal v]
  Data final:        [____/____/____] (opcional)
```

### Observacao
- Nao sera implementada neste momento a logica de geracao automatica de parcelas/lancamentos futuros, apenas o cadastro dos campos
- A tabela `transactions` ja possui as colunas `is_recurring`, `recurrence_type` e `recurrence_end_date`, portanto nenhuma migracao sera necessaria

