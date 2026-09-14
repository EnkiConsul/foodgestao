# Fase 6 — correção do armazenamento do segredo do processador

## Resultado da verificação (antes de qualquer mudança)

1. **Nome do segredo:** `DP_BULK_WORKER_SECRET` (enviado no cabeçalho `x-worker-secret`).
2. **Onde está hoje:** em **dois** lugares.
   - Segredo da função de backend (`DP_BULK_WORKER_SECRET`) — correto, permitido.
   - **Uma tabela comum do banco**, `private.dp_bulk_worker_auth`, com o valor em texto e uma rotina `dp_bulk_worker_secret()` que devolve esse valor. **Isso viola a regra** e precisa ser corrigido.
3. **Quem consegue ler:** a tabela só é legível por rotina interna do banco e a rotina só é executável pelo serviço interno (permissões removidas de visitante e de usuário autenticado). Ainda assim, o valor fica gravado em tabela comum, sem criptografia.
4. **Valor em migração ou código:** não. A migração cria o valor aleatoriamente no próprio banco e nenhum arquivo do projeto contém o valor. Não há valor no frontend, em variável `VITE_`, em log ou no repositório.
5. **Como o agendamento autentica:** o agendamento interno (a cada minuto) chama a função do processador enviando o cabeçalho com o segredo.
6. **Evidência de bloqueio:** teste automatizado já existente cobre visitante negado na rotina de leitura do segredo e nas tabelas da fila, além de chamada ao processador sem segredo e com segredo errado (ambas rejeitadas).

## Correção proposta

Passar a guardar o segredo **apenas no cofre criptografado do banco (Vault)** — o mesmo padrão já usado pelos agendamentos bancários do projeto — e apagar a tabela comum.

- Criar o segredo no cofre com valor aleatório gerado dentro do banco (nunca escrito em arquivo).
- Reagendar a tarefa do minuto para ler o segredo do cofre no momento da chamada.
- Trocar a rotina interna para ler do cofre em vez da tabela, mantendo execução restrita ao serviço interno.
- **Apagar** a tabela `private.dp_bulk_worker_auth`.
- Manter o segredo da função de backend como via principal de validação (ele continua sendo o caminho normal do envio feito pela tela de importação).
- Nenhum comportamento da fila, do reconhecimento ou das telas muda.

## Detalhes técnicos

- Migração: `SELECT vault.create_secret(encode(gen_random_bytes(32),'hex'), 'DP_BULK_WORKER_SECRET_CRON')`; `CREATE OR REPLACE FUNCTION public.dp_bulk_worker_secret()` lendo `vault.decrypted_secrets` (SECURITY DEFINER, `search_path` fixo, `EXECUTE` só para `service_role`, mantendo `private.dp_bulk_assert_service()`); `cron.unschedule('dp-doc-bulk-worker-tick')` + `cron.schedule` com `'x-worker-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'DP_BULK_WORKER_SECRET_CRON' LIMIT 1)` e o comentário de revisão do agendamento sub-horário; `DROP TABLE private.dp_bulk_worker_auth`.
- Código: nenhuma alteração necessária em `dp-doc-bulk-worker` (já consulta a rotina como alternativa) nem em `dp-doc-bulk-ingest`.
- Rollback: a migração de reversão recria o agendamento com o segredo de ambiente e remove o segredo do cofre.

## Validações

Testes (incluindo a bateria da fila e os testes de negação de visitante), TypeScript, lint, `migrations:check`, verificação das funções de backend, security-lint (base 63 críticos) e build.

Depois disso, paro.
