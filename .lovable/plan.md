
# Importação Pakere → Módulo DP

Ferramenta administrativa para migrar dados do antigo Portal do Colaborador da Pakere (Supabase externo) para o módulo DP do 360°FOOD, com dry-run obrigatório antes de qualquer gravação real.

## Escopo desta entrega

Nesta fase entregamos a **espinha dorsal + módulo Colaboradores** (com estrutura pronta para os demais módulos serem plugados sem refactor):

- Infraestrutura completa (tabelas de controle, secrets, edge function, rollback, painel).
- Módulos ativos: `unidades`, `cargos`, `colaboradores` (colaboradores requer unidades+cargos).
- Demais módulos (`sindicatos`, `folgas`, `solicitacoes`, `atestados`, `trocas`, `disciplinares`, `avisos`, `mensagens`, `notificacoes`, `documentos`) ficam com handler stub retornando `not_implemented` no relatório — habilitados em fases seguintes após validarmos o dry-run com você.

Motivo: o spec cobre 13 módulos com regras próprias de FK e storage; entregar tudo de uma vez sem validar mapeamento real da Pakere gera risco alto de retrabalho. Fazemos primeiro o pipeline + o menor módulo com FKs (unidades → cargos → colaboradores) e depois expandimos.

## Segurança (não-negociável)

- Nada de service role no frontend. Toda leitura da Pakere ocorre dentro da Edge Function.
- Secrets solicitados via `add_secret`: `PAKERE_SUPABASE_URL`, `PAKERE_SUPABASE_SECRET_KEY`.
- Destino usa `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` já disponíveis.
- Edge function valida: JWT, `is_super_admin(user)`, empresa existe/ativa, módulo DP ativo, `batch_size ∈ [50,500]`, ausência de outra run concorrente para a mesma empresa (lock via `dp_import_runs.status='running'`).

## Migrations (backend)

Tabelas de controle no destino, com GRANTs e RLS restrita a super_admin:

- `dp_import_runs` — id, company_id, source_name, status (`pending|running|success|failed|rolled_back`), dry_run, copy_storage, started_at/finished_at, started_by, `source_counts jsonb`, `dest_counts jsonb`, `errors jsonb`, `report jsonb`.
- `dp_import_id_map` — `run_id`, `entity` (`unidade|cargo|colaborador|...`), `source_id text`, `dest_id uuid`, `created_at`, unique `(company_id, entity, source_id)` para garantir idempotência entre runs.
- `dp_import_logs` — `run_id`, `entity`, `level` (`info|warn|error`), `message`, `context jsonb`, `created_at`.

Todas com `GRANT ... TO service_role` + `GRANT SELECT TO authenticated` + política `USING (public.is_super_admin(auth.uid()))`.

## Edge Functions

### `supabase/functions/import-pakere-dp/index.ts`

Body:
```json
{ "company_id": "uuid", "dry_run": true, "copy_storage": false, "batch_size": 200, "modules": ["unidades","cargos","colaboradores", ...] }
```

Fluxo:
1. Autentica + autoriza (super_admin, empresa ativa, DP ativo).
2. Cria linha em `dp_import_runs` com status `running` (lock).
3. Cliente Pakere via `createClient(PAKERE_SUPABASE_URL, PAKERE_SUPABASE_SECRET_KEY)`.
4. Cliente destino via service role.
5. Para cada módulo pedido, invoca handler dedicado (arquivo por handler mantém tamanho gerenciável).
6. Cada handler:
   - Lê origem em páginas de `batch_size`.
   - Aplica transformações (normalização de CPF, telefone, mapeamento de FKs via `dp_import_id_map`).
   - Em `dry_run=true`: só conta, valida FKs, registra o que faria em `dp_import_logs` — não grava em `dp_*`.
   - Em execução real: `upsert` idempotente usando `dp_import_id_map` como chave; nunca por nome.
7. Ao final, grava `source_counts`, `dest_counts`, `errors`, `report` e status final.

