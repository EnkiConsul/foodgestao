# P0.4 — Validação FUNCIONAL em banco isolado (reprodução)

Commit validado: `5f4fb2ed8d0adc2f22bfeff56213f7d534c13f0b` (+ os ajustes de teste
descritos abaixo).

## 1. O que esta etapa comprova

Execução real das regras da P0.4 contra a **estrutura real** do banco, em um
cluster PostgreSQL **local, temporário e descartável**, com **usuários e
empresas sintéticos**. Nenhum DDL/dado do banco do projeto foi alterado; o banco
de origem foi usado apenas para leitura (`pg_dump --schema-only` e SELECTs de
catálogo).

## 2. Como reproduzir

```bash
node scripts/test-p04-isolated.mjs          # exporta a estrutura e valida
node scripts/test-p04-isolated.mjs --keep   # mantém APENAS o cluster desta execução
```

Não existe mais `--reuse-dump`: a estrutura é reexportada em toda execução, para
que corpos de função alterados não passem despercebidos por um snapshot antigo.

Saídas:

- `docs/security/p0-4-functional-validation.report.json` — comando, código de
  saída, cenários, resultados, inclusões/exclusões e limites.
- `docs/security/p0-4-functional-validation.log.txt` — log textual versionado, sem segredos.

Requisitos: variáveis `PG*` de leitura do banco de origem (nunca passadas por
argv nem impressas), `initdb`/`pg_ctl`/`psql`/`setpriv` locais. Sem serviço pago.

## 3. Ambiente e guardas

- Cluster próprio desta execução: diretórios exclusivos criados com `mkdtemp`
  (`/tmp/p04pg-run-*/pgdata` e `/tmp/p04pg-sock-*`), porta `55437`,
  `listen_addresses=127.0.0.1`, banco `p04iso`, destruído no fim.
- **Ownership por marcador**: `.p04-runner-owned` é gravado no diretório da
  execução; a limpeza só age se o marcador existir E o cluster tiver sido criado
  por esta execução. Diretórios preexistentes nunca são parados ou apagados,
  inclusive quando a guarda pré-start falha. `--keep` preserva só o cluster próprio.
- Guardas pré-start: recusa se host/porta de destino colidirem com a conexão de
  origem, antes de qualquer `initdb`. Depois de conectar, confere
  `data_directory`, `port` e `listen_addresses` do destino antes de qualquer
  `CREATE DATABASE`, bootstrap ou fixture.
- Três auto-testes do runner rodam sempre e são registrados no relatório:
  falha pré-start não limpa cluster alheio; ausência de marcador impede remoção;
  guarda de colisão com a origem.

## 4. Recorte incluído / excluído

Incluído (fielmente, do estado real): schemas `public`, `private` e `qa`
completos — tabelas, funções, triggers, políticas, **grants e proprietários**;
papéis `anon`/`authenticated`/`service_role` (+ papéis de plataforma criados para
os grants do dump aplicarem).

Excluído e substituído por **shims de infraestrutura** (nenhum deles é objeto sob
teste):

- Todos os dados reais — zero linha copiada, zero dado pessoal.
- Extensões indisponíveis localmente: `pg_cron`, `pg_net`, `pgmq`,
  `supabase_vault`, `pg_stat_statements` → tabelas/funções stub vazias.
- GoTrue/PostgREST: `auth.users` (estrutura) e `auth.uid()/auth.jwt()/auth.role()`
  reimplementadas fielmente sobre `request.jwt.claims`.
- Schemas de plataforma não referenciados pelos objetos testados: `storage`,
  `realtime`, `supabase_functions`, `graphql`.

**Nenhuma função de segurança sob teste foi stubada ou alterada** (`has_role`,
`is_super_admin`, `private.is_company_admin_or_owner`, gatilhos de titularidade,
RPCs de folga e as 9 rotinas internas vêm do dump real).

