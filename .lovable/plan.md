# Roadmap completo — DP 360° (Fases 3 a 11)

Execução em sequência, na ordem sugerida. Cada fase entrega migration + telas + hooks e passa por `tsgo --noEmit` antes da próxima.

## Decisões consolidadas

1. **Ordem**: Fase 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11.
2. **Escopo**: implementar todas as fases em sequência, sem pausa entre elas.
3. **Login do colaborador**: usa a mesma `auth.users` do sistema principal. Cadastro de colaborador em `/dp/colaboradores` ganha bloco "Acesso ao Portal" (e-mail + convite) que cria o usuário e vincula `dp_colaboradores.user_id`. Permissionamento por módulo do DP (Folgas, Documentos, Solicitações, Trocas, Perfil) é armazenado em `dp_colaboradores.dp_permissions` (JSONB) — colaborador NUNCA vê módulos Financeiro/CRM/RH/Pedidos.
4. **Integração Financeiro↔DP**: adiantamento/contracheque/13º aprovados no DP entram em fila `dp_folha_lancamentos` com status `aguardando_aprovacao_financeiro`. Usuário do Financeiro aprova em `/dp/folha/aprovacoes` (visível também no Financeiro como card no dashboard) → gera `transactions` (despesa a pagar) automaticamente com categoria mapeada. Férias/VA/VT ficam previstos na estrutura mas ativados em fase futura.

---

## Fase 3 — Estrutura organizacional

**Migration:**
- `dp_unidades` (nome, cnpj, endereço, ativo).
- `dp_cargos` (nome, cbo, salario_base).
- `dp_sindicatos` (nome, cnpj, data_base, contato).
- ALTER `dp_colaboradores` add `unidade_id`, `cargo_id`, `sindicato_id`, `dp_permissions jsonb`, `user_id uuid` (FK `auth.users`, nullable).

**Telas:** `/dp/cadastros` (hub), `/dp/cadastros/unidades`, `/dp/cadastros/cargos`, `/dp/cadastros/sindicatos`.

## Fase 4 — Comunicação interna

**Migration:** `dp_avisos` (titulo, corpo, prioridade, publico_alvo, expira_em), `dp_mensagens` (from_user, to_colaborador, corpo, lida_em).

**Telas:** `/dp/avisos`, `/dp/mensagens`. Widgets no `DpHome`: Aniversariantes, Avisos recentes, Sino de notificações no topbar.

## Fase 5 — Documentos por categoria

**Migration:** ALTER `dp_documentos` add `categoria` (enum: `contracheque | adiantamento | ponto | atestado | disciplinar | sindicato | outros`), `competencia date`, `cid text`, `dias_afastamento int`.

**Telas:** `/dp/documentos/{contracheque|adiantamento|ponto|atestados|disciplinar|sindicato}` + importador em lote (upload CSV/ZIP, auto-vínculo por matrícula).

## Fase 6 — Disciplinar & Bloqueios

**Migration:** `dp_registros_disciplinares` (tipo, gravidade, descricao, ciencia_em, anexo_path), `dp_bloqueios` (colaborador_id, motivo, inicio, fim).

**Telas:** `/dp/disciplinar` (admin), `/dp/bloqueios` (admin). Histórico exibido no perfil do colaborador.

## Fase 7 — Trocas de plantão

**Migration:** `dp_trocas` (solicitante_id, destinatario_id, data_original, data_proposta, status: `pendente_par | pendente_admin | aprovada | recusada`).

**Telas:** `/dp/trocas` (admin) + `/dp/meu/trocas` (colaborador). Fluxo triplo: solicitar → aceite do par → aprovação do admin. Notificação in-app.

## Fase 8 — Portal do Colaborador (self-service)

**Migration:**
- Adiciona role `dp_colaborador` no enum `app_role`.
- Função `is_dp_colaborador(uuid)` SECURITY DEFINER.
- Policies em todas as tabelas `dp_*` liberando SELECT/UPDATE apenas nos próprios registros do colaborador logado.
- Edge function `dp-invite-colaborador` (reaproveita padrão `accept-invite`): cria user, atribui role, vincula `dp_colaboradores.user_id`, envia e-mail.

**Telas:**
- `ColaboradorShell` (layout reduzido, só menu DP).
- `/dp/meu` — home (pendências, próximas folgas, avisos).
- `/dp/meu/perfil` — dados pessoais.
- `/dp/meu/documentos` — meus contracheques/atestados/adiantamentos.
- `/dp/meu/solicitacoes` — abrir folga/atestado/adiantamento.
- `/dp/meu/trocas` — solicitar/aceitar trocas.
- `/dp/meu/historico` — histórico completo.

