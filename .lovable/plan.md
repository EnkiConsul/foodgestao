# Conexões Open Finance excluídas continuam aparecendo

## O que está acontecendo (confirmado no banco)

A empresa do cliente não tem nenhuma conta financeira cadastrada (tabela de contas vazia), mas ainda existem duas conexões Open Finance ativas — Neon e C6 Bank Empresas — cada uma com uma conta de **cartão de crédito** sobrando, sem vínculo com nenhuma conta financeira.

Motivo: ao excluir a conta bancária em "Contas Bancárias", o sistema pede a remoção apenas da conta Open Finance correspondente. Como a conexão ainda tinha outra conta (o cartão de crédito pendente de autorização), a regra atual entende que o banco continua em uso e mantém a conexão viva. Resultado: o cartão órfão sustenta a conexão e o card reaparece em Contas Bancárias > Conexões.

Além disso, a tela de Conexões continua listando conexões com status "Encerrada — reconectar", o que reforça a sensação de que nada foi excluído.

## Correções

1. **Encerrar a conexão quando não sobra nada em uso**
   Na desconexão por conta (`pluggy-disconnect-item`), passar a considerar "em uso" somente contas Open Finance vinculadas a uma conta financeira ou a um cartão do sistema. Se, depois de remover a conta pedida, não sobrar nenhuma conta em uso, encerrar a conexão inteira (item na Pluggy + registros locais), em vez de manter o banco conectado por causa de contas órfãs/pendentes.

2. **Não listar conexões encerradas nem vazias**
   Em Contas Bancárias > Conexões: ocultar conexões com status encerrado e conexões sem nenhuma conta. A reconexão continua disponível pelo botão de conectar banco (o fluxo já reaproveita o item quando necessário).

3. **Limpeza dos dados do cliente**
   Encerrar as duas conexões órfãs (Neon e C6) da empresa afetada e remover os cartões Open Finance pendentes que ficaram pendurados nelas, para que a tela fique limpa imediatamente.

4. **Verificação**
   Rodar os testes existentes de contas bancárias e conferir a tela de Conexões com Playwright após a limpeza, garantindo que nenhum card órfão permaneça e que conexões saudáveis continuem visíveis.

## Detalhes técnicos

- `supabase/functions/pluggy-disconnect-item/index.ts`: trocar a contagem simples de `pluggy_accounts` por uma contagem de contas ainda em uso (`linked_account_id` ou `linked_credit_card_id` não nulos) excluindo a conta alvo; sem contas em uso, seguir para o caminho de desconexão total do item.
- `src/pages/ConexoesPluggy.tsx`: filtrar `status = 'deleted'` e conexões com zero contas antes de montar a lista (mantendo a deduplicação por banco já existente).
- Limpeza dos registros do cliente via operação de dados pontual nas conexões `5b7ef8cd…` (Neon) e `c64ebd8e…` (C6) da empresa `9293cf25…`.
