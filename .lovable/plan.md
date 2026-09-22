# Três correções em Pessoas 360°

## 1. Link de admissão excluído continua bloqueando novo convite

A ficha da Stéfane foi realmente excluída (marcada como removida em 17/09), mas
a conferência de duplicidade do convite olha só a situação da ficha e ignora que
ela foi excluída — por isso aparece "já tem uma pré-admissão em andamento".

O que muda:

- A conferência passa a desconsiderar fichas excluídas, tanto para o CPF quanto
  para colaborador; fichas excluídas nunca mais barram um convite novo.
- A mesma regra é aplicada nos outros pontos que consultam fichas em andamento
  (reenvio de link e conferência antes de efetivar), para não sobrar um caminho
  com o comportamento antigo.
- Nada é apagado: a ficha excluída da Stéfane continua guardada no histórico.

Depois do ajuste, é possível gerar um novo link para ela imediatamente.

## 2. Dados para pagamento: só conta do próprio colaborador

Hoje a tela aceita conta de terceiro (com nome e CPF do titular) e qualquer tipo
de chave Pix. Passa a valer:

- A opção "a conta é de outra pessoa" sai da tela de cadastro do colaborador e
  do portal do colaborador. Só é aceita conta de titularidade dele.
- O banco de dados passa a recusar qualquer gravação com titular de terceiro,
  então nem por outro caminho entra (hoje não existe nenhum registro assim).
- Chave Pix: CPF aparece primeiro e como recomendada, seguido de celular. E-mail
  e chave aleatória continuam disponíveis, mas com aviso de que o recomendado é
  CPF ou celular.
- Conferência simples da chave conforme o tipo escolhido (CPF válido, celular
  com DDD), com mensagem clara quando não bate.

## 3. Contagem de itens faltantes desencontrada

Três telas contam coisas diferentes sobre o mesmo colaborador:

- O card da lista conta apenas os itens obrigatórios (daí "falta 1 item").
- A ficha soma obrigatórios e opcionais na mesma frase, dando a impressão de
  vários itens faltando.
- Em "Completar cadastro", a tela de edição só destaca o e-mail: os demais itens
  (endereço, setor, vínculo, salário, dados de pagamento) não têm ligação com os
  campos da tela, então passam em branco.

O que muda:

- Uma contagem só, calculada no mesmo lugar: o card e a ficha passam a dizer o
  mesmo número, separando de forma clara "obrigatório" de "dá para completar
  depois".
- Na ficha, o número em destaque é o de obrigatórios; os opcionais aparecem como
  lista à parte, sem entrar na conta.
- Na tela de edição, todos os itens em falta ficam ligados ao campo certo e à
  aba certa (inclusive endereço, estado civil, PIS, vínculo e dados de
  pagamento), com destaque e resumo no topo listando tudo o que falta e onde
  está.

## Detalhes técnicos

- `supabase/functions/dp-preadmissao-convite/index.ts`: adicionar
  `.is("removido_em", null)` nas consultas de duplicidade (ficha em andamento) e
  revisar `dp-preadmissao-gestor` / `_shared/preadmissao.ts` para o mesmo filtro
  em reenvio e efetivação. Redeploy das funções afetadas.
- `src/lib/dp/dadosPagamento.ts`: remover `titular_proprio/titular_nome/
  titular_cpf` do fluxo de edição (mantidos os campos no banco por histórico),
  ordenar `PIX_TIPOS` com CPF e telefone primeiro, marcar os demais como
  "não recomendado" e acrescentar validação de chave por tipo em `erroPagamento`.
- Migration reversível: substituir `dp_colaborador_pagamento_guard` por versão
  que levanta `titular_terceiro_nao_permitido` quando `titular_proprio = false`;
  sem alterar dados existentes.
- `src/pages/dp/portal/DpMeuPerfil.tsx` e `src/components/dp/ColaboradorFormDialog.tsx`:
  remover o bloco de titular de terceiro e aplicar o aviso de chave preferencial.
- `src/lib/dp/cadastro-completude.ts`: expor um helper único de contagem
  (obrigatórios e opcionais) consumido por `DpColaboradores.tsx`,
  `ColaboradorFichaDialog.tsx` e `ColaboradorFormDialog.tsx`; ampliar
  `CAMPO_DA_CHAVE` no formulário para todas as chaves essenciais e parar de
  enviar `estado_civil`/`pis_nit` fixos como preenchidos.
- Testes: unitários para chave Pix (tipos e validação), para o recuo do titular
  de terceiro, para a contagem única de faltantes, e teste da conferência de
  duplicidade ignorando ficha excluída.
- Verificação: `bunx tsgo --noEmit -p tsconfig.app.json` e `bunx vitest run`.
