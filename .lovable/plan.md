# Aplicar a gravação em bloco da ficha de registro

Confirmado agora: a alteração ainda **não** está no banco do projeto (nenhuma das duas rotinas existe lá). O código do front-end já está pronto e esperando por ela, então a tela de importação só volta a aplicar fichas depois deste passo.

## O que será feito

1. Aplicar no banco do projeto o arquivo já revisado e testado `20260915140000_ficha_aplicar_atomica.sql`, exatamente como está — nada de reescrever o conteúdo.
2. Conferir, logo depois, que as duas rotinas existem e que só usuários autenticados (e o serviço interno) podem executá-las.
3. Registrar o resultado nas evidências já versionadas em `docs/security/ficha-aplicar-atomica.*`.

## O que isso muda para você

- Aplicar uma ficha revisada passa a gravar tudo de uma só vez: a pessoa, a jornada, os dias, a situação da ficha e a contagem do lote. Se qualquer parte falhar, nada fica salvo pela metade.
- Aplicar a mesma ficha duas vezes (clique duplo, dois computadores, recarregar a página) não cria pessoa duplicada nem contagem errada.
- Campo em branco na ficha nunca apaga o que já está no cadastro; na atualização vale só o que você marcar na comparação.
- Nenhuma tela muda de aparência e nenhuma regra de negócio é alterada.

## Segurança e reversão

- Só cria as duas rotinas. Não apaga tabela, coluna ou dado; não mexe em cadastros existentes.
- Pode ser aplicada mais de uma vez sem efeito colateral (já provado no ambiente de teste).
- Reversão, se necessário: remover as duas rotinas — o restante do banco fica intacto.

## Detalhes técnicos

- `public.dp_ficha_aplicar(...)` e `public.dp_ficha_ignorar(uuid)`, ambas `SECURITY INVOKER`, `search_path = public`, `EXECUTE` revogado de `PUBLIC`/`anon` e concedido a `authenticated` + `service_role`, com aborto fail-closed se alguma ficar aberta.
- Empresa derivada do item lido sob RLS; allowlist de 37 colunas; recusa `42501` para `user_id`, `perfil_acesso`, `dp_permissions`, `company_id`, `ativo`, `deleted_at`, `id` e para referências fora da empresa.
- `pg_advisory_xact_lock` por lote + `FOR UPDATE` em item/lote/colaborador; contadores do lote recalculados em SQL na mesma transação.
- Aplicação via `run_sql` com o conteúdo byte a byte do arquivo (a ferramenta de migration está indisponível neste projeto); o arquivo permanece versionado em `supabase/migrations/`.
- Pós-aplicação: `pg_proc`/`aclexplode` para conferir presença e grants, e `node scripts/migrations-check.mjs`.
