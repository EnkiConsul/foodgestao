# Regras técnicas do projeto

- Limites de plano são calculados no banco pela função `assinatura_limites(company_id, modulo)` (plano + adicionais ativos) e barrados no app por `garantirLimite` em `src/lib/billing/limites.ts` — fonte única evita divergência entre telas.
- O valor mensal cobrado é sempre plano base + adicionais ativos não isentos (`subscription_total_cents` no banco, `asaas-create-checkout` na cobrança) — assinaturas isentas não geram cobrança.
- Adicional contratado no meio do ciclo gera `prorata_cents` (trigger em `subscription_addons`) cobrado uma única vez na próxima fatura; `prorata_billed_at` marca o que já foi cobrado, evitando cobrança repetida.
- Limites de colaboradores e unidades também são barrados no banco por constraint triggers (`dp_guard_limite_*`) usando `assinatura_limite_excedido` — o app não é a única defesa.