**Redirecionamento pós-login:**
- `dp_colaborador` (sem outras roles) → `/dp/meu` direto, sem passar pelo Hub.
- Usuário com múltiplas roles (admin + colaborador) → mantém `/hub`.

**Cadastro:** `ColaboradorFormDialog` ganha aba "Acesso ao Portal":
- Toggle "Criar acesso ao portal" → campo e-mail + botão "Enviar convite".
- Bloco de permissões (RadioGroup por módulo DP: `folgas | documentos | trocas | solicitacoes | perfil` × `view | edit | none`), reaproveitando padrão de `PermissionsEditor`.

## Fase 9 — Sindicatos & Negociações

**Migration:** `dp_sindicato_negociacoes` (sindicato_id, data_base, reajuste_pct, clausulas_json, pdf_path, vigencia_inicio, vigencia_fim).

**Telas:** `/dp/sindicatos/negociacoes` + histórico por sindicato.

## Fase 10 — Aprovações centralizadas & Notificações

**Migration:** `dp_notificacoes` (user_id, tipo, ref_table, ref_id, lida_em) + triggers em `dp_solicitacoes`, `dp_trocas`, `dp_registros_disciplinares` que populam a fila.

**Telas:** `/dp/aprovacoes` (filas por tipo, ações em lote). Sino de notificações no topbar via Supabase Realtime.

## Fase 11 — Folha & Integração Financeiro

**Migration:**
- Enum `dp_folha_tipo`: `adiantamento | contracheque_mensal | contracheque_quinzenal | decimo_terceiro` (com `ferias | vale_alimentacao | vale_transporte` já no enum, marcados como "não gerados nesta fase").
- `dp_folha_periodos` (competencia, tipo, status: `aberto | fechado | aprovado_dp | aprovado_financeiro | pago`).
- `dp_folha_lancamentos` (periodo_id, colaborador_id, tipo, valor_bruto, descontos_json, valor_liquido, status, transaction_id nullable, contracheque_documento_id nullable).
- ALTER `dp_folha_lancamentos` add `financeiro_categoria_id`, `financeiro_account_id` (defaults por unidade).
- Trigger: ao mudar `status → aprovado_financeiro`, insere `transactions` (despesa PJ, `due_date` = data de pagamento, `bill_status = a_pagar`).
- RPCs:
  - `dp_folha_gerar_adiantamento(periodo_id)` — cria lançamentos por colaborador ativo.
  - `dp_folha_gerar_contracheque(periodo_id, quinzenal boolean)` — calcula bruto − adiantamento − descontos.
  - `dp_folha_gerar_13o(ano)` — 1ª e 2ª parcela.
  - `dp_folha_gerar_pdf(lancamento_id)` — gera contracheque PDF e grava em `dp_documentos`.

**Telas:**
- `/dp/folha` — hub com abas: Adiantamento, Mensal, Quinzenal, 13º.
- `/dp/folha/periodos/:id` — grade de colaboradores × valores, edição individual, "Enviar para aprovação do Financeiro".
- `/dp/folha/aprovacoes` — visão do usuário Financeiro (badge no dashboard Financeiro): aprova/rejeita em lote, define conta bancária de origem.
- Colaborador: `/dp/meu/documentos/contracheques` lista + download PDF.

**Estrutura preparada para futuro (não implementado na Fase 11):**
- Férias (com cálculo de terço constitucional).
- Vale alimentação / Vale transporte.

---

## Detalhes técnicos transversais

- **Layout dinâmico:** `AppLayout` detecta se usuário é `dp_colaborador` puro e monta `ColaboradorShell` ao invés do sidebar completo.
- **Storage:** bucket privado `dp-documentos` já existe; novos PDFs de contracheque salvam em `<company_id>/<colaborador_id>/contracheques/<competencia>.pdf`.
- **Permissões DP:** hook `useDpPermissions()` retorna `{ folgas, documentos, trocas, solicitacoes, perfil }` do colaborador atual, usado em cada rota `/dp/meu/*`.
- **RLS:** todas as tabelas novas seguem padrão 360°FOOD — GRANT explícito + policy por `company_id` via `is_company_member` OU por `user_id` para o colaborador dono do registro.
- **Convite:** e-mail transacional reaproveita template `company-invite.tsx` com variação `dp-colaborador-invite`.
- **Validação por fase:** `tsgo --noEmit` obrigatório antes de avançar. Playwright ao final (login como colaborador → ver contracheque; login como admin → gerar folha → aprovar → ver transação no Financeiro).

## Estimativa

Total: ~15 migrations, ~35 páginas novas, ~20 componentes, 1 edge function nova. Execução ininterrupta na ordem acima.
