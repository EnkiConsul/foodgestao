# Achado A7 — Lançamento aceita conta/cartão de outra empresa e altera o saldo dela

Registrado em 21/09/2026. Achado **separado** do relatório D1 (`docs/security/d1-auditoria-rls.md`).
Severidade: **ALTA** (escrita cruzada entre empresas em dado financeiro).
Natureza da confirmação, sem ambiguidade:
- **Homologação (`utjhzpdbqzajrhnzcher`): exploração executada de verdade**, em transação revertida —
  o lançamento foi aceito e o saldo da conta da outra empresa passou a 7.
- **Produção (`grtxmbffgmgnkawlvqhm`): confirmação por definições e por caminho de código**
  (gatilhos, constraints, corpo das funções) mais **contagens agregadas**. Nenhuma exploração foi
  executada em produção, nenhum lançamento de teste foi criado, nenhum dado real foi alterado.

## Evidência independente (homologação `utjhzpdbqzajrhnzcher`)

Em `BEGIN` com `SET LOCAL ROLE authenticated` e JWT do usuário da empresa A, o `INSERT` em
`transactions` com `user_id = A`, `company_id = A` e `account_id` = **conta da empresa B**
(`transaction_type='entrada'`, `description='D1 ROLLBACK ONLY'`, `amount=1`) foi **aceito**
(1 linha). O inverso (empresa D apontando para conta da empresa A) também foi aceito.

Rodada refinada, no mesmo ambiente: contas temporárias A e B criadas dentro do `BEGIN`
(`context = 'pj'`), lançamento **confirmado** com `company_id = A` e `account_id` = conta B,
`amount = 7` — aceito, e **o saldo da conta B passou a 7**, gravado por
`trg_sync_account_balance` → `public.apply_tx_balance` (`SECURITY DEFINER`). O caso legítimo
(`company_id = A` com conta A) também resultou em 7, servindo de controle. `ROLLBACK` e limpeza
conferidos: contas e lançamentos de teste = 0. Leitura e CRUD cruzados **por `company_id`** seguem
bloqueados e `get_accessible_accounts('pj', empresaB, false)` devolve `42501`.

## Confirmação em produção — por definições e caminho, sem exploração executada

A homologação é uma base antiga, então nada foi concluído a partir dela. Em produção houve **apenas
leitura**: definições de gatilhos, constraints, corpos de função e contagens agregadas.
**Nenhum `INSERT`, nenhum teste de sessão, nenhuma exploração.** O que a leitura mostra é que o mesmo
caminho existe:

1. `public.transactions` tem 14 triggers. Nenhuma valida a empresa de `account_id` nem de
   `credit_card_id`. A única validação de tenant de conta é
   `validate_transaction_destination_account`, que trata **apenas** `destination_account_id` e
   **apenas** quando `transaction_type = 'transferencia'`:
   `IF _dest.company_id IS DISTINCT FROM NEW.company_id THEN RAISE EXCEPTION 'Conta de destino não
   pertence à mesma empresa do lançamento' USING ERRCODE = '42501'`.
2. Constraints de `transactions`: a única CHECK relacionada é
   `transactions_source_xor CHECK ((account_id IS NULL) <> (credit_card_id IS NULL))`.
   `fk_transactions_account` e `transactions_credit_card_id_fkey` referenciam apenas a chave
   primária — FK não carrega empresa.
3. Varredura em todas as funções de `public`/`private` por comparação de empresa envolvendo
   `account_id`: só `validate_transaction_destination_account` e
   `private.prevent_association_tenant_change` aparecem. Não existe guard para `account_id`.
4. O impacto no saldo é real e privilegiado: `trg_sync_account_balance` →
   `sync_account_balance_on_tx` → `public.apply_tx_balance(_tx, sign)`, ambas **SECURITY DEFINER**.
   `apply_tx_balance` executa
   `UPDATE public.accounts SET current_balance = current_balance ± amount WHERE id = _tx.account_id`
   **sem qualquer verificação de empresa ou de vínculo** — logo ignora a RLS de `accounts`.
5. Efeito colateral equivalente pelo cartão: `trg_transactions_assign_cc_invoice` movimenta
   `credit_card_invoices` a partir de `credit_card_id`, também sem trava de empresa.

## Efeito prático

Um usuário **com permissão de editar lançamentos na empresa A** pode criar (ou atualizar) um
lançamento declarado como da empresa A cujo `account_id` pertence à empresa B. A linha continua
invisível para a empresa B (a RLS de leitura usa `company_id`), mas:

- o **saldo da conta da empresa B é alterado** pela função privilegiada de saldo;
- com `credit_card_id` de outra empresa, a **fatura da empresa B** é recalculada;
- a conta/cartão de B passa a ter uma referência que bloqueia exclusão (`ON DELETE RESTRICT`).

Pré-requisito: conhecer o identificador da conta/cartão de B. O caminho realista não é adivinhar um
identificador, e sim o usuário que participa de **duas** empresas (comum nesta base) com permissão
de edição em apenas uma: ele lê o identificador pela empresa onde é membro e escreve pela outra.

## Correção preparada (não aplicada)

`docs/security/d1/d1-fix-a7-conta-tenant-guard.sql` — trigger `BEFORE INSERT OR UPDATE` em
`transactions` que exige:

- `account_id` pertencente à mesma `company_id` (e, em contexto pessoal, ao mesmo `user_id`);
- `credit_card_id` pertencente à mesma `company_id`;
- mensagens em português no mesmo padrão do guard de conta de destino (`42501`).

Escopo deliberadamente mínimo: nenhuma policy, nenhum grant, nenhuma função de saldo alterada, e
nenhum dado histórico tocado. Antes de aplicar é necessário medir quantas linhas existentes já estão
inconsistentes (consulta de contagem agregada incluída como comentário no arquivo), porque um guard
em `UPDATE` pode travar a edição dessas linhas legadas — se houver, a validação de `UPDATE` deve ser
restrita às colunas que mudam de conta/cartão.

Nada foi aplicado ao banco: aplicação depende de autorização explícita.