Restore: executado com `ON_ERROR_STOP=1`; **qualquer** erro (e qualquer status de
saída inesperado) invalida a execução — não há decisão por nome de objeto nem
allowlist de mensagens. Resultado da execução registrada: `exit 0`, **0 erros**.

Único pré-processamento do dump: a linha `CREATE SCHEMA public;` é comentada
porque `pg_dump --schema=` não emite `CREATE EXTENSION`, e índices reais dependem
de `pg_trgm`/`unaccent` instalados em `public`; o bootstrap cria o schema e essas
duas extensões antes do restore. Owner, COMMENT e GRANTs do dump seguem aplicando.
Se a linha não for encontrada, o runner falha.

## 5. Fidelidade conferida (origem × clone)

| Verificação | Resultado |
| --- | --- |
| privilégios EXECUTE das 9 internas + 2 app-facing | idênticos (11 linhas) |
| definição completa (`pg_get_functiondef`), dono, `security definer` e `search_path` das 11 rotinas + funções de autorização transitivas (guards de titularidade, `has_role`, `is_super_admin`, `private.is_company_admin_or_owner`, `private.dp_access_enabled`, `private.company_owner_snapshot`, helpers de folga) | idênticos (21 linhas) |
| políticas de `public.companies` (com `roles` e `permissive`) | idênticas (5 linhas) |
| gatilhos de `public.companies` (`pg_get_triggerdef`) | idênticos (15 linhas) |
| corpos de `auth.uid/jwt/role/email` (md5 × origem) | idênticos (4 linhas) |
| inventário do clone | 200 tabelas e 468 funções em `public` |

Sobre `auth.*`: a equivalência conferida é a dos **corpos das funções de claims**
do banco real. Não há equivalência integral de serviços gerenciados (GoTrue,
PostgREST, agendador, filas, cofre) — isso está declarado como limite, não como
fidelidade.

Divergência em qualquer um desses itens invalida a execução (o runner falha).

## 6. Cenários executados (exit 0)

Contagem separada, como no relatório JSON: **2 blocos de preparação de fixtures**,
**24 grupos de asserções aprovados**, **21 subcasos declarados** dentro deles e
**1 cenário PENDENTE** (S5.2, item 9). Preparação não é asserção e pendência não
é aprovação.

`supabase/tests/dp_internal_functions_p04.test.sql` — T1, T1b, T2, T3, fixtures,
T4, T5, T5b, T6, T7, T7b, T8.

`supabase/tests/dp_p04_scenarios_isolated.test.sql` (duas empresas sintéticas A e
B; perfis dono, admin, colaborador, sem vínculo e visitante):

- **S1** — as 9 rotinas internas, chamadas de verdade, negam `authenticated` e
  `anon` em 18 casos. Só `42501 permission denied for function` conta como
  negação; erro de dependência, sintaxe ou qualquer outro estado falha o cenário.
- **S2** — dono e admin editam campos comuns da própria empresa (positivo).
- **S3** — admin de A, colaborador e usuário sem vínculo não alteram a empresa B.
- **S4** — RPCs app-facing de folga: dono e admin de A funcionam na empresa A;
  admin de A na empresa B, colaborador, sem vínculo e dono de B na empresa A
  recebem `42501 FORBIDDEN`; visitante nem tem EXECUTE.
- **S3b** — o colaborador sintético está ligado a `dp_colaboradores.user_id`
  (perfil real de colaborador) e **não** edita nem a própria empresa.
- **S5/S6** — execução interna com dados sintéticos, como proprietário do banco e
  como `service_role`: contagem de páginas do lote (efeito verificado: 2 e 1) e
  autoatribuição de folgas por competência com efeito conferido (2 folgas, todas
  na empresa A e nos colaboradores sintéticos). `dp_escala_auto_gerar` fica
  **PENDENTE** (item 9).
