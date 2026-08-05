# Ativar o módulo Pedidos para a Raptor Systems

## Situação atual

O módulo Pedidos da Raptor Systems está com status **trial**, iniciado em 05/08/2026 e com expiração em 12/08/2026. Nada está faltando em configuração: o trial é o estado padrão criado no primeiro acesso ao módulo.

Para o módulo ficar permanentemente disponível, ele precisa passar para o status **ativo**, sem data de término.

## O que será feito

- Ativar o módulo Pedidos da empresa Raptor Systems, sem cobrança e sem data de expiração.
- Manter o registro de que o teste gratuito já foi usado, para não permitir um novo trial no futuro.
- Nenhuma mudança de código, tela ou faturamento: a tela de assinatura e o fluxo de contratação continuam como estão.

## Detalhes técnicos

- Atualização de dados na tabela `company_modules` para a linha `module = 'pedidos'` da empresa `Raptor Systems`: `status = 'active'`, `ends_at = null`.
- Após a mudança, a RPC `can_use_orders_module` passa a retornar `effective_status = 'active'` e o Hub deixa de exibir o selo de Trial.
- Sem alterações de schema, RLS ou Edge Functions.
