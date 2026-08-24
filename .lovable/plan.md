# M13 — validação final: limitação de ambiente e registro auditável honesto

## Resultado da checagem de pré-requisitos (feita agora, somente leitura)

Os testes concorrentes **não podem ser executados neste ambiente**, e não só por causa do COMMIT em produção:

- O único banco alcançável a partir do sandbox é o banco produtivo do projeto. Não há branch Supabase, staging nem cópia local do schema atual.
- O papel do sandbox é `sandbox_exec` e **não tem `EXECUTE` em nenhuma RPC de Convocações**. Verificado por privilégio efetivo: `has_function_privilege('dp_convocacao_criar_grupo(...)','EXECUTE') = false` e o mesmo para `dp_convocacao_salvar_config(...)`. A ACL das funções é `postgres`, `authenticated`, `service_role` — o papel do sandbox não está lá.

Consequência objetiva: **nenhum** teste funcional das RPCs é executável daqui — nem concorrente com COMMIT, nem comum com `BEGIN`/`ROLLBACK`. Isso inclui revisão, divergência de motivo, `REVISION_INCONSISTENT`, papel `owner`/`admin` e `AUDIT_ACTOR_ROLE_UNRESOLVED`, porque todos exigem chamar as funções.

Conforme sua instrução, **paro antes dos testes** em vez de mexer em dados reais ou inventar evidência. Nada foi escrito no banco: as consultas desta checagem foram apenas `SELECT` em catálogo e contagens.

## O que consegui observar de fato (evidência estática, somente leitura)

- M13 aplicada e registrada: `supabase/migrations/20260824040005_07644834-ade9-4fe9-a367-e48764c13e53.sql`, aplicada com sucesso no Cloud (a própria migration contém uma verificação que a faria falhar se a assinatura ficasse duplicada).
- Assinatura única: `count(*) = 1` para `dp_convocacao_salvar_config` em `pg_proc`; a assinatura antiga foi removida e a nova inclui `p_expected_updated_at timestamptz`.
- `CHECK dp_conv_evento_referencia_check` agora é `tipo = ANY (ARRAY['config_criada','config_atualizada'])` — fail closed confirmado no catálogo.
- Grants finais: as 6 RPCs do app com `authenticated=X` e `service_role=X`, sem `PUBLIC` e sem `anon`; os helpers `dp_convocacao_exige_admin` e `dp_convocacao_log_evento` apenas `postgres`/`service_role`.
- Zero registros artificiais: `dp_convocacao_grupos`, `dp_convocacao_ocorrencias`, `dp_convocacao_eventos`, `dp_convocacao_config`, `dp_convocacoes`, `dp_convocacao_descumprimentos`, `dp_indisponibilidades` — todas com 0 linhas.
- Sem chamador de `dp_convocacao_salvar_config` no frontend (única referência é o arquivo de tipos gerado), então o parâmetro novo não quebra nada hoje.

## O que farei na documentação

Atualizar somente `.lovable/plan/convocacoes-fase-3b-baseline-e-execucao.md`:

1. Nova seção `## 4. M13 — execução e evidências finais`, separando com clareza:
   - **4.1 Migration e registro** — arquivo, aplicação no Cloud, verificação embutida.
   - **4.2 Correções entregues** — os 7 pontos da M13, com o trecho de código correspondente citado.
   - **4.3 Evidências verificadas por catálogo** — assinatura única, `CHECK` de eventos, grants finais, contagens zero, ausência de chamador no frontend. Cada item com o comando e o retorno observados.
   - **4.4 Baseline final** — `npx vite build`, testes, lint e typecheck medidos agora e comparados ao baseline pré-3B (912 ok / 2 falhos de Pedidos, 1414 lint / 6 erros, 46 erros TS e 0 em Convocações).
   - **4.5 Validação funcional NÃO EXECUTADA — limitação de ambiente** — lista nominal dos cenários pendentes (criação concorrente de grupo e de ocorrência, colisão de UUID cross-tenant com `lock_timeout`, ocorrência × publicação, retry após publicação, revisão com identidade preservada, retry igual/divergente, `REVISION_INCONSISTENT`, concorrência de configuração, papel `owner`/`admin` e fail closed), com o motivo técnico (`sandbox_exec` sem `EXECUTE`; apenas banco produtivo disponível) e o que seria necessário para executá-los: branch Supabase ou staging com o schema atual e uma credencial com papel `authenticated`/`service_role`. Nenhum resultado presumido será escrito como aprovado.
2. `### 3.9 Rollback` — passa a contemplar a M13 explicitamente: restaurar as versões M11/M12 das 6 RPCs, do helper `dp_convocacao_log_evento`, do trigger `dp_conv_evento_deriva` e do `CHECK dp_conv_evento_referencia_check`, e recriar a assinatura anterior de `dp_convocacao_salvar_config` (sem `p_expected_updated_at`), na ordem inversa, sem tocar em dados.
3. `## 2. Estado das fases` — **3B.1 🟡 pendente — validação funcional não executada por limitação de ambiente** (implementação e evidências estáticas aprovadas; nenhuma divergência encontrada). 3B.2 ⛔ não iniciada.

## Fora de escopo

Nenhuma migration nova, nenhuma alteração de schema, de frontend ou de `dp_convocacao_sync_escala`. Nenhum dado gravado em produção. Paro após a documentação e apresento as evidências.

## Decisão que fica com você

Para converter a 3B.1 em ✅ é preciso rodar os cenários funcionais em ambiente isolado. Duas saídas possíveis, e nenhuma delas eu tomo sozinho: provisionar um ambiente de validação (branch/staging) para eu rodar a bateria, ou aceitar o encerramento da 3B.1 com a validação funcional formalmente registrada como pendente.
