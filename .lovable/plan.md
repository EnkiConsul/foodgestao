# Corrigir a falha ao publicar a convocação

## O que aconteceu (confirmado nos registros do sistema)

Nas suas tentativas de hoje (17:28, 17:30 e 17:38) a publicação parou sempre no mesmo passo: ao gravar **quem vai receber a convocação**. O sistema recusou a gravação com a mensagem interna "o grupo foi alterado por outra pessoa" e desfez tudo — por isso nada foi publicado e o rascunho continuou como estava (grupo de setembro, 8 datas, Alessandra como destinatária).

Ninguém alterou nada de fato. Cada gravação carrega um "número de versão" do rascunho para evitar que duas pessoas se sobrescrevam. Nesse fluxo a tela envia uma versão que já não é a atual, e a gravação dos destinatários é rejeitada. A mensagem exibida ("alterado por outra pessoa") também confunde, porque sugere um conflito que não existe.

## O que vai mudar

1. **Publicar volta a funcionar**: antes de gravar destinatários e antes de publicar, a tela busca a versão atual do rascunho, em vez de reaproveitar uma versão antiga.
2. **Recuperação automática**: se ainda assim houver divergência de versão, o sistema atualiza a versão e tenta uma vez mais sozinho, sem você precisar refazer nada.
3. **Sem gravação desnecessária**: quando a lista de destinatários e a ordem de prioridade não mudaram, o sistema não regrava nada (hoje ele regrava sempre, e é aí que a versão fica defasada).
4. **Mensagens honestas**: se realmente houver conflito (duas pessoas editando ao mesmo tempo), o aviso explica isso e oferece "Recarregar e tentar de novo", em vez do texto atual.
5. **Nenhuma regra de negócio muda**: antecedência, justificativa, elegibilidade, vagas e o bloqueio de horário já iniciado continuam iguais.

## Detalhes técnicos

- `dp_convocacao_definir_destinatarios`: adicionar caminho idempotente — quando a lista de destinatários, os níveis e o intervalo já são os desejados, retornar o `updated_at` atual sem `UPDATE` no grupo (mesmo padrão já usado em `dp_convocacao_atualizar_grupo`); manter a checagem de `expected_updated_at` só quando houver mudança real, e continuar retornando `updated_at` pós-update.
- `dp_convocacao_criar_ocorrencia`, `dp_convocacao_atualizar_ocorrencia`, `dp_convocacao_cancelar_ocorrencia_rascunho` e `dp_convocacao_definir_horario_destinatario`: incluir `grupo_updated_at` no retorno (o frontend já lê essa chave em `persistir`, mas hoje ela nunca vem).
- `NovaConvocacaoPlanner.persistir`: antes de `definirDestinatarios`, reler `dp_convocacao_grupos.updated_at` do grupo (select pontual) e usar esse carimbo; guardar o retorno em `grupoExpected`. Em `publicarGrupo`, reler o carimbo imediatamente antes de `publicar.mutateAsync`.
- Novo helper de retry: em erro `40001` (`CONCURRENT_MODIFICATION`) nas chamadas de destinatários/override/publicação, refazer a leitura do carimbo e repetir a chamada uma única vez; se falhar de novo, propagar o erro.
- `textoDoErroDePublicacao` / toasts: texto específico para `CONCURRENT_MODIFICATION` ("O rascunho foi atualizado em outra aba ou por outra pessoa. Recarregue e tente novamente.") com ação de refetch.
- Testes em `src/lib/dp`: cobrir (a) destinatários iguais não geram nova versão, (b) o fluxo de publicação usa o carimbo relido, (c) retry único em `40001`.
- Verificação: `bunx tsgo --noEmit -p tsconfig.app.json`, `bunx vitest run src/lib/dp` e uma publicação real do rascunho existente de setembro.