Handlers desta fase:
- `handlers/unidades.ts` — cria/mapeia unidades vinculadas ao `company_id`.
- `handlers/cargos.ts` — cria/mapeia cargos.
- `handlers/colaboradores.ts` — valida CPF único por empresa, vincula `unidade_id`/`cargo_id` via mapa, nunca cria usuário Auth automaticamente (portal continua exigindo convite).
- Demais módulos: `handlers/notImplemented.ts` retornando `{status:'skipped', reason:'not_implemented_yet'}`.

### `supabase/functions/rollback-pakere-dp-import/index.ts`

Body: `{ "import_run_id": "uuid" }`.

- Só super_admin.
- Só apaga `dest_id`s presentes em `dp_import_id_map` daquele `run_id`.
- Ordem inversa de dependência (colaboradores → cargos → unidades).
- Antes de deletar, gera pré-relatório (o que seria removido + registros marcados como “modificados após import” via `updated_at > run.finished_at`, que ficam de fora).
- Atualiza `dp_import_runs.status = 'rolled_back'`.
- Nunca toca em `auth.users`, storage não criado pela import, nem em registros preexistentes.

## Frontend

### Página `/admin/importacoes-dp` (super_admin apenas)

- Rota nova em `src/App.tsx`, protegida por `useSuperAdmin`.
- Item de menu no admin sidebar.
- Componentes em `src/pages/admin/ImportacoesDp.tsx` + `src/components/admin/importacoes/*`:
  - Formulário de nova run: seleciona empresa (autocomplete), toggles `dry_run` (default ON) e `copy_storage`, `batch_size`, checklist de módulos.
  - Lista de runs (`dp_import_runs`) com colunas: empresa, origem, data, responsável, status, dry_run, contagens.
  - Detalhe de run: source_counts vs dest_counts, erros, duplicidades, arquivos ausentes, logs por tabela (paginado).
  - Botões: “Baixar relatório JSON”, “Executar de verdade” (só habilita se última run daquela empresa foi dry_run bem-sucedida), “Rollback” (com confirmação dupla).
- Zero secrets no bundle. Toda ação passa pelas edge functions.

## Testes e CI

- Testes unitários em `src/lib/dp/import/` para normalizadores (CPF, telefone, e-mail) e para o resolver de FK via `dp_import_id_map`.
- Teste de RLS em `src/test/rls/dp_import_runs.rls.test.ts` (usuário comum não lê; super_admin lê; anon nada).
- Vitest + typecheck + `security-lint.mjs` no CI existente cobrem o resto.

## Critérios de aceite desta fase

- Dry-run roda ponta a ponta para unidades/cargos/colaboradores sem gravar em `dp_*`.
- Relatório JSON baixável mostra o que entraria, o que duplicaria e FKs quebradas.
- Segunda execução real não duplica (via `dp_import_id_map`).
- Rollback remove exatamente e apenas o que a run criou.
- Nenhuma chave admin em código React, `.env`, migrations ou logs.
- RLS ativa em todas as tabelas novas; super_admin exclusivo.
- Typecheck, testes e CI verdes.

## O que fica para as próximas fases

Após você aprovar o dry-run desta fase eu habilito, em ordem, os handlers de: `sindicatos` → `folgas`/`atestados`/`trocas`/`disciplinares` → `documentos` (com `copy_storage`) → `avisos`/`mensagens`/`notificacoes`. Cada fase reutiliza a mesma edge function, só troca o handler.

## Ações do usuário antes de eu começar a codar (após aprovar o plano)

1. Confirmar `company_id` da Pakere no 360°FOOD (eu localizo por nome se você preferir).
2. Fornecer, via `add_secret`, os secrets `PAKERE_SUPABASE_URL` e `PAKERE_SUPABASE_SECRET_KEY` (service role da Pakere — nunca colar no chat).
3. Confirmar os nomes reais das tabelas de origem na Pakere para `unidades`, `cargos`, `colaboradores` (posso descobrir automaticamente listando `information_schema` da origem já dentro do dry-run, e o relatório mostra o mapeamento antes de qualquer gravação real).
