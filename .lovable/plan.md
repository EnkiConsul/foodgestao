# Convocações — Migration corretiva final da Fase 3B.1 (M13)

Encerramento da 3B.1 com uma única migration incremental (M13). M10/M11/M12 permanecem intocadas. Nada de frontend, nada de publicação real, `dp_convocacao_sync_escala` intocado, 3B.2 não iniciada.

O que confirmei lendo a M11 aplicada:

- `criar_grupo` e `criar_ocorrencia` usam `SELECT ... WHERE id = ?` sem lock e depois `INSERT` — duas chamadas concorrentes com o mesmo UUID podem colidir na chave primária e a segunda recebe erro bruto de constraint em vez de idempotência ou `IDEMPOTENCY_CONFLICT`.
- `criar_ocorrencia` lê o grupo sem `FOR UPDATE` e valida `status = 'rascunho'` sobre essa leitura suja.
- `revisar_ocorrencia` declara retry idempotente apenas por `v_existente.id = p_sucessora_id`, sem comparar conteúdo nem checar a coerência da cadeia.
- `salvar_config` não tem controle otimista: dois gestores com a mesma versão fazem lost update silencioso; e duas criações simultâneas do mesmo escopo estouram o UNIQUE cru.
- `log_evento` grava `ator_papel = 'admin'` fixo, embora `private.is_company_admin_or_owner` aceite `role IN ('owner','admin')` de `company_members` — o papel real está disponível nessa tabela.
- A exceção da M12 admite qualquer `tipo LIKE 'config\_%'` em evento sem referência.

## Correções da M13

**0. Autorização antes de qualquer lock**

Em todas as RPCs tocadas pela M13, nenhuma entidade de outra empresa pode ser travada antes da autorização. Padrão obrigatório: leitura sem lock apenas do contexto necessário (empresa/unidade/grupo) → `auth.uid()` + admin/owner via `dp_convocacao_exige_admin` → só então `FOR UPDATE` → revalidar estado e contexto sobre a linha travada. Aplicado em `atualizar_grupo`, `atualizar_ocorrencia`, `revisar_ocorrencia` e `criar_ocorrencia` (hoje `atualizar_grupo` e `atualizar_ocorrencia` travam antes de autorizar).

**1. Criação concorrência-safe (grupo e ocorrência)**

Inverter a ordem: `INSERT ... ON CONFLICT (id) DO NOTHING RETURNING *`.

- Retornou linha → criou: 1 evento, `idempotente: false`.
- Não retornou → perdeu a corrida: reler a linha **com escopo de tenant** e comparar contexto + conteúdo (mesmo conjunto de campos já usado hoje). Igual → retorno idempotente com 0 eventos. Diferente → `IDEMPOTENCY_CONFLICT`.

A reconsulta nunca é `FOR UPDATE` só por `id`: em `criar_grupo` filtra por `id` + `company_id` autorizado (+ `unidade_id`); em `criar_ocorrencia`, por `id` + `company_id` autorizado + `grupo_id`. Se nada casar nesse escopo, a linha pertence a outro tenant (ou a outro contexto) → `IDEMPOTENCY_CONFLICT` imediato, sem travar a linha da outra empresa e sem revelar contexto cross-company.

`ON CONFLICT` restrito a `(id)`, então conflitos de outras constraints de negócio continuam propagando normalmente. Sem tabela genérica de idempotência.


**2. Serialização de criação de ocorrência × publicação, com retry reconciliado antes do estado**

Ordem em `criar_ocorrencia`:

1. Ler o contexto do grupo sem lock e autorizar (`auth.uid()` + admin/owner).
2. Reconciliar o retry **antes** de exigir rascunho: buscar `p_ocorrencia_id` no escopo autorizado (`id` + `company_id` + `grupo_id`). Existente com mesmo conteúdo/contexto → retorno idempotente, 0 evento, mesmo que o grupo já esteja publicado. Existente com conteúdo diferente → `IDEMPOTENCY_CONFLICT`. Fora do escopo autorizado → `IDEMPOTENCY_CONFLICT` imediato, sem lock cross-tenant.
3. Inexistente → travar o grupo (`FOR UPDATE`), revalidar contexto e `status = 'rascunho'` (senão `NOT_DRAFT`) e tentar `INSERT ... ON CONFLICT (id) DO NOTHING`.
4. Perdeu a corrida no `INSERT` → reconciliar de novo por consulta tenant-scoped antes de qualquer lock da ocorrência.

