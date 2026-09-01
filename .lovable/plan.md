# Conciliação mostra lançamentos e contas antigas já excluídas

## O que está acontecendo (confirmado no banco — empresa Raptor Systems)

A exclusão de contas financeiras, cartões e lançamentos **não** limpa nada do lado do Open Finance. Hoje a empresa está assim:

- 4 conexões Open Finance ainda registradas (Neon, Banco Bmg, C6 Bank Empresas duas vezes — uma delas com status "encerrada");
- 5 contas Open Finance, das quais 4 são cartões órfãos (sem vínculo com cartão do sistema) e 1 conta bancária ainda vinculada;
- **174 linhas de extrato antigas** na base de conciliação (abril a setembro), praticamente todas "pendentes";
- apenas 2 lançamentos e nenhum cartão cadastrados.

A tela de Conciliação lista essas 174 linhas por empresa, sem olhar se a conexão foi encerrada e sem olhar se a conta/cartão de destino ainda existe. Daí a sensação de "voltou tudo": são resíduos da conexão anterior, e o seletor mostra "C6 Bank Empresas" duas vezes porque há duas conexões do mesmo banco (uma encerrada).

## Correções

1. **Excluir conta ou cartão passa a limpar o Open Finance vinculado**
   Ao excluir uma conta financeira ou um cartão de crédito, remover também a conta Open Finance ligada a ela e as linhas de extrato ainda pendentes dessa conta (linhas já conciliadas continuam preservadas para auditoria). Se a conexão ficar sem nenhuma conta em uso, encerrar a conexão inteira.

2. **Conciliação ignora resíduo**
   Na tela de Conciliação: não listar linhas de conexões encerradas nem linhas de contas Open Finance sem vínculo válido (conta/cartão inexistente ou excluído). O seletor de conexões passa a mostrar apenas conexões ativas, sem repetir o mesmo banco.

3. **Ação de limpeza para o usuário**
   Botão "Limpar extrato pendente" no cabeçalho da Conciliação (com confirmação), que descarta as linhas pendentes do escopo atual — útil quando o usuário quer começar de novo sem precisar de suporte.

4. **Limpeza imediata dos dados desta empresa**
   Encerrar as conexões residuais, remover os cartões Open Finance órfãos e descartar as 174 linhas pendentes, para a tela ficar limpa antes da nova conexão.

5. **Verificação**
   Rodar os testes de contas bancárias/conciliação e conferir a tela com Playwright após a limpeza: nenhuma linha antiga, seletor sem duplicidade de banco.

## Detalhes técnicos

- `delete_account` (e o caminho de exclusão de cartão) ganham a limpeza de `pluggy_accounts` (vínculo alvo) e `pluggy_staging_transactions` com `status = 'pending'` da conta; reaproveitar a regra de "conta em uso" já usada em `pluggy-disconnect-item` para decidir o encerramento da conexão.
- `src/pages/ConciliacaoPluggy.tsx` (`load`, ~478-544): filtrar staging por conexões com status diferente de `deleted` e por `pluggy_account_id` presente em contas com `linked_account_id`/`linked_credit_card_id` válidos; montar o seletor a partir dessa mesma lista deduplicada por banco.
- Limpeza pontual de dados na empresa `9293cf25…` (conexões `149e0123`, `c2e022da`, `1e780019`, `c863430a`).
