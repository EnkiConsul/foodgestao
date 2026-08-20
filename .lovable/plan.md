# Cadastro do colaborador: acesso e desligamento dentro de Dados

## O que muda

1. **Acesso ao portal deixa de ser aba** — o painel de acesso (situação do login, CPF de acesso, gerar acesso, redefinir senha, senha temporária e carência após desligamento) passa a ser um bloco no fim da aba **Dados**, logo abaixo do perfil de acesso.

2. **Desligamento deixa de ser aba** — o bloco de desligamento (data da demissão, motivo, elegibilidade para recontratação, observações, prévia do impacto e os botões Registrar/Editar desligamento e Reintegrar) também vai para a aba **Dados**, como último bloco, com destaque visual de área sensível.

3. **Cabeçalho do cadastro** — sai o menu de três pontos; fica apenas o botão de **lixeira** (excluir cadastro) com a confirmação atual.

As abas passam a ser: Dados · Horário de Trabalho · Remuneração · Dependentes · Documentos.

Os atalhos da lista de colaboradores ("Acesso ao portal", "Desligar", "Reintegrar") continuam funcionando: abrem o cadastro na aba Dados e rolam até o bloco correspondente.

## Detalhes técnicos

- `ColaboradorFormDialog.tsx`: remover os `TabsTrigger`/`TabsContent` de `acesso` e `desligamento`; renderizar `ColaboradorAcessoPanel` e `ColaboradorDesligamentoPanel` dentro do `TabsContent value="dados"`; trocar o `DropdownMenu` do cabeçalho por um único `Button` com ícone `Trash2` (aria-label "Excluir cadastro").
- `initialTab`: os valores `"acesso"` e `"desligamento"` continuam aceitos, mas mapeiam para a aba `dados` + `scrollIntoView` em âncoras (`#acesso-portal`, `#desligamento`); o indicador de pendência de desligamento migra para o `TabsTrigger` de Dados.
- `DpColaboradores.tsx`: sem mudança de chamada — segue passando `initialTab`.
