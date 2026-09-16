# Aplicação atômica da ficha de registro

Escopo: transformar a aplicação da ficha revisada (que gravava colaborador,
jornada, dias, item e contadores em chamadas separadas do navegador) em **uma
única transação no banco**, sem mudar layout, produto ou regra de negócio.

## O que passou a existir

`supabase/migrations/20260915140000_ficha_aplicar_atomica.sql` cria duas
rotinas, ambas `SECURITY INVOKER` com `search_path = public`, `EXECUTE` apenas
para `authenticated` e `service_role` (revogado de `PUBLIC`/`anon`):

- `public.dp_ficha_aplicar(...)` — grava colaborador (criação ou atualização),
  configuração de trabalho vigente, dias da jornada, dados revisados/status do
  item e recalcula os contadores do lote em SQL.
- `public.dp_ficha_ignorar(p_item_id)` — marca o item como ignorado e recalcula
  os mesmos contadores.

Garantias implementadas na própria rotina:

- **Autorização e empresa**: a empresa vem do item lido sob RLS, nunca do
  cliente. Referência (cargo/unidade/setor/turno) fora da empresa — ou apenas
  invisível a quem chama — é recusada (`42501`), sem gravar nada.
- **Allowlist de colunas**: só as 37 colunas alimentadas pela ficha. Payload que
  traga `user_id`, `perfil_acesso`, `dp_permissions`, `company_id`, `ativo`,
  `deleted_at`, `id` etc. é recusado (`42501`).
- **Nada apaga cadastro**: campo vazio/ausente é ignorado; na atualização vale a
  seleção de campos feita na comparação lado a lado.
- **Serialização e idempotência**: `pg_advisory_xact_lock` por lote + `FOR
  UPDATE` no item/lote/colaborador; reaplicar o mesmo item devolve o mesmo
  colaborador (`ja_aplicado`) sem regravar nem duplicar contagem.
- **Contadores em SQL**: recalculados na mesma transação; lote só é concluído
  quando não há pendência e a leitura já terminou.

No front-end, `src/hooks/useDpFichaImportacao.tsx` passou a chamar a rotina
(`src/lib/dp/ficha-registro/aplicarFichaRpc.ts`) e perdeu o recálculo de
contadores no cliente. O anexo do PDF continua fora da transação (é Storage),
com destino determinístico por ficha — repetir não multiplica arquivo nem
registro — e falha nele avisa sem desfazer o cadastro.

## Validação

Executada em cluster PostgreSQL **temporário e descartável**, com a estrutura
real (grants, policies, owners, triggers), sem qualquer dado de produção. A
migração foi aplicada **somente no clone**:

```
node scripts/test-p04-isolated.mjs --suite=ficha-aplicar-atomica \
  --migrations=supabase/migrations/20260915140000_ficha_aplicar_atomica.sql \
  --tests=supabase/tests/dp_ficha_aplicar_isolated.test.sql \
  --conc-setup=supabase/tests/dp_ficha_conc_setup.sql \
  --conc-call=supabase/tests/dp_ficha_conc_call.sql \
  --conc-verify=supabase/tests/dp_ficha_conc_verify.sql
```

Resultado: **13 grupos, 74 subcasos, 0 pendências**, fidelidade origem×clone
idêntica e migração idempotente (reaplicada sem erro). Evidências em
`docs/security/ficha-aplicar-atomica.report.json` e
`docs/security/ficha-aplicar-atomica.log.txt`.

Cobertura: criação; atualização só dos campos escolhidos; campos ausentes
preservados; replay; 4 chamadas simultâneas (duas no mesmo item, duas em itens
do mesmo lote); falha no meio da transação com rollback integral (gatilho
temporário criado e removido só no clone); CPF duplicado sem gravação parcial;
visitante, colaborador do portal, usuário sem vínculo e admin de outra empresa
negados; referências de outra empresa; injeção de conta/perfil/permissões;
ignorar com contadores corretos; jornada/CPF/vínculo inválidos.

Outras verificações: `tsgo --noEmit`, `vite build`, `eslint` (sem novo aviso),
`vitest` da ficha, `migrations-check` (677 migrations) e `security-lint --ci`
(0 críticos, 260 avisos históricos).

## Pendente

A migração **não foi aplicada** ao banco do projeto — aguardando aprovação.

## Aplicação no banco do projeto

