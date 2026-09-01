# Mensagem clara quando o banco recusa a autorização (Open Finance)

## Contexto

O erro do anexo (`400 - server_error: Unable to retrieve pushed authorization request`) acontece dentro do domínio do Santander (`openbanking.api.santander.com.br`), depois que o usuário sai do 360°FOOD. Nesses casos o usuário nunca volta com um item autorizado: ou fica na tela de erro do banco, ou volta para o app com parâmetros de erro na URL. Hoje, quando ele volta, a tela só diz "Conexão em andamento… conclua a autorização no app do seu banco", com o botão "Já autorizei, verificar agora" — orientação errada para uma autorização recusada pelo banco.

O objetivo é reconhecer esse cenário e dar a orientação correta: recomeçar a conexão do zero, sem recarregar nem voltar página.

## O que muda

1. **Detectar retorno com erro do banco.** Além de `itemId`/`item_id`, o diálogo passa a ler os parâmetros de erro que o provedor devolve na URL de retorno (`error`, `error_description`, `error_code`, `status=error`). Quando houver erro em vez de item, o fluxo entra num estado de falha em vez de "aguardando autorização".

2. **Tela de falha com orientação certa.** Nesse estado a mensagem passa a ser explícita:
   - "O banco não concluiu a autorização" + explicação de que a solicitação de consentimento expirou ou foi recusada pelo banco.
   - Instruções: iniciar de novo e concluir sem recarregar, voltar página ou reabrir o link; se repetir, é indisponibilidade momentânea do banco.
   - Botões: **Tentar novamente** (limpa o estado retomado e reinicia a conexão do zero) e **Fechar**.
   - O botão "Já autorizei, verificar agora" não aparece nesse caso.

3. **Dicionário de erros do widget.** Mapear os códigos/mensagens mais comuns devolvidos pelo `onError` do Pluggy Connect e pelos parâmetros de retorno para textos em português, com destaque para:
   - falha de autorização/consentimento no banco (caso do anexo);
   - credenciais inválidas;
   - banco temporariamente indisponível;
   - tempo esgotado na tela do banco.
   Erros desconhecidos continuam mostrando a mensagem original, sem inventar causa.

4. **Ajuste no texto de "conexão em andamento".** Manter a orientação de QR Code, mas acrescentar uma linha curta: se apareceu uma tela de erro no site do banco, a autorização não foi concluída — usar "Tentar novamente".

## Fora do escopo

- Nada muda no backend, nas funções de sincronização ou no banco de dados: a falha é do lado do Santander e não gera registro nosso.
- Não haverá retentativa automática — quem decide recomeçar é o usuário.

## Detalhes técnicos

- `src/components/accounts/PluggyConnectDialog.tsx`
  - `RETURN_PARAMS` ganha a leitura de erro (`readReturnError()`), e `clearReturnParams()` passa a limpar também esses parâmetros.
  - Novo `phase: "failed"` alimentado tanto pelo retorno com erro quanto pelo `onError` do widget.
  - Nova função `retry()`: limpa `sessionStorage` de retomada, zera `error`/`pending`/`finishedRef` e volta para `phase: "launch"`.
  - `hasPluggyReturn()` passa a considerar retorno com erro, para que a página que abre o diálogo continue reabrindo-o no retorno.
- Novo módulo `src/lib/pluggy/connectErrors.ts` com o mapa de códigos → mensagem em PT-BR e a função `describeConnectError(input)`; coberto por teste unitário em `src/test/unit/pluggyConnectErrors.test.ts` (inclui o caso `server_error` / `Unable to retrieve pushed authorization request`).
- Verificação: `tsgo` + `bunx vitest run` nos testes afetados.
