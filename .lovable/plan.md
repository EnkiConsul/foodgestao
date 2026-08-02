## Objetivo

Exibir no seletor de instituições apenas conectores **regulados (Open Finance)**, eliminando as versões "diretas" por credencial (motivo dos dois "Banco do Brasil Empresas" na lista).

## Contexto

O filtro atual em `supabase/functions/pluggy-connect-token/index.ts` (`listFriendlyConnectorIds`) apenas remove conectores que exigem certificado digital / Client ID+Secret (mTLS, ex.: "Inter Empresas"). Conectores de login direto continuam passando, então o mesmo banco aparece duas vezes: um regulado (Open Finance, autorização no app do banco) e um direto (credenciais do internet banking).

## Mudança

Em `listFriendlyConnectorIds`:

1. Manter o bloqueio de conectores mTLS/certificado (já existente).
2. Adicionar filtro por regulação: manter apenas conectores marcados pela Pluggy como Open Finance regulado (campo `isOpenFinance` / `oauth` / equivalente no payload de `/connectors`). Antes de fixar o campo, inspecionar uma resposta real de `GET /connectors?countries=BR&sandbox=false` para confirmar o nome exato da flag.
3. Fallback seguro: se nenhum conector regulado for identificado (payload sem a flag esperada), retornar a lista atual em vez de lista vazia — para não deixar o widget sem nenhuma instituição.
4. Logar a contagem antes/depois do filtro para diagnóstico.

## Verificação

- Reimplantar a função e usar `/admin/pluggy-status` ("Reexecutar") para confirmar que o token continua sendo gerado.
- Abrir o diálogo de conexão e buscar "banco": deve aparecer apenas uma entrada por banco, com o selo "Regulado".
