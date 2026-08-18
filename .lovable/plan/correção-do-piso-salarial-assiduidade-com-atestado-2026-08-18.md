# Correção do piso salarial + assiduidade com atestado

## 1. Erro ao salvar a colaboradora Alessandra (confirmado)

O que os dados mostram:

- Alessandra (unidade com patronal SINDTUR) tem **admissão 28/02/2025** e nenhum dado de remuneração/benefício salvo no banco — ou seja, a tentativa de salvar realmente falhou e nada foi gravado (por isso as abas apareciam vazias).
- O cargo dela **já tem piso aberto** para o patronal SINDTUR, com vigência a partir de **22/05/2025**.
- Como a busca do piso usa a data de admissão (28/02/2025), que é anterior à vigência, o sistema conclui "cargo sem piso" e abre o diálogo "Cadastrar o piso salarial deste cargo?".
- Ao clicar em "Definir piso do patronal", é feito um INSERT de um novo piso aberto para o mesmo cargo + patronal, o que viola o índice único de piso vigente (um único piso aberto por cargo + patronal). O erro aborta todo o salvamento do colaborador.

Correções:

1. **Não pedir cadastro de piso quando já existe piso do patronal** (mesmo com vigência futura em relação à admissão): considerar o piso vigente mais recente ou o próximo a entrar em vigor, e usá-lo como referência do cargo.
2. **Gravar piso como sucessão de vigências**: ao definir um novo piso para cargo + patronal, encerrar a vigência do piso aberto anterior (vigência fim = dia anterior ao novo início) na mesma operação, em vez de inserir uma segunda linha aberta. Se o novo início for igual ao da linha existente, atualizar a linha.
3. **Não perder o cadastro do colaborador quando o piso falhar**: em caso de erro ao gravar o piso, exibir a mensagem real e continuar oferecendo o caminho "Só para este colaborador", para que os dados de remuneração e benefícios preenchidos sejam salvos.
4. Mensagens de erro do salvamento passam a mostrar o motivo retornado pelo banco (nunca "erro" sem detalhe).

## 2. Atestado na regra de assiduidade

Hoje o prêmio de assiduidade considera apenas faltas e atrasos. Passará a considerar atestado como ocorrência, com abono opcional pela empresa:

- Novo ajuste no cadastro de remuneração: **"Atestado também faz perder o prêmio"** (ligado por padrão, conforme convenção da Pakerê) e limite opcional de atestados tolerados no mês.
- O motor de cálculo do prêmio passa a receber a quantidade de atestados do mês e aplica a mesma lógica dos demais critérios (sem faltas/sem atrasos, sem faltas, proporcional).
- Origem dos atestados: solicitações do tipo "atestado" aprovadas dentro do mês de competência do colaborador.
- **Abono caso a caso**: na apuração/folha do mês, o gestor pode marcar "Abonar atestado (manter prêmio)" para um colaborador; o abono fica registrado no lançamento da folha, com quem abonou, e é refletido no holerite/CSV.
- Os novos campos entram no conjunto de "padrão de benefícios" (empresa/unidade/cargo), para replicação como os demais.

## Detalhes técnicos

- `src/components/dp/ColaboradorFormDialog.tsx`: resolução do piso (`pisosCargo`/`refSalario`) passa a aceitar piso com vigência futura; fluxo do `AlertDialog` de piso com fallback sem abortar o submit.
- `src/lib/dp/cargoSalarios.ts` / `useUpsertDpCargoSalario` (`src/hooks/useDpCadastros.tsx`): encerramento da vigência anterior antes de inserir novo piso aberto (cargo + `sindicato_patronal_id`), respeitando `dp_cargo_salarios_patronal_vigente_uniq`.
- Migração: novas colunas em `dp_colaboradores` (`assiduidade_considera_atestado boolean default true`, `assiduidade_max_atestados integer`) e em `dp_folha_lancamentos` (abono de atestado + autor), com GRANTs/RLS já existentes nas tabelas.
- `src/lib/dp/remuneracao.ts`: `OcorrenciasMes` ganha `atestados`; `premioAssiduidadeDevido` considera atestados e o limite; testes unitários em `src/lib/dp/__tests__`.
- `src/components/dp/RemuneracaoFields.tsx`, `ColaboradorFichaDialog.tsx`, `src/lib/dp/beneficiosPadrao.ts`: novos campos na UI, na ficha e no resumo/padrões.
- Apuração/folha (`src/lib/dp/apuracao.ts`, `src/lib/dp/folha.ts`, telas de folha): contagem de atestados aprovados no mês e ação de abono.
