# A ficha foi lida — a tela é que não atualizou

Conferindo o que ficou gravado: a leitura do arquivo "Ficha Registro de Empregado (3).pdf" terminou com sucesso, as 2 páginas foram lidas e **1 ficha foi identificada** (THAIS FRANCIELE NUNES DOS SANTOS, CPF 750.665.211-00, páginas 1 a 2, aguardando conferência). Ou seja: o sistema reconheceu, mas a tela continuou mostrando "0 ficha(s)" e a mensagem de que nada foi reconhecido.

## Causa

A lista de fichas só é recarregada enquanto o arquivo está sendo lido. A ficha é gravada no mesmo instante em que a leitura é marcada como concluída, então a última atualização da tela acontece um segundo antes da ficha existir — e depois nunca mais recarrega. Basta recarregar a página para ver a ficha, mas ninguém deveria precisar disso.

## Correção

1. Assim que a leitura terminar (concluída ou com falha), recarregar a lista de fichas daquele arquivo mais uma vez.
2. Enquanto o arquivo estiver "concluído" mas nenhuma ficha tiver aparecido, continuar tentando por alguns segundos antes de exibir qualquer mensagem.
3. Só mostrar "Nenhuma ficha foi reconhecida" depois dessas tentativas, para nunca acusar erro em cima de uma leitura que deu certo.
4. Deixar visível no cartão do arquivo quantas fichas a leitura encontrou, para que a contagem da tela e o resultado da leitura nunca pareçam divergir.

Não é preciso enviar o PDF de novo: a ficha já está lá e vai aparecer para conferência.

## Detalhes técnicos

- `src/hooks/useDpFichaImportacao.tsx`: em `useDpFichaImportacoes`, detectar a transição `processing → ready/failed` e invalidar `["dp_ficha_itens", companyId, importacaoId]`; em `useDpFichaItens`, manter `refetchInterval` de 3s por até ~5 tentativas quando a importação estiver `ready` com `fichas_identificadas > 0` e `data.length === 0`.
- `src/pages/dp/DpFichaRegistroImportar.tsx`: usar `atual.fichas_identificadas` no badge e condicionar a mensagem de "nenhuma ficha" a `fichas_identificadas === 0` além de `itens.length === 0`.
- Sem mudanças de banco, RLS ou edge function (`dp-ficha-registro-parse` respondeu 200 nas duas páginas, ~9s cada).
