# Cargos e Salários — Tela Unificada

Faz sentido, sim. Hoje "Cargos" e "Adicionais e Salário-Família" são telas separadas, mas tratam do mesmo assunto: quanto o colaborador recebe pelo cargo. Unificar reduz o menu de cadastros e coloca piso salarial e adicionais no mesmo lugar.

## O que muda

A tela `/dp/cadastros/cargos` passa a se chamar **Cargos e Salários**, com abas:

1. **Cargos** — a lista atual (piso, insalubridade/periculosidade, base de horas, salário por unidade), sem alteração de comportamento.
2. **Adicional por Tempo de Serviço** — regras de anuênio/triênio/quinquênio por escopo (empresa, sindicato, unidade, cargo), com os modos escada e cumulativo já existentes.
3. **Salário-Família** — tabela anual (cota/teto/vigência) com o aviso de confirmação anual.
4. **Outros Adicionais** — aba nova, hoje apenas informativa: lista os adicionais legais já configurados em outros pontos (insalubridade, periculosidade, adicional noturno) com atalho para onde se configura cada um. Serve de base para, no futuro, cadastrar adicionais próprios da empresa.

A antiga tela de adicionais deixa de existir como item de menu: a rota `/dp/cadastros/adicionais` continua funcionando e redireciona para a aba correspondente da nova tela, para não quebrar links, favoritos e atalhos.

## Navegação

- Menu Cadastros: um item só, "Cargos e Salários"; o item "Adicionais e salário-família" sai.
- Hub de Cadastros: os dois cartões viram um cartão único, com a descrição cobrindo cargos, pisos e adicionais.
- Favoritos e busca de páginas passam a apontar para a tela única.
- Atalhos existentes (card de tempo de serviço na Remuneração, aviso da tabela do salário-família) apontam para a aba certa.

## Detalhes técnicos

- `src/pages/dp/DpCargos.tsx`: renomear o cabeçalho, envolver o conteúdo em `Tabs` (`DpTabsBar`, padrão do módulo) com aba controlada por query string (`?aba=cargos|tempo-servico|salario-familia|outros`) para permitir deep link e redirecionamento.
- Extrair o corpo da tela atual de adicionais em dois componentes reaproveitáveis (`TempoServicoPanel` e o já existente `SalarioFamiliaTabelaForm`) e montá-los nas abas 2 e 3; a página `src/pages/dp/cadastros/DpAdicionaisTempoServico.tsx` deixa de ser rota e é removida após a extração.
- Hooks permanecem os mesmos (`useDpAdicionaisTempoServico`, `useDpSalarioFamiliaConfig`, `useDpCargos`): nenhuma mudança de banco de dados.
- `src/App.tsx`: `cadastros/adicionais` passa a `Navigate` para `/dp/cadastros/cargos?aba=tempo-servico`.
- Atualizar `src/config/dpNavigation.tsx`, `src/pages/dp/DpCadastrosHub.tsx`, `src/components/dp/favoritablePages.ts`, `src/components/dp/AdicionalTempoServicoCard.tsx` e `src/components/dp/SalarioFamiliaTabelaDialog.tsx`.
- Títulos em Title Case ("Cargos e Salários", "Adicional Por Tempo de Serviço", "Salário-Família", "Outros Adicionais") e abas com rolagem horizontal no mobile, seguindo o padrão do módulo.
