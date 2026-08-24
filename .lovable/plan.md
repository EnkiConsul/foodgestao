# Convocações — registro auditável da M13 (encerramento da 3B.1)

Sem nova migration, sem alteração de schema, sem alteração de código do app, sem 3B.2. O único arquivo alterado é o documento auditável `.lovable/plan/convocacoes-fase-3b-baseline-e-execucao.md`.

## Ponto que precisa ficar explícito antes

A M13 foi criada e aplicada com sucesso no Cloud, e a validação embutida na própria migration (assinatura única de `dp_convocacao_salvar_config`) passou — sem isso a migration teria falhado. O que **ainda não foi executado** é a bateria de testes concorrentes em duas sessões descrita no plano da M13: até agora só existe a evidência da aplicação da migration. Portanto não é possível registrar "resultados reais" desses cenários sem antes rodá-los.

Então esta etapa tem duas partes, nesta ordem:

1. Executar a bateria de evidências (leitura + transações revertidas, nada persistido).
2. Escrever no documento a seção com os resultados observados.

Se algum cenário divergir do esperado, eu **paro** e reporto em vez de documentar como aprovado — e aí sim voltaria a existir a necessidade de um ajuste, que não seria feito sem sua autorização.

## Parte 1 — bateria de evidências a executar

Duas sessões `psql` reais, cada cenário em transação revertida (`ROLLBACK`), com contagem de eventos antes/depois:

- Aplicação da M13 e presença dela na lista de migrations do Cloud e do repositório.
- Criação concorrente de grupo: mesmo ID + mesmo payload (1 linha, 1 evento) e mesmo ID + payload diferente (1 criação + `IDEMPOTENCY_CONFLICT`).
- Criação concorrente de ocorrência: os mesmos dois cenários.
- Colisão de UUID cross-tenant com a linha da outra empresa travada em outra sessão: `IDEMPOTENCY_CONFLICT` imediato, sem espera de lock.
- Ocorrência × publicação simulada: A trava o grupo e muda para publicado; B espera, revalida e recebe `NOT_DRAFT` sem criar.
- Retry da ocorrência após publicação: criar → publicar → repetir a mesma criação → idempotente com 0 eventos novos.
- Revisão preservando a identidade da necessidade (empresa/unidade/data/cargo/janela) e mudando só vagas/condições → sucessora criada sem violar `uq_dp_conv_ocor_necessidade_vigente`.
- Retry da revisão: payload e motivo iguais → idempotente, 0 evento; payload material diferente → `IDEMPOTENCY_CONFLICT`; só o motivo diferente → `IDEMPOTENCY_CONFLICT`.
- Cadeia corrompida artificialmente → `REVISION_INCONSISTENT`.
- Configuração concorrente: mesma versão em duas sessões → a segunda recebe `CONCURRENT_MODIFICATION`; duas criações simultâneas do mesmo escopo → 1 linha e 1 evento.
- Auditoria: `ator_papel` gravado como `owner` para owner e `admin` para admin; papel não resolvível → `AUDIT_ACTOR_ROLE_UNRESOLVED`.
- Grants finais das 6 RPCs e dos 2 helpers internos, lidos de `pg_proc`/`information_schema`.
- Assinatura única de `dp_convocacao_salvar_config` em `pg_proc`.
- Contagem zero nas 7 tabelas de Convocações após todos os cenários.
- Baseline final de `npx vite build`, testes, lint e typecheck, comparado ao baseline registrado (912 ok / 2 falhos de Pedidos, 1414 lint / 6 erros, 46 erros TS e 0 em Convocações).

## Parte 2 — seção nova no documento

Acrescentar ao final de `.lovable/plan/convocacoes-fase-3b-baseline-e-execucao.md`:

### `## 4. M13 — execução e evidências finais`

Subseções, cada uma com o resultado observado (comando/erro exato quando houver):

- 4.1 Migration M13 e registro no Cloud (arquivo, timestamp, presença no Cloud e no repositório).
- 4.2 Correções entregues pela M13 (lista objetiva dos 7 pontos).
- 4.3 Testes concorrentes em duas sessões — criação de grupo e de ocorrência.
- 4.4 Colisão de UUID cross-tenant sem espera de lock.
- 4.5 Criação de ocorrência × publicação simulada e retry após publicação.
- 4.6 Revisão com identidade preservada, retry igual/divergente e `REVISION_INCONSISTENT`.
- 4.7 Concorrência de configuração e controle otimista.
- 4.8 Papel `owner`/`admin` e `AUDIT_ACTOR_ROLE_UNRESOLVED` (fail closed).
- 4.9 Grants finais e assinatura única de `dp_convocacao_salvar_config`.
- 4.10 Baseline final de build/test/lint/typecheck × baseline pré-3B.
- 4.11 Zero registros artificiais (contagem por tabela).

E atualizar as seções existentes:

- `### 3.9 Rollback` — passa a listar a M13 explicitamente: restaurar as versões M11/M12 das 6 RPCs, do helper `dp_convocacao_log_evento`, do trigger `dp_conv_evento_deriva` e do `CHECK dp_conv_evento_referencia_check`, além de recriar a assinatura anterior de `dp_convocacao_salvar_config` (sem `p_expected_updated_at`), na ordem inversa e sem tocar em dados.
- `## 2. Estado das fases` — 3B.1 encerrada (backend + registro auditável); 3B.2 não iniciada.

## Observação técnica

`dp_convocacao_salvar_config` hoje tem um parâmetro novo no fim (`p_expected_updated_at timestamptz DEFAULT NULL`) e nenhum chamador no frontend — a única referência no código é o arquivo de tipos gerado. Isso fica registrado em 4.9 como nota de compatibilidade para a 3B.2.

## Parada

Depois de escrever a seção e atualizar rollback/estado das fases, eu paro. Nada de 3B.2.
