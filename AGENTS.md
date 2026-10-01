# Regras técnicas do projeto

- Limites de plano são calculados no banco pela função `assinatura_limites(company_id, modulo)` (plano + adicionais ativos) e barrados no app por `garantirLimite` em `src/lib/billing/limites.ts` — fonte única evita divergência entre telas.
- O valor mensal cobrado é sempre plano base + adicionais ativos não isentos (`subscription_total_cents` no banco, `asaas-create-checkout` na cobrança) — assinaturas isentas não geram cobrança.
- Adicional contratado no meio do ciclo gera `prorata_cents` (trigger em `subscription_addons`) cobrado uma única vez na próxima fatura; `prorata_billed_at` marca o que já foi cobrado, evitando cobrança repetida.
- Limites de colaboradores e unidades também são barrados no banco por constraint triggers (`dp_guard_limite_*`) usando `assinatura_limite_excedido` — o app não é a única defesa.
- Recontratação preserva identidade, documentos atuais e histórico; cargo, salário, benefícios e jornada são novos — evita condições defasadas.
- Rotina de banco só recebe `GRANT EXECUTE ... TO authenticated` quando o frontend a chama via `supabase.rpc`, quando uma RLS policy a referencia ou quando um gatilho `SECURITY INVOKER` a usa; as demais ficam só com `service_role` — menor privilégio sem quebrar tela.
- `dp_ficha_aplicar` é `SECURITY DEFINER` com autorização explícita por `tem_permissao(company_id, 'dp.colaboradores', 'inclusao')`; a tabela `dp_colaboradores` permanece sem gravação direta para `authenticated` — mantém a aplicação atômica da ficha sem reabrir acesso amplo.
- O portal não lê `dp_colaboradores` de colegas: `dp_portal_equipe_unidade()` expõe só nome, função e folga fixa da unidade — preserva privacidade.
- Na pré-admissão, o checklist compartilhado governa leitura e envio; desativar requisitos preserva anexos históricos — evita divergência na validação.
- Recibo de cadastrado: Portal/físico; avulso: WhatsApp/físico — evita canal incompatível.
