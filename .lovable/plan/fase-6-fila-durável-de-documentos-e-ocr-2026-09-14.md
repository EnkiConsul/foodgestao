# Fase 6 — Fila durável de documentos e OCR

## Diagnóstico do fluxo atual (verificado no código e no banco)

Como funciona hoje, da chegada do PDF até a aprovação:

1. A tela de importação cria o lote em `dp_bulk_import_batches` com situação "processando" e envia o PDF para o armazenamento.
2. A tela chama `dp-doc-bulk-ingest`. A função valida o usuário e o acesso à empresa, marca o lote como "processando" e **responde 202 imediatamente**.
3. Todo o trabalho pesado roda depois da resposta, dentro de `EdgeRuntime.waitUntil`: baixar o PDF, contar páginas (limite 60), separar página por página, subir cada página, chamar o OCR/IA (8 páginas em paralelo, com 1 tentativa extra), extrair CPF/CNPJ/competência, casar com o colaborador, detectar natureza e duplicidade, e só então **criar a linha do item** em `dp_bulk_import_items`.
4. No fim, o lote vira "pronto" e a revisão acontece nas telas de revisão; a aprovação chama `dp-doc-bulk-approve`, que usa a reserva idempotente e o versionamento criados na Fase 2.

Problemas confirmados:

- **Nada garante a execução.** Se a instância for reciclada, o `waitUntil` morre no meio: o lote fica preso em "processando" para sempre (a tela fica em consulta a cada 1,5 s indefinidamente) e as páginas que faltaram simplesmente não existem como item.
- **Não existe fila.** Os itens só nascem *depois* do OCR, então uma interrupção não deixa rastro do que ficou pendente.
- **Retry é apenas uma segunda chamada imediata**, sem espera, sem limite, sem distinção entre falha passageira (tempo esgotado, 429, 5xx) e definitiva (arquivo inválido).
- **Sem tempo limite** na chamada de IA: uma resposta que nunca chega prende a página até a instância cair.
- **Sem recuperação**: nenhum processo verifica lotes travados. `claim_expires_at` já existe na tabela de itens, mas é usado só na aprovação (Fase 2), não no OCR.
- **Sem visibilidade**: não há contagem de tentativas, próxima tentativa, início/fim do processamento nem último erro por página.
- O projeto **já tem o padrão pronto** para resolver isso: a fila de webhooks bancários usa reserva atômica com `FOR UPDATE SKIP LOCKED`, concessão com validade, retry com espera crescente e estado final "morto", acionada por um agendamento no banco. Vamos reaproveitar exatamente esse padrão.

## Arquitetura proposta

```text
upload → cria lote (queued) → cria as páginas como itens (queued)
      → responde rápido → aviso ao worker (melhor esforço)
      → varredura agendada (garantia real)
      → worker reserva item (atômico + validade) → OCR/IA com tempo limite
      → grava resultado (review) → revisão humana → aprovação (Fase 2, intacta)
```

Duas etapas duráveis, ambas na mesma tabela de itens (não criamos tabela nova):

- **Preparação do lote**: reservada pelo worker, separa as páginas e cria uma linha por página já em fila. Se morrer no meio, a validade expira e outro worker retoma; a criação das páginas é idempotente pela chave lote+página que já existe.
- **Processamento da página**: uma reserva por item, um worker por item, resultado gravado na própria linha.

A função `dp-doc-bulk-ingest` deixa de ser a garantia: ela apenas registra o trabalho e avisa o worker. Se o aviso falhar, a varredura agendada pega o serviço.

## Cadência da varredura — decisão que precisa de ciência

O aviso imediato faz o processamento começar em segundos no caminho normal. A varredura agendada existe só para recuperar trabalho abandonado. Recomendação: **a cada minuto** (1.440 execuções por dia). Checagens frequentes mantêm o banco ativo mesmo sem trabalho e podem aumentar o custo do Cloud; em troca, um lote interrompido volta a andar em até 1 minuto em vez de 5. A varredura sai por si só quando não há nada pendente e nada em atraso. Se preferir custo menor com recuperação em até 5 minutos, mudamos a cadência sem alterar o resto.

## Estados

Reaproveitando a tabela de itens, com nomes equivalentes aos pedidos:

- Item: `queued` (pendente) → `processing` → `pending` (em revisão — nome atual, preservado para não mexer nas telas) → `approved`/`rejected` → `imported`; falhas: `retry` (aguardando nova tentativa) e `failed`/`dead`.
- Lote: `queued` → `processing` → `ready` → `partially_imported`/`imported`; `failed` quando o próprio PDF é inválido.

Campos novos na linha do item: tentativas, máximo de tentativas, próxima tentativa, dono da reserva, validade da reserva, início e fim do processamento, último erro higienizado e classe do erro.

## Reserva, validade e concorrência

