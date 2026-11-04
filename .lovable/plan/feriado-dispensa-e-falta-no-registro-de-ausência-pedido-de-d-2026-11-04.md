# Feriado: dispensa e falta no Registro de Ausência + pedido de dispensa pelo portal

Escopo enxuto: apenas os dois itens combinados. Ficam fora: botão de convocação automática na unidade, avisos D-10/D-5 e travas de troca.

## 1. Registro de Ausência do gestor (calendário)

Quando o dia escolhido é feriado da loja, aparecem dois motivos a mais (só nesse caso):

- **Dispensa em Feriado**
  - Origem obrigatória: "A pedido do colaborador" ou "Liberalidade da empresa".
  - Não gera falta nem desconto e não mexe no descanso semanal.
  - Não gera dobra nem folga compensatória.
  - Fica registrada no histórico de Ocorrências como dispensa, com justificativa.
- **Falta em Feriado Convocado**
  - Aviso visível: possível desconto do dia e do descanso semanal.
  - Fica registrada como falta, para o gestor tratar (Abono, Compensação ou Desconto em Folha), como já é feito hoje.

Quem pode ser escolhido para esses dois motivos:
- Só quem está escalado para trabalhar no feriado.
- Ficam de fora sócios (para falta), quem está de folga e quem está de férias, atestado ou outro afastamento.

## 2. Pedido de dispensa pelo portal do colaborador

Colaborador escalado para um feriado vê, no dia do feriado no portal, o botão **"Pedir dispensa do feriado"**:

1. Escreve o motivo.
2. Lê e assina um termo curto: pede a dispensa por vontade própria, sabe que não recebe dobra nem folga compensatória e que o dia continua remunerado como feriado.
3. O pedido vai para o gestor como pendente (aparece em Ações do Dia e notificação).

Gestor:
- **Aprova:** o dia vira "Dispensa em Feriado — a pedido do colaborador", com o termo assinado como evidência. Logo após aprovar aparece o atalho **"Cobrir este posto"**, que abre a convocação de mão de obra extra já com loja, data e turno preenchidos.
- **Recusa:** com motivo; colaborador é avisado e continua escalado.
- Pedido pode ser cancelado pelo colaborador até a decisão.
- Não é possível pedir para dia que já passou ou quando já há falta/férias/afastamento no dia.

## Ordem de construção

1. Motivos no Registro de Ausência (com regras de quem pode ser escolhido) + testes das regras.
2. Pedido pelo portal com termo assinado.
3. Aprovação/recusa do gestor e atalho "Cobrir este posto".

## Detalhes técnicos

- Novos motivos em `ausencia-elegibilidade.ts` (`DISPENSA_FERIADO`, `FALTA_FERIADO`), ativos só se a data é feriado da unidade (resolver v2 de feriados).
- Pedido do portal reutiliza `dp_solicitacoes` com novo tipo, gravação e decisão por RPC autorizada no servidor; termo assinado gravado pelo servidor, imutável, conforme padrão de aceites.
- Aprovação cria a ocorrência vinculada à solicitação (origem imutável), atômica.
- Atalho de cobertura reutiliza o fluxo de Convocações existente com parâmetros pré-preenchidos.
- Testes: um por regra (feriado obrigatório, exclusão de sócio/folga/férias, sem dobra na dispensa, pedido bloqueado em dia passado).
