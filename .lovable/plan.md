# Foco automático no campo pendente

Hoje, quando falta uma informação, o sistema mostra apenas um toast com a mensagem. Passará a levar o usuário diretamente ao campo que precisa ser preenchido.

## Comportamento novo

- Ao clicar em **Salvar e continuar** ou **Concluir** com informação faltante:
  - o sistema abre a aba onde está o campo (já ocorre hoje);
  - rola a tela até o campo, coloca o cursor nele (foco) e destaca a borda em vermelho;
  - o toast continua explicando o que falta.
- O destaque vermelho e a mensagem curta abaixo do campo permanecem até o usuário corrigir o valor.
- Vale para os campos obrigatórios das abas **Dados** (nome, CPF, cargo, unidade, admissão, nascimento, data de demissão) e **Remuneração** (salário/valor-hora, vale-transporte, vale-alimentação, prêmio de assiduidade).
- Para campos de seleção (Cargo, Unidade), o foco abre o campo pronto para escolha.

## Detalhes técnicos

- Em `src/components/dp/ColaboradorFormDialog.tsx`, os validadores `erroDados`/`erroRemuneracao` passam a retornar `{ campo, mensagem }` em vez de só a string.
- Novo estado `campoErro` guarda o identificador do campo; um `useEffect` faz `scrollIntoView({ block: "center" })` + `focus()` no elemento correspondente via mapa de refs (ou `data-field` + `querySelector` no conteúdo do diálogo).
- Cada campo obrigatório recebe `data-field="<id>"`, classe condicional `border-destructive` quando `campoErro === id`, e `aria-invalid` para acessibilidade.
- `campoErro` é limpo quando o valor daquele campo muda e a cada novo `submit`.
- Campos da aba Remuneração ficam dentro de `RemuneracaoFields.tsx`: o componente recebe a prop `campoErro` para aplicar o destaque e o `data-field`.
