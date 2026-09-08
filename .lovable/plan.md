# Folguistas e testes dentro da lista de Colaboradores

Objetivo: os cards e linhas de Folguista / Em Teste passam a se comportar como os de colaborador (abrir ao clicar, editar e excluir), e a tela separada "Folguistas e testes" deixa de existir.

## O que muda

1. Nas abas **Folguistas**, **Em Teste** e **Todos** da tela Colaboradores:
   - clicar no card (ou na linha, no computador) abre a edição da pessoa;
   - menu de ações com: **Editar**, **Promover a Colaborador** (desativado quando já promovida) e **Excluir** (em vermelho, com confirmação);
   - o card ganha o telefone junto ao CPF, para não perder informação que só existia na tela antiga.
2. Excluir pede confirmação em caixa de diálogo, avisando que a pessoa sai do banco de folguistas.
3. Remoção da tela separada:
   - o atalho "Folguistas e testes" sai do menu de ações da tela de Colaboradores;
   - a rota `/dp/colaboradores/apoio` e a página correspondente são removidas;
   - o atalho "Nova" daquela tela já existe hoje no botão "Novo colaborador".

## Detalhes técnicos

- `src/pages/dp/DpColaboradores.tsx`: novos estados `apoioEditando` e `apoioAExcluir`; o diálogo `PessoaApoioFormDialog` passa a receber `pessoa`; `AlertDialog` de confirmação usando `useExcluirDpPessoaApoio`; ações adicionadas às linhas da tabela e ao `DpListCard` nas abas de apoio e em "Todos"; remoção do item `apoio` de `actionsExtra`.
- `src/App.tsx`: remoção do import `lazyWithRetry` de `DpPessoasApoio` e da rota `colaboradores/apoio`.
- Exclusão de `src/pages/dp/DpPessoasApoio.tsx`.
- Sem alterações de banco, de regras de negócio ou de outros módulos. Ao final: typecheck e a suíte de testes do DP.