- **S5b** — positivo app-facing com efeito: o admin da própria empresa obtém a
  prévia do plano, aplica a data sugerida por ela e a folga é gravada (conferida
  linha a linha). A data vem da prévia real, não de um dia arbitrário.

## 7. Conflito real encontrado nas regras de titularidade

`public.companies` tem **três** gatilhos de titularidade com regras diferentes:

| Gatilho | Regra |
| --- | --- |
| `companies_guard_owner_transfer` | dono atual **ou** super admin |
| `guard_company_owner_transfer` (`dp_…`) | dono atual **ou** super admin (serviço passa) |
| `prevent_company_ownership_transfer_trg` | **somente** super admin (ou contexto de serviço) |

O mais restritivo prevalece: **o próprio dono não transfere a titularidade** —
recebe `P0001 Ownership transfer is not allowed`. A operação autorizada existente
é a transferência por **super admin**, comprovada em T5b.

O T5 original pressupunha que o dono podia transferir; a expectativa do **teste**
foi corrigida para a regra real. **Nada em produção foi afrouxado** e nenhum
gatilho foi alterado. Fica registrado como decisão de produto a resolver fora
desta etapa: consolidar os três gatilhos numa regra única (ou remover os
redundantes), definindo se o dono deve poder transferir.

## 8. Defeitos de teste/runner corrigidos nesta etapa

1. `companies.profile_type/status_tenant` das fixtures usavam valores inválidos
   (`pj`/`active`) → passaram a `empresarial`/`ativa`, conforme as restrições reais.
2. T5 reescrito conforme a regra efetiva (item 7) e T5b acrescentado.
3. Fixtures ganharam um usuário `super_admin` sintético (em `user_roles`).
4. Runner: comparação de gatilhos com cast explícito e criação dos papéis de
   plataforma antes do restore.
5. Runner: diretórios exclusivos por execução com marcador de ownership, restore
   com `ON_ERROR_STOP=1` sem allowlist por nome, `--reuse-dump` removido e
   fidelidade ampliada (corpos/dono/`security definer`/`search_path`/`roles` das
   policies/`pg_get_triggerdef`/`auth.*`).
6. Testes: `origem` da autoatribuição corrigida para o valor real do enum
   (`auto_fechamento_periodo`), asserção de efeito acrescentada em S5.3, S5b e
   S3b criados, e o comentário incorreto sobre "rollback deixar gatilhos
   desabilitados" removido — DDL de gatilho é transacional; o isolamento é
   exigido por causa das fixtures, das mutações e dos locks.

## 9. Limites (registrados, sem alegar aprovação)

- **PENDENTE — `dp_escala_auto_gerar`**: a rotina lê o cadastro legado
  `public.dp_jornadas`/`dp_colaborador_jornadas`, e esse cadastro está **selado em
  produção** pelo gatilho ativo `trg_dp_jornadas_legado`
  (`dp_bloquear_cadastro_legado`), que recusa novos registros. Criar jornada
  sintética exigiria desabilitar uma regra de produção, o que não foi feito.
  Portanto o cenário comprova execução interna e ausência de efeito colateral
  (retorno 0, nenhuma gravação, nada fora da empresa sintética) — **não** a
  geração efetiva de escala. Fica pendente até haver caminho suportado (turnos +
  configuração de trabalho) para montar a fixture.
- `dp_escala_auto_gerar_todas()` e `dp_folga_autoatribuir_todas()` só são
  exercitadas pela negação de EXECUTE (S1): em modo global varrem todas as
  empresas e não agregam prova além do caminho por empresa (S5).
- Os stubs de `cron`/`pgmq`/`vault` não simulam o agendador real; a execução
  agendada segue comprovada por privilégio e pela cadeia de chamadas.
- Esta validação não substitui teste no ambiente gerenciado: comprova estrutura,
  privilégios, políticas, gatilhos e comportamento das funções — não latência,
  volume nem integrações externas.
