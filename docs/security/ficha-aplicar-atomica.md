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
