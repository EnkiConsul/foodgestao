## Corrigir erro "invalid input syntax for type uuid" ao criar categoria

### Causa
O `parent_id` (uuid nullable) está sendo enviado como string vazia `""` em vez de `null`, e o operador `??` usado no código só converte `null`/`undefined` — não cobre `""`.

### Mudanças

**`src/components/categories/CategoryFormDialog.tsx`**
1. Linha 92: `setParentId(defaultParentId || null)` (cobre `""`).
2. Linha 114: reforçar guarda — `if (!user?.id) return;`.
3. Linha 123 (update): `parent_id: parentId || null`.
4. Linha 157 (insert): `parent_id: parentId || null`.
5. Linha 215: `onValueChange={(v) => setParentId(!v || v === "__none__" ? null : v)}`.

**`src/pages/Categorias.tsx`**
6. Linha 97 (batch move): `const newParentId = !batchParentId || batchParentId === "__none__" ? null : batchParentId;`.

### Verificação
- Criar categoria raiz e subcategoria.
- Mover categorias em lote para "raiz".
- Confirmar nos logs que não há mais o erro de uuid vazio.
