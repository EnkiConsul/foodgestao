## Problema

O widget Pluggy Connect não carrega porque `src/components/accounts/usePluggyConnect.ts` referencia `https://cdn.pluggy.ai/pluggy-connect/v2.9.0/pluggy-connect.js`, e essa versão não existe no CDN (404). Apenas `v2.7.0` e `latest` respondem 200.

## Correção

Trocar a URL do CDN para uma versão publicada e estável, e adicionar fallback em caso de falha no primeiro carregamento.

### Alteração única em `src/components/accounts/usePluggyConnect.ts`

1. Substituir a constante `CDN_URL` para apontar para a versão publicada mais recente estável:
   ```ts
   const CDN_URL = "https://cdn.pluggy.ai/pluggy-connect/v2.7.0/pluggy-connect.js";
   ```
2. Adicionar um fallback simples em `loadPluggyScript`: se `onerror` disparar, tentar recarregar uma vez a partir de `https://cdn.pluggy.ai/pluggy-connect/latest/pluggy-connect.js` antes de rejeitar. Isso protege contra novas remoções de versão sem depender só de `latest` (que pode introduzir breaking changes).
3. Mensagem de erro final continua "Falha ao carregar Pluggy Connect", mas só após ambas tentativas falharem.

Nenhuma outra alteração necessária — o resto do fluxo (token, instância, `init`) continua correto.

## Verificação

- Recarregar a página Contas Bancárias e clicar em "Conectar banco".
- Confirmar que o widget Pluggy abre e não aparece o toast "Falha ao carregar Pluggy Connect".
