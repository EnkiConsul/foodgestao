# Regras técnicas do projeto

- Portal occurrence history uses a session-scoped RPC with an explicit field allowlist and complete monthly pagination; page and day details share presentation, and only persisted decisions can confirm a prize impact.

- Admission progress is derived from process status and ASO, not opened form tabs; preserve the typed time-sheet decision through review and effectivation to avoid losing manager choices.
- Termination evidence is synchronized transactionally with bank application using the server motor's sanitized attendance extract; portal reads only persisted date/rest fields, never balances, and Art. 488 occurrences remain pending for external point treatment.
- Termination agenda is company-scoped, independent of active attendance; calendars share persisted milestone filtering (last attendance/end/payment), never infer missing attendance. Leave labels use persisted origin/subtype, not legacy extra flags.

- Limites de plano: calculados no banco por `assinatura_limites(company_id, modulo)` (plano + adicionais ativos) e barrados no app por `garantirLimite` (`src/lib/billing/limites.ts`); colaboradores e unidades também são barrados por constraint triggers (`dp_guard_limite_*` / `assinatura_limite_excedido`).
- Cobrança mensal = plano base + adicionais ativos não isentos (`subscription_total_cents`, `asaas-create-checkout`); isentas não geram cobrança. Adicional no meio do ciclo gera `prorata_cents` (trigger em `subscription_addons`) cobrado uma vez na próxima fatura; `prorata_billed_at` evita cobrança repetida.
- Recontratação preserva identidade, documentos e histórico; cargo, salário, benefícios e jornada são novos.
- Rotina de banco só recebe `GRANT EXECUTE ... TO authenticated` quando o frontend a chama via `supabase.rpc`, quando uma RLS policy a referencia ou quando um gatilho `SECURITY INVOKER` a usa; as demais ficam só com `service_role`.
- `dp_ficha_aplicar` é `SECURITY DEFINER` autorizada por `tem_permissao(company_id, 'dp.colaboradores', 'inclusao')`; `dp_colaboradores` segue sem gravação direta para `authenticated`.
- Filtros `in`/`not.in` do PostgREST vão entre parênteses ("(a,b)") — sem eles a consulta aborta (PGRST100).
- O portal não lê `dp_colaboradores` de colegas: `dp_portal_equipe_unidade()` expõe só nome, função e folga fixa.
- Pré-admissão: o checklist compartilhado governa leitura e envio; desativar requisito preserva anexos.
- Imagem da assinatura (PNG em data URL) é gravada só pelo servidor em `assinatura_imagem` (dp_recibos/dp_documento_aceites), imutável, e estampada no PDF com rubrica em todas as páginas — reimpressão fiel.
- Leave-change terms update only the certificate copy's acceptance text/signature after matching content hash and version; keep original PDF and audit evidence.
- Piso do cargo: com sindicato patronal na unidade grava no patronal (convenção); sem patronal grava direto na unidade (Cargo + Unidade) — o patronal acelera, nunca bloqueia.
- Desligamento: Aviso, Documentos e Acerto Rescisório com pendências próprias; sem assinatura digital; Acerto só baixa assinado ou com comprovante — emitir não quita.
- Restrição de um dia: colaborador → `dp_bloqueios` (início=fim); cargo/setor → `dp_folga_limite_regras` com vigência de um dia (máximo 0 = ninguém).
- Revogar cortesia gera carência (`grace`, fim 23:59:59 BRT via `_shared/grace.ts`), nunca ativa; vencida, `company_access_status` bloqueia; banner lê `company_grace_subscriptions` por módulo — evita acesso grátis sem fim.
- Cobrança v2: `billing_accounts` agrupa empresas; painel grava legado + grants só via RPCs `billing_v2_*` (ator explícito); ativar encerra carência; conferência em `billing_v2_reconciliation` — rollback seguro.
- Acesso e preço v2: `get_company_entitlements`/`has_module_access` decidem por empresa coberta em `subscription_companies`; flags `access_model_v2` (legado|sombra|v2, via `access_model_set_mode`) e `checkout_v2` (legado|v2), só super admin; preço só por `billing_v2_quote` — valor nunca vem do navegador.
- Tokens: `:root`/`.dark`, mapped in `tailwind.config.ts`; never route-scoped.
- Troca de plano/ciclo só por `billing_v2_plan_change_quote/schedule/cancel`: upgrade e mensal→anual são imediatos com crédito proporcional; downgrade e anual→mensal ficam em `pending_plan_change` e `billing_v2_apply_scheduled_changes` revalida uso na renovação — valor calculado no banco.
- Read subdirectory `AGENTS.md` before edits.
- Manager-created swaps use a dedicated authorized atomic RPC and immutable origin; reuse the leave motor and linked evidence, never synthesize participant consent/signatures or external attendance postings.
- Manager swap shortcuts retain employee/date context and offer leave dates from the shared operational calendar, with server preview and atomic registration remaining authoritative to avoid invented dates or bypassed checks.
- Pre-admission correction/retake uses a service-only atomic RPC with expected version and actor audit; retake is explicit, never triggered by an upload, and never bypasses admission checks. Renew the existing non-revoked invite without shortening its expiry or exposing/regenerating its token; WhatsApp refers to the previously received link.
- Portal request refusals are classified by server domain tokens before notifying; preserve transport errors for audit and never classify Pix failures by matching prose.
- Stale-bundle recovery shares a 30-second sessionStorage guard across global, lazy and boundary handlers; without persistent storage only manual recovery is safe.
- Certificate external files are rendered and serialized in isolated PDFs before copying pages; keep originals and acceptance evidence unchanged when reproduction fails.
- Admission review saves through the shared form before navigation and reports finalization failures separately; post-review actions reuse official ASO and document workflows. CLT effectivation without a returned registration uses the official audited confirmation only after valid ASO and confirmed accounting dispatch; preserve server authorization and keep the document dialog mounted after effectivation.
- Portal document signing uses a single "Visualizar e Assinar" button opening the full-screen `DocumentoAssinarViewer`; multi-page PDFs require per-page rubric taps (rules in `src/lib/dp/rubrica.ts`) before the final signature is enabled — never reintroduce a locked sign button waiting for a separate preview.
- Unit holiday registration uses the frontend date-order helper with the selected year; retain inactive and non-occurring rules for editing separately from the active annual agenda.
- Unit tabs use a dedicated horizontal scroller with edge controls and active-tab visibility; holiday presentation labels and counts stay in the frontend adapter to preserve stored identifiers and records.
- Holiday category is independent of date calculation; the additive v2 resolver keeps the legacy RPC compatible, and calendars retain all same-day categories through shared presentation helpers (Pessoas/Escala).
- Movable holidays use explicit unit-selected codes and Gregorian computus in the shared helper and database resolver; include the code in reads and replication to keep annual dates consistent without scheduled jobs or automatic holiday enrollment.
- National holiday enrollment defaults to federal fixed dates; its confirmation dialog may include Good Friday only through explicit local opt-in, using the movable code and preserving existing/inactive rules, because Law 9,093/1995, article 2 requires municipal legislation.
- Recrutamento 360 rules live in `src/pages/recrutamento/AGENTS.md`.

