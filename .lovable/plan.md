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

**1. Criação concorrência-safe (grupo e ocorrência)**

Inverter a ordem: `INSERT ... ON CONFLICT (id) DO NOTHING RETURNING *`.

- Retornou linha → criou: 1 evento, `idempotente: false`.
- Não retornou → perdeu a corrida: reler a linha `FOR UPDATE`, comparar contexto + conteúdo (mesmo conjunto de campos já usado hoje). Igual → retorno idempotente com 0 eventos. Diferente → `IDEMPOTENCY_CONFLICT`.

`ON CONFLICT` restrito a `(id)`, então conflitos de outras constraints de negócio continuam propagando normalmente. Sem tabela genérica de idempotência.

**2. Serialização de criação de ocorrência × publicação**

`criar_ocorrencia` passa a travar o grupo (`SELECT ... FROM dp_convocacao_grupos WHERE id = p_grupo_id FOR UPDATE`) **antes** de autorizar e de validar `status = 'rascunho'`, mantendo a ordem de lock já aprovada (grupo → ocorrência) que `revisar_ocorrencia` também usa. Assim uma publicação futura da 3B.2 e a inclusão de ocorrência nunca se atravessam: quem chegar depois espera, relê o estado atual e falha com `NOT_DRAFT` se o grupo já foi publicado.

**3. Reconciliação completa no retry da revisão**

Ao encontrar sucessora com `substitui_ocorrencia_id = p_ocorrencia_id`:

- Se o id difere de `p_sucessora_id` → `REVISION_CONFLICT` (como hoje).
- Se coincide, validar antes a coerência da cadeia — predecessora `revisada`, `sucessora.substitui_ocorrencia_id = predecessora.id`, `sucessora.versao = predecessora.versao + 1`, mesma empresa/grupo/unidade. Qualquer estado impossível → `REVISION_INCONSISTENT` (fail closed).
- Cadeia coerente: comparar a sucessora existente com o payload solicitado (predecessora, grupo, empresa, unidade, versão, cargo, data, janela de necessidade, horário, turno, intervalo, carga, vagas, condições comuns). Compatível → idempotente, 0 evento. Incompatível → `IDEMPOTENCY_CONFLICT`.

**4. Controle otimista na configuração**

`salvar_config` ganha `p_expected_updated_at timestamptz` (a assinatura muda, então a versão antiga é removida e a nova recebe os mesmos grants: `EXECUTE` só para `authenticated`, sem PUBLIC/anon).

- Sem linha no escopo + `expected NULL` → criar via `INSERT ... ON CONFLICT (company_id, unidade_id) DO NOTHING`; se perdeu a corrida, reler e cair na regra de linha existente. Preserva o `UNIQUE NULLS NOT DISTINCT (company_id, unidade_id)` sem alterá-lo.
- Linha existente com conteúdo igual → sucesso idempotente, 0 evento (independe do expected).
- Conteúdo diferente + `expected_updated_at` correto → 1 update, 1 evento.
- Conteúdo diferente + expected divergente ou ausente → `CONCURRENT_MODIFICATION`, nunca sobrescrever.

Resultado nas duas criações simultâneas do mesmo escopo: mesmo conteúdo → 1 linha e exatamente 1 evento `config_criada`, ambas as chamadas com sucesso lógico; conteúdo diferente → uma cria, a outra recebe conflito.

**5. Eventos sem referência — fail closed**

`tipo LIKE 'config\_%'` passa a `tipo IN ('config_criada','config_atualizada')`, tanto no `CHECK` `dp_conv_evento_referencia_check` quanto no trigger `dp_conv_evento_deriva`. Vocabulário novo de config futuro exigirá migration explícita — que é o comportamento desejado.

**6. Papel real do ator**

`log_evento` passa a resolver `ator_papel` de `company_members.role` para o `auth.uid()` na empresa do evento (`owner` → `owner`, `admin` → `admin`), sem ampliar escopo de leitura (a função já é definer e a autorização já consulta a mesma tabela). Sem linha correspondente, grava `NULL` em vez de afirmar um papel falso.

## Testes (todos em transações revertidas, com contagem de eventos)

Duas sessões `psql` reais para os cenários concorrentes:

- Grupo, mesmo ID + mesmo payload em paralelo → 1 grupo, 1 evento, ambas idempotentes logicamente.
- Grupo, mesmo ID + payload diferente → 1 criação + `IDEMPOTENCY_CONFLICT`.
- Ocorrência, os mesmos dois cenários.
- Sessão A trava o grupo e publica; Sessão B tenta criar ocorrência → aguarda; após o COMMIT de A, B revalida e devolve `NOT_DRAFT` sem criar ocorrência.
- Revisão: mesma sucessora + mesmo payload → idempotente, 0 evento; mesma sucessora + payload diferente → `IDEMPOTENCY_CONFLICT`; cadeia corrompida artificialmente → `REVISION_INCONSISTENT`.
- Config: dois gestores com a mesma versão → o primeiro altera, o segundo recebe `CONCURRENT_MODIFICATION`; duas criações simultâneas do mesmo escopo → exatamente 1 linha e 1 evento.
- Evento sem referência com tipo fora do par permitido → rejeitado.
- `ator_papel` gravado como `owner` para owner e `admin` para admin.

## Validação final e evidências

Migrations Cloud × GitHub, grants, RLS, tipos Supabase regenerados, `npx vite build`, testes, lint e typecheck comparados ao baseline registrado (912 ok / 2 falhos de Pedidos, 1414 lint / 6 erros, 46 erros TS e 0 em Convocações), e contagem zero nas 7 tabelas de Convocações. Tudo consolidado no documento de baseline/execução da 3B, com PARADA ao final — sem iniciar 3B.2.
