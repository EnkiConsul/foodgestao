# Concluir uma única vez ao registrar horário fora da CLT

## O que acontece hoje

Ao clicar em **Concluir** com um horário que dispara alerta da CLT, o cadastro grava os dados do colaborador e pede o horário ao painel de Horário de Trabalho. O painel percebe o alerta, abre o diálogo de ciência legal e devolve "pendente" — então o cadastro para, muda para a aba do horário e **não fecha**. Quando o usuário confirma a ciência, o painel grava o horário por conta própria, mas a intenção original (concluir e fechar) já foi descartada. Por isso é preciso clicar em **Concluir** de novo: na segunda vez não há mais nada pendente e a tela finalmente fecha.

## Como vai ficar

- Ao clicar em **Concluir** (ou **Salvar e continuar**) com alerta da CLT, o diálogo de ciência aparece como hoje.
- Ao confirmar a ciência e a justificativa, o horário é gravado **e o fluxo original continua sozinho**: mostra o toast de sucesso e fecha a tela quando a intenção era Concluir.
- Se o usuário **cancelar** o diálogo de ciência, nada é salvo, a tela permanece aberta na aba Horário De Trabalho e nada é fechado (comportamento atual preservado).
- O mesmo vale para o botão **Salvar** que existe dentro do próprio painel: continua funcionando como hoje, sem fechar o cadastro.

## Detalhes técnicos

- `src/components/dp/ColaboradorJornadaPanel.tsx`:
  - `salvarExterno` passa a aguardar a decisão do diálogo de ciência em vez de retornar imediatamente: guarda um `resolve` pendente (`Promise`) e devolve `"salvo"`, `"erro"` ou `"cancelado"` depois que o usuário confirma ou cancela.
  - `onConfirmarCiencia` e `onCancel` resolvem essa promise (confirmação → `registrarCiencia` + `persistir`; cancelamento → `"cancelado"`).
  - `SalvarJornadaResultado` ganha `"cancelado"`; `"pendente_ciencia"` deixa de ser emitido no caminho externo.
- `src/components/dp/ColaboradorFormDialog.tsx`:
  - No trecho após `salvarJornada()`, tratar `"cancelado"` como parada silenciosa (vai para a aba `jornada`, sem toast de erro) e seguir o fluxo normal de sucesso/fechamento quando o resultado for `"salvo"`/`"nada"`.
  - Remover o tratamento de `"pendente_ciencia"` que interrompia a conclusão.
- Sem mudanças de banco, RLS ou regras de cálculo.
