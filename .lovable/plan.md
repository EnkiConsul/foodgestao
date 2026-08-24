# Por que o pop-up da Pluggy reaparece após conectar

## O que está acontecendo

O pop-up da imagem ("360°FOOD usa a Pluggy para se conectar às suas contas" + "Continuar") é a tela inicial do próprio widget da Pluggy, não uma tela nossa.

Ao autorizar via Open Finance, o banco devolve o usuário para a nossa página com `?itemId=8c5ad6af-...` na URL (visível na imagem). Nesse retorno:

- `ContasBancarias` reabre o Pluggy Connect automaticamente porque existe um "resume" salvo na sessão (`hasPluggyResume()`).
- O componente do Pluggy Connect **nunca lê o `itemId` da URL**: ele apenas reabre o widget com o mesmo `connectToken` salvo.
- Como o widget é reiniciado do zero, ele volta a exibir a tela de boas-vindas/consentimento — dando a sensação de "voltou ao começo".
- A conclusão só acontece se o webhook já tiver marcado a solicitação como `completed`; quando ainda não marcou, o usuário fica preso nessa tela.

## Correção proposta

1. **Consumir o `itemId` do retorno**: ao abrir a página/diálogo, ler `itemId` (e variações como `item_id`) dos parâmetros da URL. Se existir e pertencer à empresa selecionada, finalizar direto a conexão (sincronizar via `pluggy-sync-item`) em vez de reabrir o widget.
2. **Limpar a URL** após consumir o parâmetro, evitando repetição ao recarregar a página.
3. **Estado de retorno em vez de widget**: quando houver retorno de consentimento, mostrar um estado próprio ("Confirmando a autorização com o banco…") com verificação automática e botão "Verificar novamente", só reabrindo o widget da Pluggy se o usuário pedir explicitamente.
4. **Encerrar o resume** ao concluir com sucesso ou quando o token expirar, para o aviso de "Conexão em andamento" não persistir.

## Detalhes técnicos

- `src/components/accounts/PluggyConnectDialog.tsx`: nova fase `returning`; leitura de `itemId`/`item_id` da querystring antes do `launch`; finalização por `finishFromRequest(itemId)` mesmo sem `connectRequestId` resolvido; `clearResume()` após sucesso.
- `src/pages/ContasBancarias.tsx` e `src/pages/ConexoesPluggy.tsx`: abrir o diálogo no modo de retorno quando a URL contiver `itemId`, e remover o parâmetro com `navigate(pathname, { replace: true })`.
- Sem mudanças de banco de dados nem de edge functions.
