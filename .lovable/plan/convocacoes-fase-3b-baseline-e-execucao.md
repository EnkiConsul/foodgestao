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
- **3B.1 coexistência segura + planejamento/configuração — em execução**
- 3B.2 publicação · 3B.3 resposta/vagas · 3B.4 indisponibilidade/encerramentos · 3B.5 substituição/descumprimento — não iniciadas
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

### 3.6 Baseline após a execução da 3B.1

Preenchido ao final do bloco, comparando com a tabela do item 1.
