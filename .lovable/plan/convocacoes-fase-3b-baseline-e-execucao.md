# Convocações — Fase 3B · baseline técnico e registro de execução

Documento de evidência auditável. Não altera comportamento da aplicação.

## 1. Baseline técnico pré-3B (medido antes da primeira migration da 3B.1)

| Verificação | Resultado | Observação |
| --- | --- | --- |
| `npm run build` | exit 1 | Falha exclusivamente no `prebuild` (security-lint legado): 229 críticos + 255 warnings pré-existentes. `npx vite build` isolado: exit 0. |
| `npm test` (`vitest run`) | exit 1 | 98 arquivos (92 ok, 2 falhos, 4 skipped) · 960 testes (912 ok, 2 falhos, 46 skipped). |
| Testes falhos | 2 | `src/lib/orders/__tests__/orders-domain.test.ts`, `src/lib/orders/__tests__/orders-entitlement.test.ts` — pré-existentes, módulo Pedidos. |
| `npm run lint` | 1414 problemas | 6 erros + 1408 warnings, pré-existentes. |
| `npm run typecheck:strict` | 46 erros | Todos pré-existentes, nenhum em Convocações. |

Nenhuma dessas falhas é atribuível às fases 3A.0, 3A.1 ou 3A.1.1. Não corrigir esses débitos dentro do escopo de Convocações, salvo se a própria fase tocar o arquivo/regra.

Regra de validação das próximas fases: uma falha só é considerada **nova** se não constar desta tabela.

## 2. Estado das fases

- 3A.0 diagnóstico e desenho — concluída
- 3A.1 fundação aditiva (M1–M9) — concluída
- 3A.1.1 hardening (timezone, FKs compostas, 50% intermitente, grants) — concluída e aprovada
- **3B.1 coexistência segura + planejamento/configuração — 🟡 implementação concluída e evidências estáticas aprovadas; validação funcional/concorrente pendente por indisponibilidade de ambiente isolado e credencial executável adequada**
- 3B.2 publicação · 3B.3 resposta/vagas · 3B.4 indisponibilidade/encerramentos · 3B.5 substituição/descumprimento — ⛔ bloqueadas
- Fase 4 frontend/cutover — não iniciada

## 3. Registro de execução — bloco 3B.1

### 3.1 Policies de `dp_convocacoes` — antes

| policy | cmd | escopo |
| --- | --- | --- |
| `dp_convocacoes_admin_all` | ALL | admin/owner da empresa (legado **e** novo fluxo) |
| `dp_convocacoes_read_self` | SELECT | próprio colaborador ativo |
| `dp_convocacoes_respond_self` | UPDATE | próprio colaborador, `pendente` → `aceita`/`recusada`, **sem restrição de colunas** |

### 3.2 Policies de `dp_convocacoes` — depois

| policy | cmd | escopo |
| --- | --- | --- |
| `dp_convocacoes_admin_select` | SELECT | admin/owner (legado + novo) |
| `dp_convocacoes_admin_insert_legacy` | INSERT | admin/owner **e** `ocorrencia_id IS NULL` |
| `dp_convocacoes_admin_update_legacy` | UPDATE | admin/owner **e** `ocorrencia_id IS NULL` em USING **e** WITH CHECK |
| `dp_convocacoes_admin_delete_legacy` | DELETE | admin/owner **e** `ocorrencia_id IS NULL` |
| `dp_convocacoes_read_self` | SELECT | inalterada (próprio, legado + novo) |
| `dp_convocacoes_respond_self` | UPDATE | próprio, `ocorrencia_id IS NULL` em USING **e** WITH CHECK, `pendente` → `aceita`/`recusada` |

### 3.3 Proteção de colunas no caminho legado

`trg_00_dp_convocacao_legacy_self_columns` (BEFORE UPDATE, prefixo `00` porque o PostgreSQL dispara triggers do mesmo evento em ordem alfabética — precisa avaliar o `NEW` original antes de `trg_dp_convocacao_guard`, `trg_dp_convocacao_sync_escala` e `trg_dp_convocacoes_updated_at`).

Atua somente quando `OLD.ocorrencia_id IS NULL`, o ator é o próprio colaborador ativo da linha e não é admin/owner da empresa. Nesse caso só admite alteração de `status`, `respondida_em` e `motivo_recusa`.

### 3.4 RPCs entregues

`dp_convocacao_criar_grupo`, `dp_convocacao_atualizar_grupo`, `dp_convocacao_criar_ocorrencia`, `dp_convocacao_atualizar_ocorrencia`, `dp_convocacao_revisar_ocorrencia`, `dp_convocacao_salvar_config` — todas `SECURITY DEFINER`, `search_path` fixo, `auth.uid()` obrigatório, empresa derivada no backend, `EXECUTE` revogado de PUBLIC/anon e concedido apenas a `authenticated`.

