# Regras técnicas do projeto

- Limites de plano: calculados no banco por `assinatura_limites(company_id, modulo)` (plano + adicionais ativos) e barrados no app por `garantirLimite` (`src/lib/billing/limites.ts`); colaboradores e unidades também são barrados por constraint triggers (`dp_guard_limite_*` / `assinatura_limite_excedido`).
- Cobrança mensal = plano base + adicionais ativos não isentos (`subscription_total_cents`, `asaas-create-checkout`); isentas não geram cobrança. Adicional no meio do ciclo gera `prorata_cents` (trigger em `subscription_addons`) cobrado uma vez na próxima fatura; `prorata_billed_at` evita cobrança repetida.
- Recontratação preserva identidade, documentos e histórico; cargo, salário, benefícios e jornada são novos.
- Rotina de banco só recebe `GRANT EXECUTE ... TO authenticated` quando o frontend a chama via `supabase.rpc`, quando uma RLS policy a referencia ou quando um gatilho `SECURITY INVOKER` a usa; as demais ficam só com `service_role`.
- `dp_ficha_aplicar` é `SECURITY DEFINER` autorizada por `tem_permissao(company_id, 'dp.colaboradores', 'inclusao')`; `dp_colaboradores` segue sem gravação direta para `authenticated`.
- Filtros `in`/`not.in` do PostgREST vão entre parênteses ("(a,b)") — sem eles a consulta aborta (PGRST100).
- O portal não lê `dp_colaboradores` de colegas: `dp_portal_equipe_unidade()` expõe só nome, função e folga fixa.
- Pré-admissão: o checklist compartilhado governa leitura e envio; desativar requisito preserva anexos.
- Imagem da assinatura (PNG em data URL) é gravada só pelo servidor em `assinatura_imagem` (dp_recibos/dp_documento_aceites), imutável, e estampada no PDF com rubrica em todas as páginas — reimpressão fiel.
- Piso do cargo: com sindicato patronal na unidade grava no patronal (convenção); sem patronal grava direto na unidade (Cargo + Unidade) — o patronal acelera, nunca bloqueia.
- Desligamento: Aviso, Documentos e Acerto Rescisório com pendências próprias; sem assinatura digital; Acerto só baixa assinado ou com comprovante — emitir não quita.
- Restrição de um dia: colaborador → `dp_bloqueios` (início=fim); cargo/setor → `dp_folga_limite_regras` com vigência de um dia (máximo 0 = ninguém).
- Revogar cortesia gera carência (`grace`, fim 23:59:59 BRT via `_shared/grace.ts`), nunca ativa; vencida, `company_access_status` bloqueia; banner lê `company_grace_subscriptions` por módulo — evita acesso grátis sem fim.
- Cobrança v2: `billing_accounts` agrupa empresas; painel grava legado + grants só via RPCs `billing_v2_*` (ator explícito); ativar encerra carência; conferência em `billing_v2_reconciliation` — rollback seguro.
- Acesso e preço v2: `get_company_entitlements`/`has_module_access` decidem por empresa coberta em `subscription_companies`; flags `access_model_v2` (legado|sombra|v2, via `access_model_set_mode`) e `checkout_v2` (legado|v2), só super admin; preço só por `billing_v2_quote` — valor nunca vem do navegador.
- Tokens: `:root`/`.dark`, mapped in `tailwind.config.ts`; never route-scoped.
- Troca de plano/ciclo só por `billing_v2_plan_change_quote/schedule/cancel`: upgrade e mensal→anual são imediatos com crédito proporcional; downgrade e anual→mensal ficam em `pending_plan_change` e `billing_v2_apply_scheduled_changes` revalida uso na renovação — valor calculado no banco.
- Read subdirectory `AGENTS.md` before edits.

- Ações do Dia: decide documents only; other requests use dedicated DSR/release-undo screens.

- Leave previews retain the request row to open its exact details.
<!-- LOVABLE:BEGIN -->
- Home calendar details reuse the official operation controller via lazyWithRetry; semantic calendar tokens preserve themed absence colors and deploy recovery.
- Document management hosts import and history in a modal; confirmed session completion refreshes the unified list without scrolling the page.
<!-- LOVABLE:END -->

- Recrutamento 360 isolado em `recrutamento_*`: acesso = `recrutamento_liberacoes` + dono/admin (`recrutamento_pode_gerir`); status/prazo só via `recrutamento_vaga_acao` (lock, 3 ativas, 30 dias); público só `recrutamento_vaga_publica` — nunca tocar Financeiro/Pessoas.
- Candidato: conta/perfil só por `recrutamento-candidato-auth` (e-mail técnico `cand-<uuid>@portal.360food.local`, fora do teste grátis, sem CPF); conta existente só vira candidato após login; recuperação só de conta criada aqui — login do Pessoas fica intocado. Rota oficial `/candidato/acesso` (`/candidato/entrar` só redireciona).
- Avaliação Food Service: perguntas, alternativas e pontos (`recrutamento_questoes`, `recrutamento_avaliacao_itens`, `recrutamento_aval_config`) sem acesso para `authenticated`; sorteio, prazo, correção e validade só pelas RPCs `recrutamento_aval_*` com relógio do servidor — o navegador nunca recebe gabarito nem decide tempo. Perfil só fica visível a empresas com avaliação válida (gatilho em `visivel_empresas`).
- Portal de Carreiras e Banco de Talentos: empresa sempre resolvida pelo `slug` permanente de `recrutamento_portais` no servidor; vínculo e Banco Geral só por `recrutamento_talento_*`/`recrutamento_banco_geral_definir` (avaliação válida, versão do texto e histórico em `recrutamento_consentimentos`) — candidatura nunca vira autorização permanente.
- Catálogo financeiro: `private.catalogo_v4_sincronizar` só cria/vincula conta vazia (log em `category_template_chart_links_log`), nunca renomeia personalizado nem reclassifica lançamentos; DRE por código via `computeDreGerencial`.
