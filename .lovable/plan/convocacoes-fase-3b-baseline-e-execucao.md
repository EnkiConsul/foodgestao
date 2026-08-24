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

### 3.9 Rollback

Reversão do bloco, em ordem: `DROP FUNCTION` das 6 RPCs e dos 2 helpers (`dp_convocacao_log_evento`, `dp_convocacao_exige_admin`); restaurar o `CHECK` `dp_conv_evento_referencia_check` e a versão anterior de `dp_conv_evento_deriva` (M12); `DROP TRIGGER trg_00_dp_convocacao_legacy_self_columns` e a função `dp_convocacao_legacy_self_columns`; substituir as 4 policies de admin pela `dp_convocacoes_admin_all` (ALL) e restaurar `dp_convocacoes_respond_self` sem `ocorrencia_id IS NULL`. Nenhuma coluna, tabela ou dado é criado ou removido pelo bloco, portanto o rollback não implica perda de dados.

### 3.10 Dados artificiais

0 registros em `dp_convocacao_grupos`, `dp_convocacao_ocorrencias`, `dp_convocacoes`, `dp_convocacao_eventos`, `dp_convocacao_config`, `dp_indisponibilidades` e `dp_convocacao_descumprimentos` após todos os testes.