Semântica: criação idempotente por ID estável (mesmo conteúdo → retorna existente sem evento; conteúdo incompatível → `IDEMPOTENCY_CONFLICT`); edição de rascunho com lock, no-op idempotente e controle otimista por `p_expected_updated_at` (`CONCURRENT_MODIFICATION`).

### 3.5 Vocabulário de eventos do bloco

`grupo_criado`, `grupo_atualizado`, `ocorrencia_criada`, `ocorrencia_atualizada`, `ocorrencia_revisada`, `config_criada`, `config_atualizada`. Alteração efetiva → 1 evento; retry/no-op → 0 eventos.

Ajuste necessário na fundação: `dp_convocacao_eventos` exigia referência a grupo/ocorrência/convocação. Eventos de configuração não têm essa referência, então o `CHECK` e o trigger `dp_conv_evento_deriva` passaram a aceitar `tipo LIKE 'config\_%'` com `company_id` obrigatório e validado. Nenhum outro tipo de evento perdeu a exigência de referência.

Ajuste da M13: o `CHECK` e o trigger passaram a aceitar **apenas** `config_criada` e `config_atualizada` sem referência (fail closed).

### 3.6 Migrations do bloco

| arquivo | conteúdo |
| --- | --- |
| `20260824030659_cd5ecff5-c232-4ec0-89af-e74837a53acc.sql` | M10 — RLS separada por comando + trigger de colunas do caminho legado |
| `20260824031233_5fab6860-b131-408f-b0e8-79d952785153.sql` | M11 — RPCs de grupo, ocorrência, revisão e configuração + grants |
| `20260824031514_c3e2c2e1-cf62-4b1c-a2be-337e3b0f5ab5.sql` | M12 — eventos de configuração sem referência |
| `20260824040005_07644834-ade9-4fe9-a367-e48764c13e53.sql` | M13 — correções de concorrência/idempotência, controle otimista, auditoria do papel e fail closed de eventos |

### 3.7 Resultados dos testes (transações revertidas, zero resíduo)

Coexistência (M10): admin INSERT legado OK · INSERT com `ocorrencia_id` bloqueado (42501) · UPDATE legado→novo bloqueado (42501) · UPDATE/DELETE de linha nova afetam 0 linhas · admin lê legado + novo · colaborador lê as próprias 2 linhas · colaborador não responde oferta nova (0 linhas) · 9 campos materiais (`data`, `entrada`, `saida`, `carga_prevista_horas`, `prazo_resposta`, `unidade_id`, `observacao`, `ocorrencia_id`, `colaborador_id`) bloqueados (42501) · resposta legítima só com `status`/`motivo_recusa` → 1 linha.

RPCs (M11/M12): criação gera 1 evento; retry idêntico devolve o recurso com 0 eventos; mesmo ID com conteúdo diferente → `IDEMPOTENCY_CONFLICT` (grupo e ocorrência) · edição com `p_expected_updated_at` correto altera e gera 1 evento; retry do mesmo estado → no-op com 0 eventos; `updated_at` divergente (passado ou futuro) → `CONCURRENT_MODIFICATION` · unidade/empresa derivadas do grupo, sem parâmetros estruturais nas RPCs de edição · revisão de rascunho → `INVALID_STATE`; revisão de publicada cria sucessora versão 2 e marca a predecessora `revisada` (1 evento); retry devolve a mesma sucessora sem evento; segunda sucessora → `REVISION_CONFLICT` com exatamente 1 sucessora existente · configuração cria/atualiza com 1 evento e retry sem evento · unidade/empresa de outra empresa → `FORBIDDEN` · 7 eventos no total, 7 tipos distintos, nenhum sem empresa.

### 3.8 Baseline após a 3B.1 (comparação)

| Verificação | Antes | Depois |
| --- | --- | --- |
| `npx vite build` | exit 0 | exit 0 |
| `npm test` | 912 ok / 2 falhos / 46 skipped | 912 ok / 2 falhos / 46 skipped (mesmos 2 de Pedidos) |
| `npm run lint` | 1414 (6 erros) | 1414 (6 erros) |
| `npm run typecheck:strict` | 46 erros | 46 erros, 0 em Convocações |
| Linter Supabase | 153 anon + 259 authenticated SECURITY DEFINER | 153 anon (inalterado) + 265 authenticated (+6 = exatamente as 6 RPCs do app, que validam admin/owner internamente) |

Nenhuma regressão nova atribuível ao bloco.

