## Objetivo

Garantir que o card "Autenticação em 2 fatores" atualize badge, switch e botões instantaneamente após ativar/desativar, sem esperar o round-trip de `listFactors()`.

## Diagnóstico

`TwoFactorCard.tsx` já chama `refresh()` após verificar e desativar, mas há uma janela curta (≈300-800ms) entre `setSubmitting(false)` e o retorno de `listFactors()` em que o estado `factors` ainda reflete o valor antigo. Em conexões lentas isso parece "não atualizou".

## Mudança

Editar `src/components/settings/TwoFactorCard.tsx` para aplicar atualização otimista do estado local antes do `refresh()`:

1. **`verifyEnroll`** (após sucesso): chamar `setFactors([{ id: enroll.factorId, factor_type: "totp", status: "verified" }])` antes do `refresh()`. Badge muda para "Ativada" e botão "Desativar 2FA" aparece no mesmo frame.

2. **`disableMfa`** (após unenroll bem-sucedido): chamar `setFactors([])` e `setEnroll(null)` antes do `refresh()`. Badge volta para "Desativada", Switch desliga e botão de configuração reaparece imediatamente.

3. **`cancelEnroll`**: limpar `factors` dos não-verificados localmente antes do `refresh()`.

`refresh()` continua sendo chamado em seguida para reconciliar com a verdade do servidor (caso o unenroll tenha falhado parcialmente, por exemplo).

## Sem mudanças

- Fluxo de QR/verificação inalterado.
- Diálogo de confirmação de desativação inalterado.
- Nenhuma alteração de schema, edge function ou login.

## Validação

Ativar 2FA → ao confirmar código, badge muda para "Ativada" e botão vermelho "Desativar 2FA" aparece sem delay. Clicar em desativar → confirmar → badge volta para "Desativada" e Switch desliga instantaneamente.
