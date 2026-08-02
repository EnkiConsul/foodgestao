## Objetivo

Adicionar, na tela **Categorias**, um botão (switch) **Permitir lançamentos** por categoria. Ativo: a categoria aparece e recebe lançamentos. Inativo: não aparece nos seletores de lançamento nem na conciliação bancária.

## Situação atual (verificada)

- A tabela `categories` já tem a coluna `is_active` (boolean, default `true`), hoje sem nenhum controle na interface.
- A função de banco `get_accessible_categories` (usada pelo formulário de lançamentos) já filtra `is_active = true`.
- A conciliação bancária (`src/pages/ConciliacaoPluggy.tsx`) já filtra `is_active = true` na busca de categorias.
- A tela `/categorias` lista as categorias sem filtrar `is_active`, então serve para gerenciar ativas e inativas.

Ou seja: o bloqueio já existe no back-end; falta o controle visual e a coerência de exibição.

## O que será feito

1. **Switch na linha da categoria** (`CategoryRow.tsx` desktop e `CategoryMobileRow.tsx`)
   - Novo controle com `aria-label` "Permitir lançamentos em {nome}" e tooltip explicativa.
   - Atualização otimista + `toast` de confirmação; erro reverte o estado.
   - Categorias inativas ficam com nome esmaecido e badge **"Sem lançamentos"**.

2. **Persistência e regra de hierarquia** (`src/pages/Categorias.tsx`)
   - `handleToggleAllowTransactions(id, value)` grava `is_active` e recarrega a lista.
   - Ao desativar uma categoria com filhas, perguntar em diálogo se deve aplicar às subcategorias (evita filha ativa sob pai inativo, que hoje some do seletor junto com o pai).

3. **Ações em lote**
   - Em `BatchActionBar.tsx`: "Permitir lançamentos" / "Bloquear lançamentos" para a seleção atual.

4. **Formulário da categoria** (`CategoryFormDialog.tsx`)
   - Campo "Permitir lançamentos" (default ativo) ao criar/editar, alinhado ao switch da listagem.
   - O seletor de categoria-pai continua listando inativas (para manter a estrutura), sinalizando o status.

5. **Filtro na listagem**
   - Filtro rápido: Todas / Somente com lançamentos / Somente bloqueadas.

6. **Reforço no banco (opcional, recomendado)**
   - Trigger em `transactions` que rejeita `INSERT`/`UPDATE` apontando para categoria com `is_active = false`, garantindo a regra também via importações e integrações.

## Detalhes técnicos

- Componente `Switch` do shadcn já disponível; nenhuma dependência nova.
- Invalidação de caches: `categories-page`, `form-categories` e recarga da conciliação, para o efeito ser imediato nas outras telas.
- Testes: caso unitário para a regra de propagação pai→filhas e ajuste dos testes de exibição de badges de categoria.
