# Trocas de folga: expiração automática, motivo compacto e fim do botão excluir

## 1. Expirar sozinho quando a data já passou

Hoje uma troca pedida para o dia 10 e nunca respondida fica "Aguardando colega" para sempre.

Nova regra: se a troca ainda estiver aguardando resposta (do colega ou do gestor) e a data envolvida já passou, ela vira **Expirada** automaticamente.

- Data de corte: a mais próxima entre a folga original e a folga proposta. Se qualquer uma delas já passou, não faz mais sentido responder.
- A verificação roda todo dia de madrugada (horário de Brasília) e também no momento em que a tela é aberta, para não haver atraso visual.
- Troca expirada não altera nenhuma folga: cada um fica com o dia que já tinha.
- Solicitante e destinatário recebem o aviso "Solicitação de troca expirada" com as datas.
- Novo estado "Expirada" no filtro de status, na etiqueta do cartão (cinza) e no portal do colaborador.
- Deixa de aparecer como pendência do gestor e do colaborador.

## 2. Motivo longo com "Ver mais"

- O motivo passa a aparecer em no máximo 2 linhas no cartão, com o link "Ver mais" / "Ver menos" quando o texto for maior.
- Mesma coisa no portal do colaborador.
- Nada muda quando o motivo é curto.

## 3. Botão de excluir sai da tela

O botão da lixeira apagava a solicitação do banco de forma definitiva, sem deixar rastro — é o que causa a dúvida e ainda apaga histórico.

- O botão de excluir é removido da tela de Trocas.
- Para desfazer, o gestor usa o que já existe: **Recusar** (antes de efetivar) ou **Cancelar troca** (depois de aprovada), sempre com justificativa registrada e visível aos dois colaboradores.
- Nada é apagado: o histórico completo continua consultável pelos filtros de status.

## Detalhes técnicos

- Migração (a partir da última existente): `ALTER TYPE dp_troca_status ADD VALUE 'expirada'` (em migração própria, antes do uso).
- Segunda migração: função `public.dp_expirar_trocas()` — `SECURITY DEFINER`, `search_path = public`, sem argumentos, atualizando `dp_trocas` onde `status IN ('pendente_colega','pendente_gestor')` e `LEAST(data_original, data_proposta) < (now() AT TIME ZONE 'America/Sao_Paulo')::date`, gravando `status = 'expirada'` e `gestor_resposta = 'expirada: prazo encerrado'` quando vazio; retorna a quantidade afetada. `GRANT EXECUTE` para `authenticated` e `service_role` (idempotente por natureza do filtro).
- `dp_notif_troca`: novo ramo para `status = 'expirada'`, notificando solicitante e destinatário (título distinto), sem tocar em `dp_folgas`.
- `pg_cron`: job diário `dp-expirar-trocas` às 03:10 UTC chamando `public.dp_expirar_trocas()`.
- `useDpTrocas.tsx`: chama `dp_expirar_trocas` antes do `select` da lista (best-effort, erro ignorado); `expirada` incluída no filtro de status.
- `src/lib/dp/troca-acoes.ts`: `acoesGestorTroca` retorna todas as ações `false` para `expirada`; `textoDecisaoGestor` ignora o prefixo `expirada:`. Remover a mutation `remover` do hook e o `AlertDialog` de exclusão de `DpTrocas.tsx`.
- Novo componente `src/components/dp/TextoExpansivel.tsx` (`line-clamp-2` + botão de alternar), usado em `DpTrocas.tsx` e `DpMeuTrocas.tsx`.
- `useDpPendencias.tsx` / `useDpPendenciasColaborador.tsx`: sem mudança de filtro (já filtram por status pendente), mas conferir que a data passada não conte mais após a expiração.
- Testes: unitários para `acoesGestorTroca('expirada', …)` e para o recorte do texto; teste de banco chamando `dp_expirar_trocas()` e verificando que só as pendentes com data passada mudam e que as folgas não são alteradas.
- Rodar typecheck, lint e vitest ao final.