Medição executada após a M13 (UTC 2026-08-24 ~04:11):
- `npx vite build`: exit 0, built in 28.28s.
- `npm test`: 98 arquivos (92 passed, 2 failed, 4 skipped), 960 testes (912 passed, 2 failed, 46 skipped). Falhas: `src/test/unit/orders-domain.test.ts` e `src/test/unit/orders-entitlement.test.ts` — ambas pré-existentes no módulo Pedidos.
- `npm run lint`: 1414 problemas (6 erros, 1408 warnings).
- `npm run typecheck:strict`: 46 erros, nenhum em arquivos de Convocações.

### 3.9 Rollback

Reversão do bloco, em ordem: `DROP FUNCTION` das 6 RPCs e dos 2 helpers (`dp_convocacao_log_evento`, `dp_convocacao_exige_admin`); restaurar o `CHECK` `dp_conv_evento_referencia_check` e a versão anterior de `dp_conv_evento_deriva` (M12); `DROP TRIGGER trg_00_dp_convocacao_legacy_self_columns` e a função `dp_convocacao_legacy_self_columns`; substituir as 4 policies de admin pela `dp_convocacoes_admin_all` (ALL) e restaurar `dp_convocacoes_respond_self` sem `ocorrencia_id IS NULL`.

Rollback específico da M13: recriar as 6 RPCs, `dp_convocacao_log_evento` e `dp_conv_evento_deriva` conforme as versões M11/M12 (ou seja, sem `INSERT ... ON CONFLICT`, sem reconsulta tenant-scoped, sem controle otimista em `salvar_config`, sem resolução de papel do ator e com `CHECK`/`trigger` aceitando `tipo LIKE 'config\_%'`); recriar a assinatura anterior de `dp_convocacao_salvar_config` sem `p_expected_updated_at`. Nenhuma coluna, tabela ou dado é criado ou removido pelo bloco, portanto o rollback não implica perda de dados.

### 3.10 Dados artificiais

0 registros em `dp_convocacao_grupos`, `dp_convocacao_ocorrencias`, `dp_convocacoes`, `dp_convocacao_eventos`, `dp_convocacao_config`, `dp_indisponibilidades` e `dp_convocacao_descumprimentos` após todos os testes.

## 4. M13 — execução e evidências

### 4.1 Migration e registro

- Arquivo: `supabase/migrations/20260824040005_07644834-ade9-4fe9-a367-e48764c13e53.sql`.
- Aplicação: migration executada com sucesso no Cloud (a própria migration contém um bloco `DO` que falha se `dp_convocacao_salvar_config` não ficar com exatamente uma assinatura; a aplicação não falhou).
- Presença no repositório confirmada (`ls supabase/migrations | tail -4`).

### 4.2 Correções entregues pela M13

1. **Autorização antes de qualquer lock** — em `atualizar_grupo`, `atualizar_ocorrencia`, `revisar_ocorrencia` e `criar_ocorrencia` a empresa é lida sem lock, `dp_convocacao_exige_admin` é chamado e só então ocorre `FOR UPDATE`.
2. **Criação concorrência-safe de grupo** — `INSERT ... ON CONFLICT (id) DO NOTHING`, retorno idempotente se o conteúdo casar, `IDEMPOTENCY_CONFLICT` se não casar, reconsulta restrita a `company_id`/`unidade_id` autorizados.
3. **Criação concorrência-safe de ocorrência** — mesmo padrão, com reconsulta tenant-scoped (`id` + `company_id` + `grupo_id`) e reconciliação do retry antes de exigir `status = 'rascunho'`.
4. **Ordem correta da revisão** — predecessora marcada como `revisada` antes do `INSERT` da sucessora, evitando violação do índice `uq_dp_conv_ocor_necessidade_vigente` quando a identidade da necessidade é preservada.
5. **Reconciliação completa da revisão** — cadeia coerente, conteúdo material e `p_motivo` comparados ao único evento `ocorrencia_revisada` correspondente; estado impossível → `REVISION_INCONSISTENT`; divergência → `IDEMPOTENCY_CONFLICT`.
6. **Controle otimista em `dp_convocacao_salvar_config`** — novo parâmetro `p_expected_updated_at`; criação via `ON CONFLICT` da constraint de escopo; `CONCURRENT_MODIFICATION` se o conteúdo divergir sem `expected_updated_at` correto.
7. **Fail closed de eventos sem referência** — `CHECK` e trigger `dp_conv_evento_deriva` aceitam apenas `config_criada` e `config_atualizada` quando não há grupo/ocorrência/convocação.
8. **Auditoria do papel real** — `dp_convocacao_log_evento` resolve `ator_papel` via `company_members.role` (`owner` ou `admin`); se não resolver e o usuário estiver autenticado, falha fechada com `AUDIT_ACTOR_ROLE_UNRESOLVED`.

### 4.3 Evidências verificadas por catálogo

