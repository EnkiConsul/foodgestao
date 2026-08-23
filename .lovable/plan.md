# Larguras ajustadas viram o padrão do sistema

As larguras que você arrastou estão salvas só no seu navegador. Para fixá-las como padrão do produto (todas as empresas), preciso primeiro capturar os números que você definiu.

## Passo 1 — Capturar suas larguras

Adiciono um atalho discreto e temporário, visível apenas para super admin, no cabeçalho das telas **Colaboradores** e **Histórico de documentos**: "Copiar larguras das colunas". Ao clicar, ele copia para a área de transferência um texto com a largura atual de cada coluna (e a ordem). Você cola aqui na conversa.

## Passo 2 — Fixar como padrão

Com os números em mãos:

- Substituo os valores em `DEFAULT_COLAB_COL_WIDTHS` (Colaboradores) e `DEFAULT_COL_WIDTHS` (Histórico) pelos seus.
- Se a ordem das colunas que você usa também estiver diferente do padrão, atualizo a ordem padrão junto (me diga se quer isso).
- Subo a versão da chave de armazenamento das larguras (ex.: `dp_colabs_col_width` → `dp_colabs_col_width_v2`), para que todos os usuários — inclusive você — passem a ver o novo padrão em vez de larguras antigas presas no navegador. Quem ajustar depois continua com o ajuste dele salvo.
- Removo o atalho temporário do Passo 1.

## Detalhes técnicos

- `src/pages/dp/DpColaboradores.tsx` e `src/pages/dp/DpHistoricoCompleto.tsx`: novos valores nos mapas de largura padrão e, se aplicável, nova ordem padrão.
- `src/hooks/useDpTableColumns.tsx`: nenhuma mudança de lógica; só o `storageKey` passado por cada tela é versionado.
- O atalho de captura lê `colWidths`/`colOrder` já expostos pelo hook e usa `navigator.clipboard`; sai do código no fim.
