# Leitura de lançamentos: garantir a correção em todos os caminhos

## Situação verificada agora

A correção de ontem foi feita no trecho compartilhado que atende **todas as empresas e usuários** na sincronização normal (`_shared/pluggy.ts`), então o erro de "cursor inválido" não volta por ali.

Mas existe um **segundo caminho** de leitura de lançamentos, usado na primeira importação de uma conexão nova (`_shared/pluggy-client.ts` → `listTransactionsV2`, chamado por `_shared/pluggy-v2-materialize.ts`). Esse trecho:

- lê a próxima página apenas de um campo `nextCursor`, enquanto o provedor responde o ponteiro no campo `next`;
- monta a próxima página como `?pageCursor=...` em vez de seguir o ponteiro devolvido.

Resultado provável: nesse caminho a importação **para silenciosamente na primeira página** (sem erro visível), o que pode deixar conexões novas com histórico incompleto para qualquer usuário.

## O que será feito

1. Unificar a leitura das páginas: os dois caminhos passam a usar a mesma função de normalização do ponteiro já criada (`next`, `nextCursor`, caminho completo, query ou cursor puro), seguindo exatamente o ponteiro devolvido pelo provedor.
2. Manter o limite de segurança de páginas e o encerramento quando não houver ponteiro nem resultados.
3. Testes automáticos cobrindo os dois caminhos: duas páginas com `next` em formato de caminho, em formato de query, cursor puro e resposta sem ponteiro.
4. Publicar as funções e conferir, na conexão que já apresentou o problema, que a leitura passa da primeira página.
5. Conferir se alguma conexão existente ficou com histórico incompleto por causa desse segundo caminho e, se sim, reimportar apenas o período faltante (sem duplicar lançamentos, que já são identificados de forma única).

## Detalhes técnicos

- Exportar/reutilizar `nextTransactionsPath` de `supabase/functions/_shared/pluggy.ts` (ou movê-la para um util comum) e aplicar em `listTransactionsV2`, aceitando também `next` na resposta.
- Ajustar `pluggy-v2-materialize.ts` para ler `next ?? nextCursor` e repassar o ponteiro normalizado.
- Testes em `src/test/unit/pluggyTransactionsCursor.test.ts` (arquivo já existente) estendidos para o cliente V2.
- Sem migração de banco. Sem mudança de tela.

## Verificação

- Nenhum evento novo com erro de cursor.
- Conexão nova importa mais de uma página de lançamentos.
- Contagem de lançamentos pendentes cresce de forma coerente com o extrato do banco.