- Reserva por `SELECT ... FOR UPDATE SKIP LOCKED` dentro de uma função do banco: dois workers nunca pegam o mesmo item; quem perde segue para o próximo.
- Cada reserva vale por um tempo definido; expirada, o item volta para a fila e outro worker assume.
- Encerramento com sucesso e encerramento com falha também são funções do banco, que só aceitam a finalização de quem detém a reserva.

## Retry, espera e estado final

- Falha passageira (tempo esgotado, 429, 5xx, indisponibilidade): nova tentativa com espera crescente.
- Falha definitiva (arquivo inválido, formato não suportado, resposta sem conteúdo aproveitável): vai direto para estado final, sem loop.
- Estourado o limite de tentativas: estado final "morto", com o último erro higienizado registrado.

## Idempotência

- Uma linha por lote+página (restrição já existente): reprocessar não duplica página.
- Reprocessar uma página só reescreve o resultado do reconhecimento enquanto o item ainda está em revisão; item já aprovado, importado ou com documento gerado **não é tocado** — o versionamento e a reserva de aprovação da Fase 2 ficam intactos.
- A aprovação continua com a reserva idempotente da Fase 2, então retry não gera documento duplicado nem sobrescreve documento confirmado.

## Privacidade e segurança

- Nos registros de execução, apenas identificadores e códigos de erro: nada de conteúdo do documento, CPF, salário, arquivo, cabeçalhos de autorização, chaves ou resposta completa da IA.
- O worker é interno: exige segredo próprio no cabeçalho, comparado em tempo constante, como o worker de webhooks já faz. Não existe rota pública que permita a qualquer pessoa disparar processamento.
- A reserva ignora a empresa de quem chama porque é interna; toda leitura e revisão continua sob as regras de isolamento por empresa já existentes. Empresa A nunca alcança lote da empresa B.

## Observabilidade

Sem tela nova: os números (em fila, processando, aguardando nova tentativa, com falha, concluídos, tentativas, último erro, próxima tentativa, início/fim) ficam disponíveis por consulta a partir dos campos novos, e o progresso do lote continua aparecendo na tela de importação.

## Detalhes técnicos

- Migration: amplia a restrição de situação dos itens (`queued`, `processing`, `retry`, `dead`) e do lote (`queued`); adiciona `attempt_count`, `max_attempts`, `next_attempt_at`, `locked_by`, `lease_expires_at`, `started_at`, `finished_at`, `last_error`, `error_class`; índice parcial para a busca da fila. Nada é removido nem renomeado.
- RPCs (SECURITY DEFINER, `search_path` fixo, `EXECUTE` revogado de `anon`/`authenticated`/`PUBLIC`, apenas `service_role`): `dp_bulk_claim_batches`, `dp_bulk_enqueue_pages`, `dp_bulk_claim_items`, `dp_bulk_item_finish_success`, `dp_bulk_item_finish_failure`, `dp_bulk_reclaim_expired`, `dp_bulk_batch_finalize`.
- Nova Edge Function `dp-doc-bulk-worker` (`verify_jwt = false` + segredo interno em `supabase/config.toml`): reserva um lote pequeno de itens por execução, respeita um tempo máximo de execução, faz o OCR com `AbortController` (tempo limite explícito), classifica o erro pelo status HTTP e finaliza pela RPC. A lógica de reconhecimento/classificação é movida sem alteração de regra para `supabase/functions/_shared/` e reutilizada.
- `dp-doc-bulk-ingest` passa a: validar como hoje, marcar o lote em fila, avisar o worker em melhor esforço e responder 202. Sem `EdgeRuntime.waitUntil` como garantia.
- Agendamento no banco chamando o worker com o segredo interno (via `run_sql`, pois carrega dados do projeto), mais uma varredura de recuperação de reservas expiradas.
- Frontend: apenas os rótulos das situações novas (`queued`, `retry`, `dead`) na tela de importação/revisão, e a consulta periódica passando a considerar `queued`. Sem redesenho.
- Testes: um arquivo de fila (entra na fila, worker processa, dois workers disputam e só um vence, reserva expirada recuperada, tempo esgotado gera nova tentativa, 429/5xx gera nova tentativa, erro definitivo não entra em loop, limite de tentativas vira estado final, retry não duplica documento, documento confirmado da Fase 2 não é sobrescrito) e um de segurança (visitante não executa o worker nem as RPCs; empresa A não vê lote de B).
- Validações ao final: tipos, lint, testes, build, Deno check, migrations:check, isolamento multiempresa e security-lint (base 63 críticos; corrigimos apenas o que esta fase introduzir).
- Rollback: as RPCs e a função de worker são aditivas; desfazer é remover o agendamento e voltar a chamada antiga do receiver. Nenhum dado existente é apagado.

## Fora do escopo

Acesso/senha, documentos e versionamento da Fase 2, identidade, folgas, trocas, férias, convocações, escala, UX geral e as regras de reconhecimento/classificação da IA.