Mantém a ordem de lock aprovada (grupo → ocorrência) que `revisar_ocorrencia` também usa: uma publicação futura da 3B.2 e a inclusão de nova ocorrência nunca se atravessam — quem chegar depois espera, relê o estado atual e falha com `NOT_DRAFT`.



**3. Ordem correta da revisão (predecessora → sucessora)**

Confirmei no banco que `uq_dp_conv_ocor_necessidade_vigente` é único sobre `(company_id, unidade_id, data, cargo_id, necessidade_entrada, necessidade_saida, necessidade_termina_no_dia_seguinte)` com `WHERE status NOT IN ('revisada','cancelada')`. Logo, revisão que preserva a identidade da necessidade e altera só vagas/condições falha se a sucessora for inserida antes.

`revisar_ocorrencia` passa a marcar a predecessora como `revisada` **antes** do `INSERT` da sucessora, na mesma transação — se a criação da sucessora falhar, o UPDATE da predecessora é revertido pela própria transação.

**4. Reconciliação completa no retry da revisão**

Ao encontrar sucessora com `substitui_ocorrencia_id = p_ocorrencia_id`:

- Se o id difere de `p_sucessora_id` → `REVISION_CONFLICT` (como hoje).
- Se coincide, validar antes a coerência da cadeia — predecessora `revisada`, `sucessora.substitui_ocorrencia_id = predecessora.id`, `sucessora.versao = predecessora.versao + 1`, mesma empresa/grupo/unidade. Qualquer estado impossível → `REVISION_INCONSISTENT` (fail closed).
- Cadeia coerente: comparar a sucessora existente com o payload solicitado (predecessora, grupo, empresa, unidade, versão, cargo, data, janela de necessidade, horário, turno, intervalo, carga, vagas, condições comuns) **e também `p_motivo`**. O motivo é confrontado com o único evento `ocorrencia_revisada` correspondente à dupla predecessora + sucessora: zero ou mais de um evento correspondente → `REVISION_INCONSISTENT`; exatamente um → comparação normalizada do motivo, tratando `NULL` explicitamente (`IS NOT DISTINCT FROM`). Compatível → idempotente, 0 novo evento. Qualquer divergência, inclusive só no motivo → `IDEMPOTENCY_CONFLICT`.

**5. Controle otimista na configuração**

`salvar_config` ganha `p_expected_updated_at timestamptz`. A assinatura antiga é removida explicitamente com `DROP FUNCTION` sem `CASCADE`, e a nova recebe os mesmos grants (`EXECUTE` só para `authenticated`, sem PUBLIC/anon). Ao final, checagem em `pg_proc` de que resta exatamente uma assinatura executável de `dp_convocacao_salvar_config`.

- Sem linha no escopo + `expected NULL` → criar via `INSERT ... ON CONFLICT ON CONSTRAINT uq_dp_conv_config_escopo DO NOTHING`; se perdeu a corrida, reler `FOR UPDATE` e cair na regra de linha existente. A constraint `UNIQUE NULLS NOT DISTINCT (company_id, unidade_id)` é preservada como está.
- Linha existente com conteúdo igual → sucesso idempotente, 0 evento (independe do expected).
- Conteúdo diferente + `expected_updated_at` correto → 1 update, 1 evento.
- Conteúdo diferente + expected divergente ou ausente → `CONCURRENT_MODIFICATION`, nunca sobrescrever.

Resultado nas duas criações simultâneas do mesmo escopo: mesmo conteúdo → 1 linha e exatamente 1 evento `config_criada`, ambas as chamadas com sucesso lógico; conteúdo diferente → uma cria, a outra recebe conflito.

**6. Eventos sem referência — fail closed**

