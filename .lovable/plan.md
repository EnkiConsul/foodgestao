# Divisão (rateio) de um lançamento do banco em vários lançamentos

Hoje cada linha do extrato do banco (Open Finance / extrato importado) só pode virar **um** lançamento: a função de confirmação cria uma única transação com o valor total e grava o vínculo em `matched_transaction_id`. O objetivo é permitir dividir uma linha em dois ou mais lançamentos, com categoria, contato, forma de pagamento e descrição próprios.

Exemplo alvo:

```text
Banco: Agro Rei  R$ 10,00
  Lançamento 1: R$ 9,00 - Agro Rei         - Despesa Alimentação
  Lançamento 2: R$ 1,00 - Agro Rei (juros) - Juros e Multas
```

## O que será construído

### 1. Conciliação — botão "Dividir"
- Em cada linha pendente (desktop e mobile) entra a ação **Dividir lançamento**.
- Abre um diálogo com o valor do banco no topo e uma lista de partes. Cada parte tem: valor, categoria, descrição, contato e forma de pagamento (a conta financeira é a mesma do extrato).
- Botões para adicionar/remover partes, atalho "usar o valor restante" e distribuição por percentual.
- O rodapé mostra em tempo real: total das partes, valor do banco e diferença. A confirmação só é liberada quando a soma bate exatamente com o valor do banco (tolerância de 1 centavo). A diferença aparece destacada enquanto não bater.
- Ao confirmar, todos os lançamentos são criados de uma vez e a linha do banco passa a "Conciliado".

### 2. Extrato de Conciliação — exibição de múltiplos lançamentos
- Uma linha do banco dividida passa a mostrar todos os lançamentos vinculados, um abaixo do outro, no lado "plataforma", cada um com categoria e valor.
- O valor do lado da plataforma exibe a **soma** das partes; fica destacado em amarelo se divergir do valor do banco.
- "Editar e conciliar" continua disponível por lançamento (abre o modal de edição na própria tela do extrato).
- KPIs, divergências e exportação (PDF/Excel) passam a considerar a soma das partes, não apenas um lançamento.

### 3. Desfazer
- Ao desfazer a conciliação de uma linha dividida, todos os lançamentos gerados por ela são removidos juntos e a linha volta para pendente.

## Detalhes técnicos

- **Nova função no banco** `pluggy_confirm_staging_split(p_staging_id uuid, p_account_id uuid, p_splits jsonb)`:
  - valida usuário, empresa (`company_members`), conta e escopo de contato/forma de pagamento igual à `pluggy_confirm_staging` atual;
  - valida `sum(abs(valor das partes)) = abs(staging.amount)` e mínimo de 2 partes;
  - insere N linhas em `transactions` com `transaction_type` derivado do sinal do valor do banco, `pluggy_staging_transaction_id = p_staging_id`, `pluggy_transaction_id`, `pluggy_raw_snapshot`, `counterparty_*` replicados (mesma semântica da função atual, para preservar a auditoria Open Finance);
  - marca a linha de staging como `confirmed` e grava `matched_transaction_id` com o primeiro lançamento (compatibilidade com telas existentes);
  - `SECURITY DEFINER`, `search_path = public`, `GRANT EXECUTE` para `authenticated`.
- **`src/lib/conciliacao/extrato.ts`**: `ExtratoRow.platform` passa de objeto único para lista (`platforms: ExtratoPlatformItem[]`), com campos derivados `platformTotal` e `platformCount`. `conciliado` = status `confirmed` e ao menos um lançamento. Divergência = `abs(platformTotal) != abs(amount)`.
- **`src/hooks/useExtratoConciliacao.tsx`**: mantém as duas buscas (por `matched_transaction_id` e por `pluggy_staging_transaction_id`) e passa a agrupar as transações por staging em lista.
- **`src/pages/ExtratoConciliacao.tsx`**: renderiza a lista de lançamentos por linha, ajusta as exportações e os totais.
- **Novo componente** `src/components/conciliacao/DividirLancamentoDialog.tsx`, acionado por `src/pages/ConciliacaoPluggy.tsx` (tabela desktop e `StagingCard.tsx` no mobile).
- **Testes** em `src/test/unit/extratoConciliacao.test.ts`: linha com 2 lançamentos somando o valor do banco (conciliada, sem divergência) e caso de soma divergente.
