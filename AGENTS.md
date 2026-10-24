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
- Generated leave-change terms update only the certificate copy's known acceptance text and signature field after matching the accepted content hash and version; preserve the original PDF and audit evidence to avoid signing changed content.
- Piso do cargo: com sindicato patronal na unidade grava no patronal (convenção); sem patronal grava direto na unidade (Cargo + Unidade) — o patronal acelera, nunca bloqueia.
- Desligamento: Aviso, Documentos e Acerto Rescisório com pendências próprias; sem assinatura digital; Acerto só baixa assinado ou com comprovante — emitir não quita.
- Restrição de um dia: colaborador → `dp_bloqueios` (início=fim); cargo/setor → `dp_folga_limite_regras` com vigência de um dia (máximo 0 = ninguém).
- Revogar cortesia gera carência (`grace`, fim 23:59:59 BRT via `_shared/grace.ts`), nunca ativa; vencida, `company_access_status` bloqueia; banner lê `company_grace_subscriptions` por módulo — evita acesso grátis sem fim.
- Cobrança v2: `billing_accounts` agrupa empresas; painel grava legado + grants só via RPCs `billing_v2_*` (ator explícito); ativar encerra carência; conferência em `billing_v2_reconciliation` — rollback seguro.
- Acesso e preço v2: `get_company_entitlements`/`has_module_access` decidem por empresa coberta em `subscription_companies`; flags `access_model_v2` (legado|sombra|v2, via `access_model_set_mode`) e `checkout_v2` (legado|v2), só super admin; preço só por `billing_v2_quote` — valor nunca vem do navegador.
- Tokens: `:root`/`.dark`, mapped in `tailwind.config.ts`; never route-scoped.
- Troca de plano/ciclo só por `billing_v2_plan_change_quote/schedule/cancel`: upgrade e mensal→anual são imediatos com crédito proporcional; downgrade e anual→mensal ficam em `pending_plan_change` e `billing_v2_apply_scheduled_changes` revalida uso na renovação — valor calculado no banco.
- Read subdirectory `AGENTS.md` before edits.
- Unit holiday registration uses the frontend date-order helper with the selected year; retain inactive and non-occurring rules for editing separately from the active annual agenda.
- Unit tabs use a dedicated horizontal scroller with edge controls and active-tab visibility; holiday presentation labels and counts stay in the frontend adapter to preserve stored identifiers and records.
- Holiday category is independent of date calculation; the additive v2 resolver keeps the legacy RPC compatible, and calendars retain all same-day categories through shared presentation helpers (Pessoas/Escala).
- Movable holidays use explicit unit-selected codes and Gregorian computus in the shared helper and database resolver; include the code in reads and replication to keep annual dates consistent without scheduled jobs or automatic holiday enrollment.
- National holiday enrollment defaults to federal fixed dates; its confirmation dialog may include Good Friday only through explicit local opt-in, using the movable code and preserving existing/inactive rules, because Law 9,093/1995, article 2 requires municipal legislation.
- Recrutamento 360 rules live in `src/pages/recrutamento/AGENTS.md`.

- Ações do Dia: decide documents only; other requests use dedicated DSR/release-undo screens.

- Leave previews retain the request row to open its exact details.
- Portal operation uses server-scoped RPCs; approved leave and confirmed absences override work in every source, with shared cache invalidation after decisions and periodic portal refresh to reflect other devices.
- Exceptional leave occurrence evidence is generated transactionally from linked leave/request/swap records; source cancellation retires evidence and server triggers protect its impact fields, while point treatment remains independently pending for external accounting.
- Occurrence quick filters use the shared type-query helper before the result limit; leave/swap filtering uses source links instead of labels so both absence and worked-day evidence remain visible.
<!-- LOVABLE:BEGIN -->
- Home calendar details reuse the official operation controller via lazyWithRetry; semantic calendar tokens preserve themed absence colors and deploy recovery.
- Document management hosts import and history in a modal; confirmed session completion refreshes the unified list without scrolling the page.
<!-- LOVABLE:END -->

- Catálogo financeiro: `private.catalogo_v4_sincronizar` só cria/vincula conta vazia (log em `category_template_chart_links_log`), nunca renomeia personalizado nem reclassifica lançamentos; DRE por código via `computeDreGerencial`.
- Desligamento: datas só pelo motor compartilhado `supabase/functions/_shared/desligamento-motor.ts` (navegador reexporta); gravação só via Edge `dp-desligamento-aviso` → RPCs service_role; vínculo só é inativado pelo worker `dp_desligamento_processar` (cron) ou registro legado na data calculada — evita desligamento antecipado.
