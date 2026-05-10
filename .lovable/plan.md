## Objetivo

Permitir que o usuário, em **Configurações**, decida quais campos do diálogo de Lançamento devem ser **obrigatórios** ou **opcionais**, com valores aplicados automaticamente na criação/edição.

## Campos configuráveis

Os campos abaixo serão configuráveis (dois estados: `obrigatório` / `opcional`). Os demais (Tipo, Valor, Descrição, Data, Conta de origem, Status, e Conta de destino em transferências) permanecem **sempre obrigatórios**, pois sustentam a integridade financeira.

| Campo | Padrão |
|---|---|
| Categoria | opcional |
| Cliente/Fornecedor | opcional |
| Forma de pagamento | opcional |
| Data de vencimento | opcional |
| Data de pagamento | opcional |
| Observações | opcional |
| Anexos | opcional |

## UX em Configurações

Novo card **"Campos do Lançamento"** (ícone `ListChecks`) com uma linha por campo:

```text
[ Categoria              ]  ( ) Opcional   (•) Obrigatório
[ Cliente/Fornecedor     ]  (•) Opcional   ( ) Obrigatório
...
```

Usar `RadioGroup` (Opcional/Obrigatório) por linha. As alterações são salvas junto com o restante das configurações no botão **Salvar Configurações** já existente.

## UX no Lançamento

- O label dos campos obrigatórios deixa de ter "(opcional)" e ganha um asterisco vermelho.
- Validação no submit verifica os campos marcados como obrigatórios. Em caso de falha, mostra `toast.error("X é obrigatório")`.
- Atalho: se Anexos é obrigatório, exige pelo menos 1 anexo (existente ou novo).

## Detalhes técnicos

### 1. Banco

Migração adicionando coluna em `profiles`:

```sql
ALTER TABLE public.profiles
ADD COLUMN transaction_field_settings jsonb NOT NULL DEFAULT '{}'::jsonb;
```

Formato esperado:
```json
{
  "category": "required",
  "contact": "optional",
  "payment_method": "optional",
  "due_date": "optional",
  "payment_date": "optional",
  "notes": "optional",
  "attachments": "optional"
}
```

Sem alterações de RLS (políticas atuais de `profiles` já cobrem).

### 2. Hook compartilhado

Criar `src/hooks/useTransactionFieldSettings.tsx`:

- Usa `useQuery` para ler `profiles.transaction_field_settings` do usuário atual.
- Retorna helper `isRequired(field: TransactionField): boolean` com fallback `false` para chaves ausentes.
- Cache por user_id; invalidado quando Configurações for salva.

### 3. Configurações (`src/pages/Configuracoes.tsx`)

- Carregar `transaction_field_settings` do `profile`.
- Adicionar estado local `fieldSettings: Record<string, "required" | "optional">`.
- Renderizar novo `Card` com 7 linhas (`RadioGroup` por linha) acima do bloco de privacidade.
- No `handleSave`, incluir `transaction_field_settings: fieldSettings` no `update`.
- Após salvar, invalidar query `["transaction-field-settings"]`.

### 4. TransactionFormDialog

- Importar e usar `useTransactionFieldSettings()`.
- Para cada campo configurável: trocar o sufixo `(opcional)` no `<Label>` por `*` quando `isRequired(field)` for verdadeiro.
- Em `handleSubmit`, antes do insert/update, validar manualmente:
  - Categoria/Contato/Forma → checar string vazia.
  - Datas → checar string vazia.
  - Anexos → checar `existingAttachments.length - removed + attachmentFiles.length > 0`.
- Mostrar toast com nome do campo faltante.

## Não incluído

- Estado "oculto" para campos (somente obrigatório/opcional).
- Configurações por contexto PF/PJ separadas (uma única preferência por usuário).
- Customização dos campos sempre obrigatórios (Tipo, Valor, Descrição, Data, Conta, Status).