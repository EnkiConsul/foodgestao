## Objetivo
Permitir duplicar rapidamente um lançamento existente na tela de Lançamentos, criando um novo com os mesmos dados (ajustáveis antes de salvar).

## Comportamento
- Adicionar um botão **Duplicar** (ícone `Copy`) ao lado dos botões Editar/Excluir em cada linha da tabela de lançamentos (`src/pages/Lancamentos.tsx`, próximo à linha 1262).
- Ao clicar:
  1. Monta um objeto a partir do lançamento original **sem `id`** (para o dialog entender como criação).
  2. Ajusta campos que não devem ser copiados:
     - `status` → `pendente`
     - `bill_status` → `a_vencer`
     - `amount_paid` → `0`
     - `payment_date` → `null`
     - `is_recurring` → `false`, `parent_transaction_id` → `null` (duplicata é sempre um lançamento único, mesmo se o original for da série)
     - `attachment_url` → `null` (anexos não são copiados)
     - `transaction_date` e `due_date` → deslocadas em +1 mês (padrão comum) para evitar chocar com o original; usuário pode alterar no dialog.
     - Descrição recebe sufixo `" (cópia)"`.
  3. Abre o `TransactionFormDialog` em modo criação, pré-preenchido, para o usuário revisar e salvar.
- Para lançamentos recorrentes: a duplicação **não** pergunta escopo (série) — cria apenas 1 registro novo, não recorrente. Se o usuário quiser recorrência, marca no dialog.

## Confirmação
- Não usa AlertDialog; a abertura do formulário já serve como confirmação (usuário pode cancelar).
- Toast de sucesso é o padrão já emitido pelo dialog ao salvar.

## Permissões
- Mesmo gate de edição já usado nos botões Editar (usuário sem permissão de edição em `transactions` não vê o botão).

## Arquivos alterados
- `src/pages/Lancamentos.tsx`:
  - Importar `Copy` de `lucide-react`.
  - Adicionar handler `handleDuplicate(tx)` que monta o payload e abre o dialog em modo criação (usando o mesmo state do dialog, porém sem `editTransaction` — passando os defaults via uma nova prop/estado, ex.: `duplicateSource`).
  - Adicionar botão na coluna de ações da linha.
- `src/components/transactions/TransactionFormDialog.tsx`:
  - Aceitar prop opcional `initialValues` (Partial do formulário) usada apenas quando **não** há `transaction` de edição, para pré-preencher o form em criação.

## Não incluído
- Duplicação em massa (bulk) — pode ser feita depois se solicitado.
- Cópia de anexos — fora de escopo.