| Verificação | Comando/observação | Resultado |
| --- | --- | --- |
| Assinatura única de `dp_convocacao_salvar_config` | `select count(*) from pg_proc where proname='dp_convocacao_salvar_config'` | `1` |
| Assinatura inclui `p_expected_updated_at` | `select pg_get_function_identity_arguments(...)` | `..., p_expected_updated_at timestamp with time zone` |
| `CHECK` de eventos fechado | `select pg_get_constraintdef(...) where conname='dp_conv_evento_referencia_check'` | `tipo = ANY (ARRAY['config_criada','config_atualizada'])` |
| Grants das 6 RPCs | ACL em `pg_proc` | `authenticated=X`, `service_role=X`; sem `PUBLIC`/`anon` |
| Grants dos helpers internos | ACL de `dp_convocacao_exige_admin` e `dp_convocacao_log_evento` | apenas `postgres`/`service_role` |
| Zero registros nas tabelas de Convocações | `select count(*)` em cada tabela | `0` em todas as 7 tabelas |
| Chamador de `salvar_config` no frontend | `rg "salvar_config" src` | Apenas `src/integrations/supabase/types.ts` (tipos gerados) |

### 4.4 Baseline final medido

Medição executada em UTC 2026-08-24 ~04:11:

- `npx vite build`: exit 0, built in 28.28s.
- `npm test`: 98 arquivos (92 passed, 2 failed, 4 skipped); 960 testes (912 passed, 2 failed, 46 skipped). Falhas: `src/test/unit/orders-domain.test.ts` e `src/test/unit/orders-entitlement.test.ts` — pré-existentes no módulo Pedidos.
- `npm run lint`: 1414 problemas (6 erros, 1408 warnings) — pré-existentes.
- `npm run typecheck:strict`: 46 erros — pré-existentes, nenhum em arquivos de Convocações.

Nenhuma regressão nova atribuível à M13.

### 4.5 Validação funcional e concorrente — NÃO EXECUTADA

Os seguintes cenários ainda não foram executados:

- Criação concorrente de grupo (mesmo ID + mesmo payload; mesmo ID + payload diferente).
- Criação concorrente de ocorrência (mesmo ID + mesmo payload; mesmo ID + payload diferente).
- Colisão de UUID cross-tenant com a linha da outra empresa travada em outra sessão (deve retornar `IDEMPOTENCY_CONFLICT` sem esperar o lock).
- Criação de ocorrência × publicação simulada (sessão A publica; sessão B deve receber `NOT_DRAFT` sem criar).
- Retry da ocorrência após publicação (criar → publicar → repetir a mesma criação → idempotente).
- Revisão mantendo a mesma identidade da necessidade (mudando só vagas/condições).
- Retry da revisão com payload e motivo iguais; retry com payload material diferente; retry com só o motivo diferente.
- Cadeia artificialmente corrompida → `REVISION_INCONSISTENT`.
- Concorrência de configuração (mesma versão em duas sessões; duas criações simultâneas do mesmo escopo).
- Papel `owner`/`admin` gravado corretamente; papel não resolvível → `AUDIT_ACTOR_ROLE_UNRESOLVED`.

**Motivo técnico:** o papel do sandbox (`sandbox_exec`) não tem `EXECUTE` nas RPCs de Convocações (`has_function_privilege(..., 'EXECUTE') = false` para `dp_convocacao_criar_grupo` e `dp_convocacao_salvar_config`). Além disso, não há ambiente isolado (Supabase Branch, staging ou local) disponível; o único banco acessível é o produtivo. Por decisão do usuário, nenhum teste funcional será executado em produção, e nenhum dado artificial será gravado apenas para gerar evidência.

**Pré-requisitos para executar a bateria:**

1. Ambiente isolado compatível com o schema atual (preferência: Supabase Branch; fallback: stack Supabase local via CLI aplicando as migrations do repositório).
2. Fixtures sintéticas: duas empresas, usuários `owner` e `admin` (e usuários de empresas distintas quando o cenário exigir). Nenhum dado real da produção.
3. Sessões PostgreSQL independentes e chamadas RPC com JWT `authenticated` reais. `service_role` apenas para preparar fixtures, consultar resultados e limpar.
4. Para o teste de lock cross-tenant, usar `lock_timeout`/medição de duração como evidência objetiva.

### 4.6 Conclusão do estado

A M13 está aplicada e as evidências estáticas (catálogo, grants, assinatura única, `CHECK` fechado, baseline sem regressão, zero dados artificiais) estão aprovadas. A validação funcional e concorrente é **obrigatória** antes de declarar a 3B.1 encerrada, mas não pôde ser executada neste ambiente. A fase permanece em 🟡 e a 3B.2 permanece ⛔ bloqueada até que a bateria seja executada em ambiente isolado e os resultados sejam registrados neste documento.


