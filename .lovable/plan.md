## Problema 1 — Erro ao salvar

Confirmado no banco: existe a restrição `dp_config_dp_acordo_requer_negociacao_chk`, que obriga preencher `negociacao_id` sempre que o modo for "Acordo coletivo". Como o vínculo com o sindicato foi removido da tela, o salvamento no modo acordo sempre falha (erro 23514 nas tentativas de 04:49).

**Correção:** migração que remove essa restrição. A coluna `negociacao_id` continua existindo (histórico), apenas deixa de ser obrigatória.

## Problema 2 — Campo "Folgas de fim de semana por mês (colaborador)"

Ele é realmente redundante: a quantidade de folgas que o colaborador pode marcar já é derivada da frequência configurada acima (geral e mulheres).

**Correção:**

- Remover o campo da tela de regras.
- O teto mensal passa a vir **apenas** da frequência de folga dominical: modo "X por mês" → X folgas; modo "a cada X semanas" → arredondamento de 4,345 ÷ X (ex.: a cada 3 semanas = 1 folga/mês).
- Para colaboradoras, vale a frequência feminina quando ela for mais protetiva (mais folgas).
- O resumo já exibido na tela e no portal ("escolhe até N folga(s) por mês") continua funcionando, agora refletindo só a frequência.
- A coluna `folgas_fds_por_mes` permanece no banco por compatibilidade, mas deixa de ser lida/gravada pelo app.

## Detalhes técnicos

- Migração: `ALTER TABLE public.dp_config_dp DROP CONSTRAINT dp_config_dp_acordo_requer_negociacao_chk;`
- `src/lib/dp/dsr-rules.ts`: `tetoFolgasMes` deixa de considerar `folgas_fds_por_mes` e passa a aceitar `{ sexo }` opcional para aplicar a frequência feminina; `resumoEscolhaFolgas` acompanha a mudança.
- `src/pages/dp/cadastros/DpConfiguracoesJornada.tsx`: remover o input do campo (linhas ~455-460).
- `src/hooks/useDpConfigDp.tsx` e `src/hooks/useDpRegrasColaborador.tsx`: parar de selecionar/enviar `folgas_fds_por_mes`; o hook do portal passa o sexo do colaborador para o cálculo do teto.
- `src/lib/dp/__tests__/dsr-rules.test.ts`: atualizar os casos que hoje passam `folgas_fds_por_mes` e adicionar caso do teto feminino.
