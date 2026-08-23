# Corrigir aviso falso de "nenhuma unidade cadastrada" em Regras de Folgas

## O que está acontecendo

As duas unidades (Pakerê Garavelo e Pakerê T-63) existem e são carregadas com sucesso — reproduzi a tela e a busca das unidades retornou as duas normalmente (status 200), sem o aviso vermelho no fim do carregamento.

O problema é de estado de carregamento: a tela mostra o aviso "Cadastre ao menos uma unidade..." sempre que a lista está vazia, inclusive **enquanto** ela ainda está sendo carregada. A busca de unidades só começa depois que a lista de empresas do usuário fica pronta, então nos primeiros instantes a tela aparece exatamente como no print: seletor vazio, desabilitado, com o texto "Nenhuma unidade cadastrada" e o alerta vermelho embaixo.

## Como fica

- Enquanto as unidades estiverem carregando: seletor desabilitado com o texto "Carregando unidades..." e **nenhum** aviso vermelho.
- Somente quando o carregamento terminar e realmente não houver unidade: aparece o aviso "Cadastre ao menos uma unidade em Cadastros → Unidades...".
- Se a busca falhar: mensagem de erro com botão "Tentar novamente", em vez de sugerir cadastrar unidade.
- Nenhuma mudança em dados, regras de negócio ou permissões.

## Detalhes técnicos

- `src/hooks/useDpCadastros.tsx`: nada a alterar na consulta; apenas passar a expor/consumir `isLoading` e `isError` de `useDpUnidades` na tela.
- `src/pages/dp/cadastros/DpConfiguracoesJornada.tsx`:
  - ler `isLoading: unidadesCarregando` e `isError: unidadesErro` do `useDpUnidades()`;
  - considerar também o estado "aguardando empresas" (query desabilitada) como carregando, para não piscar o aviso;
  - trocar o placeholder do `Select` conforme o estado (carregando / vazio);
  - condicionar o parágrafo do aviso a `!unidadesCarregando && !unidadesErro && unidades.length === 0`;
  - em caso de erro, exibir uma linha com `Button` "Tentar novamente" chamando o `refetch` da query de unidades.
