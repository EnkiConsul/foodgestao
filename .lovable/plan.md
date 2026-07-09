## Índice automático em Contas Contábeis

### Regra de numeração

- **Raiz** (sem pai): próximo inteiro disponível — `1`, `2`, `3`...
- **Filha**: código do pai + `.N`, onde N é o próximo inteiro entre os irmãos daquele pai — `1.1`, `1.1.1`, etc. Sem limite de profundidade.
- Cálculo feito no servidor via função Postgres (`chart_account_next_code(parent_id, user_id, context)`) para evitar condições de corrida (dois usuários criando simultaneamente).

### Formulário

- Remover o input **Código (Índice)** da criação e da edição.
- Mostrar o código atual como texto somente-leitura (badge) no topo do dialog de edição.
- **Conta Pai** continua editável na edição. Ao trocar de pai:
  - O código da conta é recalculado (próximo disponível no novo pai).
  - Todas as filhas descendentes são recalculadas em cascata mantendo a ordem relativa.
  - Lançamentos existentes vinculados permanecem intactos (referência é por `id`, não por código).

### Exclusão

- Bloquear exclusão se a conta tiver **filhas** ou **lançamentos vinculados**.
- Mensagem sugerindo **Inativar** como alternativa (botão de atalho no diálogo de confirmação).
- Como o vínculo `transactions → chart_accounts` ainda não existe hoje, a checagem de "possui lançamentos" fica preparada mas só bloqueia por filhas por enquanto; o comportamento completo ativa automaticamente quando o campo for adicionado a `transactions`.

### Backend

- Nova função SQL `public.chart_account_next_code(_parent_id uuid, _user_id uuid, _context context_type)` — retorna o próximo código como texto.
- Trigger `BEFORE INSERT` em `chart_accounts` que popula `code` automaticamente quando NULL, usando a função acima.
- Nova função `public.chart_account_move(_id uuid, _new_parent_id uuid)` — SECURITY DEFINER, valida propriedade, recalcula o código da conta e de todos os descendentes em cascata (mantendo ordem por `code` atual).
- Ajustar a `CREATE TABLE` para permitir `code` NULL na inserção (default via trigger), mas manter unicidade.

### Frontend

- Chamar `chart_account_move` quando o pai mudar em edição; para criação, apenas omitir `code` e deixar o trigger preencher.
- Remover validação de formato do `code` no zod (`chartAccountSchema`).
- Página lista continua ordenando por `code` com o comparador natural existente.
