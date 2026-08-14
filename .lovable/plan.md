# Máscara "Em desenvolvimento" na tela Conformidade

A tela Conformidade (`/dp/conformidade`) não pertence a um módulo comercial pausado (Ponto/Folha), por isso hoje abre normalmente. Vamos pausá-la por rota, mantendo todo o código e os dados.

## Como fica para o usuário

- O item "Conformidade" continua no menu do DP, agora com o selo "Em breve".
- Ao abrir a tela, aparece o aviso "Módulo em desenvolvimento" com o botão de voltar ao DP 360°.
- "Conformidade DSR" (dentro de Folgas e Férias) continua funcionando normalmente.
- Nenhum dado é apagado.

## Detalhes técnicos

- `src/lib/dp/moduleMap.ts`: nova lista `ROTAS_EM_DESENVOLVIMENTO: string[] = ["/dp/conformidade"]` (match exato ou por prefixo) + helper `isRotaEmDesenvolvimento(pathname)`; incluir esse teste em `isDpRouteEmDesenvolvimento`. Reativar depois é remover a rota da lista.
- `src/components/dp/ModuloEmDesenvolvimentoGate.tsx`: aceitar `module` opcional e, na ausência dele, avaliar a rota atual via `useLocation` + `isRotaEmDesenvolvimento`, usando o `titulo` recebido.
- `src/App.tsx`: envolver `<Route path="conformidade" ...>` com `<ModuloEmDesenvolvimentoGate titulo="Conformidade">`.
- `src/config/dpNavigation.tsx`: no item `/dp/conformidade`, adicionar `badge: "Em breve"` e remover `shortcut: true` (para não ocupar a BottomNav mobile).
- Validação: abrir `/dp/conformidade` no preview e confirmar a máscara, o selo no menu e que `/dp/conformidade-dsr` segue acessível.