Aplicada em 2026-09-15 (13:5x UTC). Conferido no catálogo: `dp_ficha_aplicar` e
`dp_ficha_ignorar` presentes, `SECURITY INVOKER` (`prosecdef = false`),
`search_path = public` e `EXECUTE` apenas para `authenticated` e `service_role`
(nada para `PUBLIC`/`anon`). `migrations-check` aprovado.

## Correções incrementais (2026-09-16)

A versão inicial **já está implantada** no banco do projeto
(`supabase_migrations.schema_migrations` contém `20260915140000`, além de
`20260915160000`, `20260915170000`, `20260915180000`, `20260915180100`,
`20260915190000`, `20260915193000`, `20260915194053`, `20260915204137`,
`20260915214054`). A leitura direta do catálogo confirmou que as rotinas em
produção ainda injetam nome/CPF incondicionalmente e contam pendência por
`status <> 'processing'`.

Por isso os reparos entram em **migração incremental nova**:
`supabase/migrations/20260916193000_ficha_aplicar_correcoes.sql`
(`create or replace` das duas rotinas + `revoke`/`grant` reafirmados). Nada da
migração anterior é editado ou reaplicado, e **nenhum DDL foi executado na
origem** — a migração aguarda revisão final.

### Evidências desta rodada (clone descartável, dump FRESCO)

```
node scripts/test-p04-isolated.mjs --suite=ficha-aplicar-correcoes-v2 \
  --migrations=supabase/migrations/20260916193000_ficha_aplicar_correcoes.sql \
  --tests=supabase/tests/dp_ficha_aplicar_isolated.test.sql \
  --conc-setup=supabase/tests/dp_ficha_conc_setup.sql \
  --conc-call=supabase/tests/dp_ficha_conc_call.sql \
  --conc-verify=supabase/tests/dp_ficha_conc_verify.sql --conc-n=4
```

- runner exit **0**; restore `--exit-on-error` exit 0 sem erro; 202 tabelas e
  478 funções em `public`.
- Fidelidade origem×clone IDÊNTICA nas 5 consultas (ACLs de rotinas críticas,
  definições/autorização, policies e triggers de `companies`, helpers de auth) —
  isto cobre o estado de segurança **atual**, já com a Fase 12 aplicada.
- Migração reaplicada sem erro (idempotente).
- Suíte funcional: 13 grupos, **74 subcasos, 0 pendências**.
- Concorrência: 4 chamadas simultâneas, exit 0 em todas, sem duplicar cadastro,
  jornada, dias ou contadores.
- Autoteste do runner (`--conc-guard`, suíte `ficha-guard-selftest`): um filho
  forçado a falhar → `idx=1 exit 1 | ERROR: division by zero` e runner exit
  **1**. Prova que falha de filho reprova a etapa (antes o `--conc-guard` ficava
  silenciosamente desligado por ser flag booleana).

Ajuste no runner: dump/restore passaram a usar formato custom (`pg_dump -Fc` +
`pg_restore --exit-on-error -L`), porque o dump em texto do pg_dump 17.6+ contém
literais com barra invertida que o lexer do psql lê como meta-comando
(`invalid command \_company'::text,`) e reprovava o restore por motivo alheio ao
teste. A entrada `SCHEMA - public` é excluída da lista (o bootstrap já cria o
schema com as extensões).

### Verificações de código (exit codes reais, sem `tail`)

- `bunx tsgo -p tsconfig.app.json --noEmit` → exit **0** (o `tsconfig.json` raiz
  tem `files: []` + `references`, então a prova usa o projeto explícito).
- `bunx vitest run` → exit **0**; 206 arquivos passando / 4 ignorados; 2019
  testes passando / 50 ignorados.

### Limitações desta suíte

- Cobre apenas as duas rotinas da ficha e o caminho de concorrência acima. Não
  executa a suíte legada S5.2 nem os cenários de outras fases.
- Ainda pendentes da revisão: cobertura negativa adicional (setor/turno no F5,
  item ligado a lote/colaborador de outra empresa com usuário que administra as
  duas, SQLSTATE exato nos enums, F12 comparando snapshot verdadeiro em vez de
  `updated_at > now()`), teste com instância real de `SupabaseClient` capturando
  URL/corpo, e os dois pontos já documentados em
  `docs/runbooks/escala-mes-integracao-jornada.md`.
