# Cartões de crédito da Pluggy com autorização do usuário

Hoje o sync da Pluggy espelha todas as contas em `pluggy_accounts` e cria conta local automaticamente **apenas** para contas do tipo `BANK` (verificado em `pluggy-sync-item`, linha 328). Contas `CREDIT` ficam espelhadas e nunca viram cartão em `credit_cards`.

A proposta: o sistema **detecta e sugere**, mas só cria o cartão depois que o usuário revisar e autorizar numa tela de confirmação.

## Como vai funcionar

1. Durante o sync, cada conta `CREDIT` da Pluggy fica marcada como "cartão pendente de autorização" (nada é criado em `credit_cards`).
2. Em **Conexões Pluggy** aparece um aviso "N cartões de crédito encontrados — revisar", e o mesmo aviso na página **Cartões de Crédito**.
3. Ao clicar, abre a tela de autorização com um card por cartão detectado, mostrando os dados sugeridos pela Pluggy e editáveis antes de confirmar:
   - Nome/apelido do cartão, bandeira, emissor, últimos 4 dígitos
   - Limite de crédito
   - Dia de fechamento e dia de vencimento
   - Contexto (PF/PJ) e empresa, conta padrão de pagamento (opcional)
4. Cada cartão tem três ações: **Criar cartão**, **Vincular a um cartão existente** (para quem já cadastrou manualmente) ou **Ignorar** (não perguntar mais para essa conta).
5. Só após "Confirmar" o registro é gravado em `credit_cards` e a conta Pluggy passa a ficar vinculada a ele, para as transações do cartão caírem no cartão certo na conciliação.
6. Reconexão ou novo sync não duplica: contas já vinculadas ou ignoradas não voltam para a fila.

## Detalhes técnicos

**Banco**
- `pluggy_accounts`: novas colunas `linked_credit_card_id uuid references credit_cards(id) on delete set null`, `credit_review_status text` (`pending` | `linked` | `ignored`), `credit_review_at timestamptz`, `credit_review_by uuid`.
- Índice em `(company_id, credit_review_status)` para a fila.
- Sem novas tabelas; RLS existente de `pluggy_accounts` continua valendo (revisar policies para permitir update dessas colunas pelo dono/admin da empresa).

**Edge function `pluggy-sync-item`**
- No loop de accounts (linhas 311-406), para `type === 'CREDIT'`: marcar `credit_review_status = 'pending'` quando ainda não houver `linked_credit_card_id` nem status `ignored`; preservar `raw` (a Pluggy envia `creditData` com `brand`, `level`, `limit`, `balanceCloseDate`, `balanceDueDate`).
- Nunca inserir em `credit_cards` a partir da função.

**Frontend**
- `src/lib/pluggy/creditCardSuggestion.ts`: converte a conta Pluggy (`raw.creditData` + `number_masked`) na sugestão de `credit_cards` (bandeira, last4, limite, `closing_day`/`due_day` derivados das datas de fechamento/vencimento, com fallback seguro). Coberto por teste unitário.
- `src/hooks/usePluggyCreditReview.tsx`: lista pendências, cria cartão (reaproveitando o mesmo caminho de `CreditCardFormDialog`), vincula a cartão existente e ignora.
- `src/components/accounts/PluggyCreditCardReviewDialog.tsx`: tela de autorização com os cards editáveis e ações por item.
- Aviso/entrada para o diálogo em `src/pages/ConexoesPluggy.tsx` e `src/pages/CartoesCredito.tsx`.

**Conciliação**
- Onde a conciliação resolve conta local a partir de `pluggy_accounts.linked_account_id`, passar a considerar `linked_credit_card_id` para direcionar transações de cartão à fatura/cartão correspondente.
