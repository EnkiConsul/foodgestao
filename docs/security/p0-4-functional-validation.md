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
node scripts/test-p04-isolated.mjs            # exporta a estrutura e valida
node scripts/test-p04-isolated.mjs --reuse-dump   # reaproveita /tmp/p04_schema.sql
node scripts/test-p04-isolated.mjs --keep         # mantém o cluster para inspeção
```

Saídas:

- `docs/security/p0-4-functional-validation.report.json` — comando, código de
  saída, cenários, resultados, inclusões/exclusões e limites.
- `docs/security/p0-4-functional-validation.log` — log textual, sem segredos.

Requisitos: variáveis `PG*` de leitura do banco de origem (nunca passadas por
argv nem impressas), `initdb`/`pg_ctl`/`psql`/`setpriv` locais. Sem serviço pago.

## 3. Ambiente e guardas

- Cluster próprio desta tarefa: `initdb` em `/tmp/p04pg`, socket
  `/tmp/p04pg_sock`, porta `55437`, `listen_addresses=127.0.0.1`, banco `p04iso`,
  recriado do zero e destruído no fim. Clusters existentes não são tocados.
- Guardas: caminho fixo em `/tmp/p04pg*`; recusa se porta/host colidirem com a
  conexão de origem; após conectar, exige `data_directory = /tmp/p04pg`.

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

Restore: 2 avisos inócuos (`schema já existe`) e **0 erros em objetos sob teste**.
O runner aborta se qualquer erro tocar um objeto testado.

## 5. Fidelidade conferida (origem × clone)

| Verificação | Resultado |
| --- | --- |
| privilégios EXECUTE das 9 internas + 2 app-facing | idênticos (11 linhas) |
| políticas de `public.companies` | idênticas (5 linhas) |
| gatilhos de `public.companies` | idênticos (15 linhas) |
| inventário do clone | 200 tabelas e 468 funções em `public` |

Divergência em qualquer um desses itens invalida a execução (o runner falha).

## 6. Cenários executados (25 aprovados, exit 0)

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
- **S5/S6** — execução interna preservada com dados sintéticos, como proprietário
  do banco e como `service_role`: contagem de páginas do lote (efeito verificado),
  geração de escala e autoatribuição de folgas (retornou `geradas: 2` — trabalho
  efetivo, não apenas execução).

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
   plataforma antes do restore (restore caiu de 14 para 2 avisos inócuos).

## 9. Limites (registrados, sem alegar aprovação)

- As rotinas por data rodam com configuração mínima; `dp_escala_auto_gerar` não
  encontra jornada/turno configurados na empresa sintética, então prova execução
  e autorização, não geração efetiva de escala. A autoatribuição de folgas gerou
  2 registros (trabalho efetivo).
- `dp_escala_auto_gerar_todas()` e `dp_folga_autoatribuir_todas()` só são
  exercitadas pela negação de EXECUTE (S1): em modo global varrem todas as
  empresas e não agregam prova além do caminho por empresa (S5).
- Os stubs de `cron`/`pgmq`/`vault` não simulam o agendador real; a execução
  agendada segue comprovada por privilégio e pela cadeia de chamadas.
- Esta validação não substitui teste no ambiente gerenciado: comprova estrutura,
  privilégios, políticas, gatilhos e comportamento das funções — não latência,
  volume nem integrações externas.
