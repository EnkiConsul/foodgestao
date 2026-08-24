# Convocações — Fase 3B.1 · Validação funcional da M13 em ambiente isolado

**Estado final: `3B1_VALIDATION_ENVIRONMENT_UNAVAILABLE`**

Fase 0 (diagnóstico de ambiente) foi executada e **reprovou**. Nenhuma migration, RPC, fixture ou alteração de código/banco foi feita. Produção não foi usada como fallback.

## A. Ambiente utilizado — indisponível

| Requisito | Resultado verificado |
| --- | --- |
| Supabase Branch/Preview Branch isolada | **Indisponível** — não há ferramenta de branch/preview exposta a este agente (namespace Supabase só expõe migration, read_query, run_sql, functions, storage, auth config do projeto único de produção). |
| Supabase CLI | **Ausente** (`which supabase` → não encontrado; não é dependência do `package.json`). |
| Docker / Podman | **Ausentes** (`docker`, `podman` não existem no sandbox; `docker info` falha). Sem Docker não há stack Supabase local. |
| PostgreSQL local | **Binários presentes** (`initdb`/`postgres`/`psql` 17.9) — mas ver limitações abaixo. |
| Auth (GoTrue) para emitir JWT `authenticated` real | **Indisponível** — GoTrue faz parte da stack containerizada; sem Docker não há emissão de JWT. |
| Duas sessões PostgreSQL simultâneas | Possível apenas num cluster local (que não pode ser provisionado com fidelidade — ver B). |
| Executar RPC como `authenticated` no banco de produção | **Impossível** — o papel do sandbox não tem `EXECUTE` nas RPCs (limitação já registrada na 3B.1) e o uso funcional em produção é proibido por esta própria tarefa. |

Conclusão da Fase 0: nenhuma das opções A (branch) ou B (stack local via CLI/Docker) está disponível.

## B. Schema reproduzido — não reproduzido

O fallback "só Postgres local, sem stack Supabase" foi avaliado e **não satisfaz** os requisitos desta tarefa:

- 469 migrations no repositório, das quais **254 arquivos** referenciam `auth.users` / `auth.uid()` / `storage.*` / `vault.*` / `supabase_functions` / `pg_net` / `pgsodium` / `pg_cron` — objetos criados pela plataforma Supabase, não pelas migrations.
- Extensões exigidas pelas migrations: `pg_cron`, `pg_net`, `pgmq`, `supabase_vault`, `pg_trgm`, `unaccent`. As três primeiras e o vault **não existem** num Postgres 17 puro do sandbox.
- Papéis `anon`, `authenticated`, `service_role` e o esquema `auth` teriam de ser fabricados por script de teste — isso já é "reproduzir o schema por meios que não as migrations oficiais", proibido pela seção 4.
- Mesmo com fabricação, `auth.uid()` seria emulado por `SET LOCAL request.jwt.claims` + `SET ROLE authenticated`, o que **viola a seção 6** (identidade real vinda de JWT emitido pelo Auth) e enfraqueceria justamente as provas de identidade/papel (7.12).

Por isso não foi executado nenhum `initdb`, nem aplicação parcial de migrations: validar a M13 sobre um schema estruturalmente diferente é explicitamente proibido pela seção 4.

## C. Fixtures criadas

Nenhuma. Zero dados sintéticos criados em qualquer ambiente.

## D–G. Testes M13, concorrência, multiempresa, eventos

**Não executados** (7.1 a 7.12). Motivo único e objetivo: ausência de ambiente isolado com Auth capaz de emitir JWT `authenticated` real. Nenhum resultado é presumido.

## H. Grants e assinatura

Reverificados apenas por **leitura** do catálogo de produção (permitido pela seção 12), confirmando o registro estático da 3B.1:

- `dp_convocacao_salvar_config` — **1 única** assinatura, incluindo `p_expected_updated_at timestamptz`; nenhum overload antigo.
- 6 RPCs de aplicação (`criar_grupo`, `atualizar_grupo`, `criar_ocorrencia`, `atualizar_ocorrencia`, `revisar_ocorrencia`, `salvar_config`): `DEFINER`, ACL = `postgres`, `authenticated`, `service_role`; sem `anon`, sem `PUBLIC`.
- Helpers internos `dp_convocacao_exige_admin` e `dp_convocacao_log_evento`: `DEFINER`, ACL = `postgres`, `service_role` apenas — sem `authenticated`, sem `anon`, sem `PUBLIC`.

## I. Baseline

Não reexecutado nesta tarefa: nada no repositório foi alterado, portanto não há risco de regressão a medir. O baseline vigente permanece o da 3B.1 (vite build exit 0; 912 passed / 2 falhos de Pedidos / 46 skipped; lint 1414 problemas com 6 erros; typecheck strict 46 erros, 0 em Convocações).

## J. Limpeza

Nada a limpar: zero fixtures, zero resíduos, zero escrita em produção.

## K. Estado final

`3B1_VALIDATION_ENVIRONMENT_UNAVAILABLE`

Consequentemente: **3B.1 permanece 🟡** e **3B.2 permanece ⛔**. O documento auditável não foi alterado — a seção 5 só deve ser escrita com resultados reais observados.

## L. Arquivos alterados

Nenhum arquivo do projeto. Apenas este relatório de plano.

## M. Próximo passo recomendado — escolha necessária

Uma das opções abaixo, à sua decisão:

1. **Recomendado — Supabase Branch fora deste agente**: criar uma branch/projeto Supabase descartável e me fornecer, como secrets, a URL, a `anon key`, a `service_role key` e a URL de conexão do banco dessa branch. Com isso eu aplico as migrations oficiais, crio usuários reais no Auth da branch, emito JWT `authenticated` de verdade (`/auth/v1/token`), abro duas sessões PostgreSQL simultâneas e executo integralmente 7.1–7.12, com limpeza e registro de evidências reais.
2. **Aproximação declaradamente parcial (build mode)**: cluster Postgres 17 local com `auth`/papéis fabricados e `request.jwt.claims` emulado. Provaria serialização, locks, idempotência e optimistic concurrency, mas **não** provaria identidade via JWT real; a 3B.1 continuaria 🟡 e a evidência ficaria marcada como parcial.
3. **Manter como está**: 3B.1 🟡 e 3B.2 ⛔ até haver ambiente isolado.

Se quiser a opção 1 ou 2, eu preparo os scripts de teste (duas sessões, `lock_timeout`, contagem de eventos antes/depois, limpeza) e executo em build mode.

## Contexto registrado para a futura 3B.2 (não implementado)

- Público individual aprovado: `colaborador_alvo_id` em `dp_convocacao_ocorrencias`, FK composta com `company_id`, individual ⇒ exatamente 1 alvo e `vagas = 1`, aberta ⇒ `NULL`, alvo imutável após publicação.
- Remuneração V1: `dp_cargo_salarios.salario_base` **não** é valor-hora. Intermitente e Freelancer horista exigem `valor_hora > 0`; Freelancer diarista exigirá fonte autoritativa `valor_diaria`; Freelancer mensalista não elegível. Nenhuma conversão inventada.
- Convocação aberta: 0 elegíveis ⇒ `PUBLICATION_NO_ELIGIBLE`; elegíveis < vagas ⇒ publica com diagnóstico; Option A resolvida pela ordem determinística `(data, necessidade_entrada, necessidade_saida, cargo_id, id)`.
