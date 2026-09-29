# Regras técnicas do projeto

- Limites de plano são calculados no banco pela função `assinatura_limites(company_id, modulo)` (plano + adicionais ativos) e barrados no app por `garantirLimite` em `src/lib/billing/limites.ts` — fonte única evita divergência entre telas.
- O valor mensal cobrado é sempre plano base + adicionais ativos não isentos (`subscription_total_cents` no banco, `asaas-create-checkout` na cobrança) — assinaturas isentas não geram cobrança.
- Adicional contratado no meio do ciclo gera `prorata_cents` (trigger em `subscription_addons`) cobrado uma única vez na próxima fatura; `prorata_billed_at` marca o que já foi cobrado, evitando cobrança repetida.
- Limites de colaboradores e unidades também são barrados no banco por constraint triggers (`dp_guard_limite_*`) usando `assinatura_limite_excedido` — o app não é a única defesa.
- Recontratação reaproveita apenas identidade, dados pessoais/documentos atuais e histórico do vínculo; cargo, salário, benefícios e jornada são definidos para a nova admissão e nunca copiados do vínculo anterior — evita condições contratuais defasadas.
- Rotina de banco só recebe `GRANT EXECUTE ... TO authenticated` quando o frontend a chama via `supabase.rpc`, quando uma RLS policy a referencia ou quando um gatilho `SECURITY INVOKER` a usa (ex.: `dp_regra_bloqueia_data` no gatilho de `dp_solicitacoes`); as demais ficam só com `service_role` — menor privilégio sem quebrar tela.
- `dp_ficha_aplicar` é `SECURITY DEFINER` com autorização explícita por `tem_permissao(company_id, 'dp.colaboradores', 'inclusao')`; a tabela `dp_colaboradores` permanece sem gravação direta para `authenticated` — mantém a aplicação atômica da ficha sem reabrir acesso amplo.
- O portal do colaborador nunca lê `dp_colaboradores` de colegas (RLS `dp_colab_self_read`): dados de equipe vêm de `dp_portal_equipe_unidade()`, que devolve só nome, nome social, função e folga fixa da própria unidade — permite calendário e troca de folga sem expor cadastro.
