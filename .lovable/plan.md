# Novo colaborador: um único ponto de entrada

Hoje "Novo colaborador", "Folguistas e testes" e "Importar ficha de registro" são três caminhos separados. Passa a existir um só botão que pergunta o que você quer fazer.

## 1. Botão "Novo colaborador" abre uma escolha

Ao clicar, aparece uma janela curta com as opções:

- **Colaborador (cadastro manual)** — abre o cadastro completo como hoje.
- **Folguista** — abre o cadastro simples de apoio já com o tipo "Folguista".
- **Em teste** — mesmo cadastro simples, com o tipo "Em teste".
- **Importar ficha de registro** — leva direto para a leitura do PDF da ficha.

Cada opção tem uma linha explicando quando usar. A janela lembra o mesmo padrão já usado na escolha de nova conta financeira.

A tela específica de importação continua existindo (a leitura do PDF precisa de espaço próprio); ela deixa de ser um botão à parte no topo e passa a ser alcançada por essa escolha. Os itens "Folguistas e testes" e "Lixeira" continuam disponíveis no menu de ações.

## 2. Cadastro de folguista/teste direto da tela de Colaboradores

O formulário simples de pessoa de apoio (nome, telefone, CPF, cargo, unidade, setor, observação) passa a poder ser aberto de dentro da tela de Colaboradores, já com o tipo escolhido, sem precisar navegar para outra página. Após salvar, a lista da aba correspondente atualiza.

## 3. "Transformar em colaborador" vira "Promover a Colaborador"

Troca de rótulo em todos os lugares onde a ação aparece (menu de três pontos, botão de ícone, dicas, confirmações e mensagens de sucesso), tanto na tela de Colaboradores quanto na de Folguistas e testes. O comportamento não muda. Quando a pessoa já foi promovida, a dica passa a ser "Já promovido a colaborador".

## Detalhes técnicos

- Novo componente `src/components/dp/NovoCadastroMetodoDialog.tsx` (mesmo formato de `AccountCreationMethodDialog.tsx`), aberto pelo item `novo` de `actionItems` em `src/pages/dp/DpColaboradores.tsx`; opção de importar navega para `/dp/colaboradores/importar-ficha`.
- Extrair o formulário de pessoa de apoio de `src/pages/dp/DpPessoasApoio.tsx` para `src/components/dp/PessoaApoioFormDialog.tsx` (usando `useSalvarDpPessoaApoio` e `pessoaApoioSchema`), reutilizado nas duas telas com `tipo` inicial recebido por prop.
- Renomear textos de "Transformar em colaborador" em `DpColaboradores.tsx` (linhas ~856, ~908, ~971, ~1043) e `DpPessoasApoio.tsx` (~216-217) e nas mensagens de toast relacionadas.
- Sem alterações de banco, rotas ou regras de negócio. Validar com typecheck e os testes de `src/lib/dp` e `src/components/dp`.
