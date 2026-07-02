## Objetivo

Unificar o cadastro rápido de **Categoria** e **Contato** dentro do fluxo de "Importar Extrato" para que use exatamente o mesmo formulário (mesmos campos, mesmo layout, mesmas validações) que já existe nas telas de Categorias e Clientes/Fornecedores.

## Situação atual

Em `src/components/transactions/ImportStatementDialog.tsx` os cadastros rápidos usam Dialogs próprios e simplificados:
- **Categoria rápida**: só pede *Nome* (tipo é herdado da linha). Sem cor, sem categoria pai, sem visibilidade (PF / empresas).
- **Contato rápido**: só pede *Nome* e *Tipo* (cliente/fornecedor/ambos). Sem documento, e-mail, telefone, endereço, observações, nem vinculação PF/empresas.

Isso é inconsistente com:
- `src/components/categories/CategoryFormDialog.tsx` — formulário completo com tipo, categoria pai, cor, visibilidade PF e por empresa.
- `src/components/contacts/ContactFormDialog.tsx` — formulário completo com documento, e-mail, telefone, endereço, observações e vinculação PF/empresas.

## Mudanças propostas

1. **Reutilizar os componentes existentes** em `ImportStatementDialog.tsx`:
   - Remover o bloco de "Quick create Category" e substituir por `<CategoryFormDialog />`, passando:
     - `defaultType` = tipo da linha (receita/despesa) da qual o usuário clicou "+ Nova".
     - `onSaved(newId)` → adicionar a nova categoria à lista local `categories` (recarregar via a mesma RPC `get_accessible_categories`) e atribuir `category_id = newId` na linha de origem.
   - Remover o bloco de "Quick create Contact" e substituir por `<ContactFormDialog />`, passando:
     - `onSaved(newId)` → recarregar contatos e atribuir `contact_id = newId` na linha de origem.
   - Como o nome já foi digitado pelo usuário na busca da linha, propagar esse nome como valor inicial:
     - Categoria: adicionar prop opcional `defaultName?: string` em `CategoryFormDialog` (retrocompatível) para pré-preencher o campo Nome.
     - Contato: adicionar prop opcional `defaultName?: string` em `ContactFormDialog` na mesma linha.

2. **Estado local do import** deixa de guardar `quickCat`/`quickContact` como formulário e passa a guardar apenas `{ rowIdx, defaultName, defaultType }` para saber qual linha atualizar quando o formulário completo salvar.

3. **Descartar código morto**: função `createQuickCategory`, `createQuickContact`, estados `savingQuick` e imports não usados (`Textarea` se ficar órfão) são removidos.

4. **Sem mudanças de banco de dados** e sem alteração de regras/valores default: apenas UI e fluxo de wiring.

## Fora do escopo

- Nenhuma alteração nas telas Categorias, Contatos, Lançamentos ou nas RPCs.
- Nenhuma mudança de estilo/design tokens.
- Manter o comportamento atual de sugestões automáticas e de duplicatas.

## Detalhe técnico (para referência)

- Após `onSaved(newId)`, refetch de categorias via `supabase.rpc("get_accessible_categories", ...)` e de contatos via `supabase.from("contacts").select(...)` — as mesmas chamadas já feitas no `useEffect` de abertura do import.
- O `AlertDialog` de duplicatas e o Dialog principal continuam iguais; os formulários completos abrem por cima em portal próprio (Radix stacking já validado no turno anterior).