`tipo LIKE 'config\_%'` passa a `tipo IN ('config_criada','config_atualizada')`, tanto no `CHECK` `dp_conv_evento_referencia_check` quanto no trigger `dp_conv_evento_deriva`. Vocabulário novo de config futuro exigirá migration explícita — que é o comportamento desejado.

**7. Papel real do ator, fail closed**

`log_evento` resolve `ator_papel` por membership válida na empresa do evento — o mesmo critério da autorização (`company_members.role IN ('owner','admin')`), confirmado na definição de `private.is_company_admin_or_owner`: `owner` → `owner`, `admin` → `admin`. Com `auth.uid() IS NOT NULL` e papel não resolvível → `AUDIT_ACTOR_ROLE_UNRESOLVED` (fail closed). `NULL` fica reservado a execução interna legítima sem usuário autenticado.


## Testes (todos em transações revertidas, com contagem de eventos)

Duas sessões `psql` reais para os cenários concorrentes:

- Grupo, mesmo ID + mesmo payload em paralelo → 1 grupo, 1 evento, ambas idempotentes logicamente.
- Grupo, mesmo ID + payload diferente → 1 criação + `IDEMPOTENCY_CONFLICT`.
- Ocorrência, os mesmos dois cenários.
- Sessão A trava o grupo e publica; Sessão B tenta criar ocorrência → aguarda; após o COMMIT de A, B revalida e devolve `NOT_DRAFT` sem criar ocorrência.
- Retry após publicação: criar ocorrência → publicar o grupo → repetir exatamente a mesma criação → sucesso idempotente com 0 eventos adicionais. Com o grupo publicado e ocorrência inexistente → `NOT_DRAFT`.
- Revisão preservando exatamente a identidade da necessidade (empresa/unidade/data/cargo/janela) e alterando só vagas/condições → sucessora criada sem violar `uq_dp_conv_ocor_necessidade_vigente`.
- Revisão: mesma sucessora + mesmo payload → idempotente, 0 evento; mesma sucessora + payload material diferente → `IDEMPOTENCY_CONFLICT`; mesma sucessora + payload igual e `p_motivo` diferente → `IDEMPOTENCY_CONFLICT`; cadeia corrompida artificialmente → `REVISION_INCONSISTENT`.
- Tentativa de lock cross-company: usuário de outra empresa em `atualizar_grupo`/`atualizar_ocorrencia`/`revisar_ocorrencia`/`criar_ocorrencia` → `FORBIDDEN` sem ter travado a linha (verificado com a linha travada por outra sessão: a chamada não bloqueia, falha na hora).
- Colisão de UUID cross-tenant: com a linha da outra empresa **propositalmente travada em outra sessão**, `criar_grupo` e `criar_ocorrencia` retornam `IDEMPOTENCY_CONFLICT` imediatamente, sem aguardar o lock e sem expor contexto da outra empresa.
- Config: dois gestores com a mesma versão → o primeiro altera, o segundo recebe `CONCURRENT_MODIFICATION`; duas criações simultâneas do mesmo escopo → exatamente 1 linha e 1 evento.
- Evento sem referência com tipo fora do par permitido → rejeitado.
- `ator_papel` gravado como `owner` para owner e `admin` para admin; papel não resolvível → `AUDIT_ACTOR_ROLE_UNRESOLVED`.

Qualquer divergência: PARO e diagnostico antes de seguir.

## Validação final e evidências

A própria M13 reafirma, depois de cada `CREATE OR REPLACE`, os `REVOKE` de PUBLIC/anon (e de `authenticated` nos helpers internos) e os `GRANT EXECUTE` para `authenticated` nas 6 RPCs do app, de modo que o estado final de privilégios fique explícito na migration.

Evidências ao final: migrations Cloud × GitHub, grants, RLS, `pg_proc` com assinatura única de `salvar_config`, tipos Supabase regenerados, `npx vite build`, testes, lint e typecheck comparados ao baseline registrado (912 ok / 2 falhos de Pedidos, 1414 lint / 6 erros, 46 erros TS e 0 em Convocações), e contagem zero nas 7 tabelas de Convocações. Tudo consolidado no documento de baseline/execução da 3B, com PARADA ao final — sem iniciar 3B.2.


