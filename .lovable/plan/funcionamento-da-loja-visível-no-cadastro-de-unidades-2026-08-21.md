# Funcionamento da loja visível no cadastro de Unidades

O editor de horário de funcionamento já existe no formulário de unidade, mas ficou no rodapé de um formulário longo: no celular é preciso rolar por empresa, CNPJ, endereço, ponto e adiantamento antes de encontrá-lo. Vamos torná-lo um destino explícito.

## O que muda

1. **Abas no formulário de unidade**: "Dados" e "Funcionamento". A aba Funcionamento traz o editor de períodos (Almoço, Jantar etc.) e, quando a unidade ainda não foi salva, a mensagem de que basta cadastrar primeiro.
2. **Diálogo em tela cheia no celular**, com cabeçalho (nome da unidade) e rodapé (Cancelar/Salvar) fixos, no mesmo padrão já usado no cadastro de colaborador. No desktop segue como janela larga.
3. **Atalho direto**: no card da unidade e na ficha de visualização, um botão "Funcionamento" abre o formulário já na aba Funcionamento.
4. **Resumo visível**: card e ficha da unidade mostram um resumo curto do funcionamento (ex.: "Seg–Sex 08:30→18:30 · 17:00→00:35") ou o aviso "Funcionamento não configurado".
5. **Nova unidade**: após cadastrar, o formulário permanece aberto e vai automaticamente para a aba Funcionamento — inclusive quando criada pelo atalho dentro do cadastro do colaborador.

## Detalhes técnicos

- `src/components/dp/UnidadeFormDialog.tsx`: envolver o conteúdo em `Tabs` (`dados` | `funcionamento`), aceitar prop opcional `abaInicial`, aplicar `h-[100dvh]` no mobile com header/footer sticky e mover o `HorarioFuncionamentoEditor` para a aba.
- `src/pages/dp/DpUnidades.tsx`: guardar a aba desejada ao abrir o diálogo, botão "Funcionamento" nos cards e na ficha.
- Resumo: novo hook leve (ou consulta agregada em `useDpCadastros`) lendo `dp_unidade_horarios_funcionamento` por unidade, formatado com `formatarFuncionamento`/faixas de dias já existentes em `src/lib/dp/turno-utils.ts`.
- `HorarioFuncionamentoEditor` perde o botão de salvar sticky duplicado quando renderizado dentro do diálogo (o rodapé do diálogo salva dados + funcionamento juntos).
