# Financeiro 360° também entra como Trial em empresas novas

## Causa confirmada

- O gatilho `seed_financeiro_module_on_company` (migração `20260714174814`) insere o módulo `financeiro` com status **active** para toda empresa criada.
- A RPC `fn_cadastrar_empresa_onboarding` insere os módulos selecionados (incluindo Financeiro) como **trial** por 14 dias, mas usa `ON CONFLICT DO NOTHING` — como o gatilho roda antes, o registro "active" vence.
- Resultado hoje: Financeiro "Ativo" + Pessoas "Trial" no Hub de uma conta nova.

## Mudança (migração única)

1. **Dropar o gatilho e a função** que ativam o Financeiro automaticamente na criação da empresa.
2. O Financeiro passa a ser gravado pela RPC de onboarding como **trial de 14 dias**, igual aos demais módulos selecionados (o `ON CONFLICT DO NOTHING` passa a valer de fato).
3. **Nada muda retroativamente**: empresas existentes com Financeiro ativo permanecem como estão; o backfill histórico não é revertido.

## Verificação

- Criar conta/empresa nova: no Hub, Financeiro 360° e Pessoas 360° aparecem ambos com selo **Trial** e a mesma data de término.
- Empresa existente (ex.: IMPULSO CAPITAL) mantém Financeiro "Ativo".