- Ações do Dia: decide documents only; other requests use dedicated DSR/release-undo screens.

- Leave previews retain the request row to open its exact details.
- Portal operation uses server-scoped RPCs; approved leave and confirmed absences override work in every source, with shared cache invalidation after decisions and periodic portal refresh to reflect other devices.
- Leave/vacation evidence is source-linked, transactional and impact-protected; cancellation retires it. Administrative completion never implies external posting.
- Occurrence quick filters use the shared type-query helper before the result limit; leave/swap filtering uses source links instead of labels so both absence and worked-day evidence remain visible.
- Occurrence notification focus is consumed with URL replacement and preserved during asynchronous period loading; portal time labels remain neutral unless persisted audit evidence identifies the author, avoiding attribution from confirmation alone.
- Occurrence edits use a manager-only RPC with expected-value locks and before/after audit. Pending punches allow unchanged confirmation without a reason; edits require one. Completed records offer menu-only rectification, never repeat decisions. Preserve original justification; separate forgotten punches from lost-time decisions. History, cancellation and launch stay in the menu; launch is a badge. Details retain impacts; portal shows scheduled times only.
<!-- LOVABLE:BEGIN -->
- Home calendar details reuse the official operation controller via lazyWithRetry; semantic calendar tokens preserve themed absence colors and deploy recovery.
- Document management hosts import and history in a modal; confirmed session completion refreshes the unified list without scrolling the page.
<!-- LOVABLE:END -->

- Catálogo financeiro: `private.catalogo_v4_sincronizar` só cria/vincula conta vazia (log em `category_template_chart_links_log`), nunca renomeia personalizado nem reclassifica lançamentos; DRE por código via `computeDreGerencial`.
- Desligamento: datas só pelo motor compartilhado `supabase/functions/_shared/desligamento-motor.ts` (navegador reexporta); gravação só via Edge `dp-desligamento-aviso` → RPCs service_role; vínculo só é inativado pelo worker `dp_desligamento_processar` (cron) ou registro legado na data calculada — evita desligamento antecipado.
- Termination planning and registration share conditions and bank controls; proposed leave dates are recalculated by the server and persisted with process-linked agenda records atomically, preserving cancellation evidence and legal end dates.
- Termination calendar diagnostics and terminal bank concentration use one shared pure helper; read-only projections never persist agenda changes, and compensation updates cannot change the process legal end or settlement deadline, preventing simulation from becoming attendance accounting.
- Termination notifications identify employees in the shared server notifier and navigate with collaborator_id, never the process ref_id; this covers every producer without duplicating identity logic.
- Pre-admission activation inherits the reviewed habitual sector into the employee and empty worked-day slots, preserving explicit daily sectors and validating company scope.
- Provisional employee cards resolve admission by company-scoped routine ID and open the official review form; admission updates synchronize operational fields transactionally without formalizing the regime or replacing past schedule configurations.
- Pre-admission document groups use requirement plus person identity and retain individual versioned decisions; portrait panning protects the face guide while document cropping protects all edges, using the shared geometry helper.
- Portal access enters the consult-only state `aviso_pos_trabalho` after the last attendance of a running notice (decided in the DB wrapper over `dp_portal_decisao_base`); operational RPCs keep requiring `ativo`, so colleagues' routines are hidden automatically.
- Termination preparation lives in `dp_desligamento_preparacoes` (admin-only, never read by the portal); the official process, agenda changes and employee notifications are created only after the manager confirms the conversation happened, so employees are never surprised in the app.
- Contract anniversaries use a shared eligibility/current-contract-date helper; portal celebrations use a session-scoped minimal RPC with no birth year or age, keeping administrative birth information out of colleague reads.
- Admission/start calendar events are read-only projections, separate from anniversaries, distinguishing provisional routine starts from formal admission without changing employment records.
- Reconciliation may settle an existing pending entry (same type, exact open amount, no date limit) via `pluggy_conciliacao_baixar`, which revalidates server-side to avoid duplicates.
