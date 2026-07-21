# Motor de Regras + Categorização Automática por IA

Implementação em camadas (Regras → Similaridade → IA) para categorizar lançamentos automaticamente, com aprendizado contínuo a partir das correções do usuário.

## Arquitetura em 4 camadas

```text
Lançamento novo
   └─► Camada 0: Normalização (SQL IMMUTABLE + espelho TS)
        └─► Camada 1: Regras determinísticas (~60% resolve, custo 0)
             └─► Camada 2: Similaridade pg_trgm (~15-20%, custo 0)
                  └─► Camada 3: IA em lote (Gemini Flash, ~R$0,002/tx)
                       └─► Decisão por confiança (auto/sugerir/branco)
                            └─► Correção humana ⇒ nova regra
```

## Fase 1 — Fundação (3 dias)
- Migration: `CREATE EXTENSION pg_trgm, unaccent`
- Função `private.normalize_description(text)` — remove PIX/TED/NSU/datas/CNPJ/máscaras
- Espelho `src/lib/categorization/normalize.ts` + testes vitest com mesmos casos

## Fase 2 — Motor de regras (1 semana)
- Tabela `public.categorization_rules` (company_id nullable p/ seed global, match_type enum, priority, base_confidence, hit/miss_count, source)
- GRANTs + RLS: leitura via `is_company_member`, escrita via `member_can_edit`; regras `is_system` leitura para authenticated, escrita só service_role
- Índices: unique(company_id, match_type, pattern, tipo), GIN trgm em pattern
- RPC `match_categorization_rule(company, normalized, amount, type, account)` — SECURITY DEFINER, ordena por is_system ASC, priority, length(pattern), hit_count

## Fase 3 — Auditoria e telemetria (3 dias)
- Colunas em `transactions`: `normalized_description` (STORED generated), `review_status` enum, `categorization_layer`, `categorization_rule_id`, `ai_confidence`, `ai_model`, `ai_suggested_*`, `ai_reasoning`, `categorized_at`
- Índice GIN trgm em `normalized_description`; índice parcial em review pendente
- Tabela `categorization_events` (append-only, particionada mensalmente via padrão `manage_audit_logs_partitions`)

## Fase 4 — Aplicação síncrona + fila (4 dias)
- Trigger BEFORE INSERT em `transactions`: tenta Camada 1 inline; se confiança ≥ 0.90 aplica, senão marca `pending` e enfileira
- pgmq: filas `transaction_categorization` + `_dlq` (padrão já usado em `transactional_emails`)
- Função `enqueue_categorization(payload)` SECURITY DEFINER

## Fase 5 — Similaridade histórica (3 dias)
- RPC `match_by_similarity` usando operador `%` de pg_trgm
- Considera apenas transações com `review_status IN ('user_confirmed','user_corrected','manual')` — nunca aprende do que a própria IA classificou

## Fase 6 — Worker de IA em lote (1 semana)
- Edge Function `process-categorization-queue` (`verify_jwt=false` + `CATEGORIZATION_SECRET`, padrão `expire-trials`)
- pg_cron a cada 2 min; lê 30 mensagens (vt=120s)
- Roda Camada 2 primeiro; os que sobram vão em UMA chamada Gemini 2.5 Flash com JSON estrito (catálogo enviado 1x/lote)
- Valida IDs retornados contra catálogo; teto de confiança 0.85
- Extende `ia_usage_control` com `categorization_calls` e `categorization_tokens`
- DLQ quando `read_ct > 5`

## Fase 7 — Aprendizado + política de decisão (4 dias)
- Tabela `categorization_settings` (thresholds, learning_mode_until, budget, auto_create_rules)
- Trigger BEFORE UPDATE OF category_id: cria/reforça regra `user_feedback` (ON CONFLICT reforça `base_confidence +0.01` até 0.995); penaliza `categorization_rule_id` anterior (miss_count++, desativa em 5 erros); atualiza `categorization_events.accepted`
- Modo aprendizado (30 dias): tudo vira `suggested`, nada auto-aplica

## Fase 8 — Seed nacional + onboarding (1 semana)
- INSERTs de seeds: Ambev, Coca-Cola, Atacadão, Assaí, Makro, iFood, Stone, Cielo, PagSeguro, Enel, Sabesp, Vivo (~40-60 padrões), `category_id NULL`
- No onboarding: IA mapeia cada seed → categoria correspondente do plano de contas do cliente

## Fase 9 — Frontend (2 semanas)
- `src/lib/categorization/`: normalize, confidence (thresholds/badges), rules (CRUD/validação) + testes
- Tela "Revisão em lote": fila `suggested` agrupada por padrão, aceitar N num clique
- Badges na lista de Lançamentos: 🟢 auto · 🟡 sugerido · ⚪ branco, com tooltip "porquê"
- Gerenciador de regras: listar, editar, desativar, mostrar `hit_count` e acurácia
- Painel de acurácia (placar do modo aprendizado)

## Fase 10 — Integração ponta a ponta (3 dias)
- `pluggy-sync-connection` continua rápido (só INSERT); categorização acontece via trigger+fila
- Realtime: UI atualiza `review_status` quando worker processa

## Detalhes técnicos

- **RLS/segurança**: toda função SECURITY DEFINER com `SET search_path TO 'public'` e `REVOKE ... FROM anon`. GRANTs explícitos em toda tabela nova (padrão do projeto). Regras `is_system` (company_id NULL) — leitura authenticated, escrita service_role.
- **Modelo IA**: `google/gemini-3-flash-preview` (equivalente atual do 2.5 Flash na gateway Lovable). Contexto fechado justifica não usar Pro.
- **Contrato IA**: JSON estrito, `ref` numérico (não índice), teto 0.85, ID inexistente descartado sem quebrar lote.
- **Custo esperado**: ~800 tx/mês → mês 1 ~R$1,50, mês 6 ~R$0,40 por cliente.

## Critérios de aceite
- Paridade SQL↔TS em `normalize_description` para todos casos de teste
- Regra da empresa vence `is_system` de mesmo padrão; padrão mais específico vence genérico
- Sync Pluggy de 500 tx < 3s (categorização assíncrona)
- Nada auto-aplicado durante `learning_mode_until`
- Correção do usuário cria regra; próxima ocorrência idêntica resolve na Camada 1
- Regra corrigida 5x desativa automaticamente
- Camada 2 não aprende de tx classificada pela IA
- `category_id` inválido do LLM descartado sem quebrar lote
- Orçamento esgotado degrada para Camadas 1–2 sem erro visível
- `typecheck:strict` e `security-lint` verdes

## Marco de release intermediário
Fases 1–5 (~3 semanas) já entregam ~75% de acerto sem uma única chamada de LLM — sugiro liberar para produção antes da Fase 6.

## Duração total
7–8 semanas para o pacote completo.
