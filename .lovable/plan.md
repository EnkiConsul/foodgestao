# Aplicar a máscara "Em desenvolvimento" em Benefícios

A página Benefícios aparece dentro do grupo Folha do menu do DP, mas hoje está fora do bloqueio: a rota `/dp/beneficios` não está classificada como parte do módulo Folha, por isso abre normalmente.

## O que muda

1. Classificar `/dp/beneficios` como pertencente ao módulo comercial Folha, de modo que ela entre automaticamente na lista de módulos pausados.
2. Envolver a rota de Benefícios com o mesmo gate usado em Folha/Ponto, exibindo o card "Módulo em desenvolvimento" com o botão de voltar ao DP 360°.
3. Marcar o item "Benefícios" do menu com o selo "Em breve" (sidebar desktop, menu Mais e portal), e remover o atalho da barra inferior mobile, igual aos demais itens pausados.

Os dados de benefícios já cadastrados continuam salvos, e os campos de benefícios usados no cadastro do colaborador (VT, VA, insalubridade) permanecem funcionando — apenas a tela de gestão de Benefícios fica mascarada.

## Detalhes técnicos

- `src/lib/dp/moduleMap.ts`: adicionar a regra `{ prefix: "/dp/beneficios", module: "folha" }` em `DP_ROUTE_MODULES`.
- `src/App.tsx`: envolver `<Route path="beneficios" ...>` com `<ModuloEmDesenvolvimentoGate module="folha">`.
- `src/config/dpNavigation.tsx`: no item `/dp/beneficios`, adicionar `badge: "Em breve"` e remover `shortcut: true`.
- Validação: abrir `/dp/beneficios` no preview e confirmar a máscara e o selo no menu.
