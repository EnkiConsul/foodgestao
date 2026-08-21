# Cargos e Salários — Tela Unificada

Faz sentido, sim. Hoje "Cargos" e "Adicionais e Salário-Família" são telas separadas, mas tratam do mesmo assunto: quanto o colaborador recebe pelo cargo. Unificar reduz o menu de cadastros e coloca piso salarial e adicionais no mesmo lugar.

Sobre o nome: "Adicionais" é vago. Como cada empresa usa um conjunto diferente (a Pakerê usa tempo de serviço e salário-família; outra pode não usar nenhum dos dois), o melhor é **uma aba única chamada "Complementos Salariais"** — termo que cobre adicionais legais (tempo de serviço, insalubridade, periculosidade, noturno) e vantagens como salário-família, sem prometer que todos existem.

## O que muda

A tela `/dp/cadastros/cargos` passa a se chamar **Cargos e Salários**, com duas abas:

1. **Cargos** — a lista atual (piso, insalubridade/periculosidade, base de horas, salário por unidade), sem alteração de comportamento.
2. **Complementos Salariais** — uma aba única, em cards, um por tipo de complemento:
   - **Adicional por Tempo de Serviço** — regras de anuênio/triênio/quinquênio por escopo (empresa, sindicato, unidade, cargo), nos modos escada e cumulativo já existentes.
   - **Salário-Família** — tabela anual (cota/teto/vigência) com o aviso de confirmação anual.
   - **Insalubridade, Periculosidade e Adicional Noturno** — cards de leitura, mostrando o que já está configurado no cargo/jornada, com atalho para o lugar de edição.

Cada card tem um botão para **ativar/desativar o complemento para a empresa**. Empresa que não usa tempo de serviço ou salário-família desliga o card: ele fica recolhido no fim da aba, em "Não utilizados nesta empresa", e o complemento deixa de aparecer na Remuneração e nos cálculos do colaborador. Nada é apagado — reativar traz a configuração de volta.

A antiga rota `/dp/cadastros/adicionais` continua funcionando e redireciona para a aba Complementos Salariais, para não quebrar links, favoritos e atalhos.

## Navegação

- Menu Cadastros: um item só, "Cargos e Salários"; o item "Adicionais e salário-família" sai.
- Hub de Cadastros: os dois cartões viram um cartão único, cobrindo cargos, pisos e complementos.
- Favoritos e busca de páginas passam a apontar para a tela única.
- Atalhos existentes (card de tempo de serviço na Remuneração, aviso da tabela do salário-família) apontam para a aba certa.

## Detalhes técnicos

- `src/pages/dp/DpCargos.tsx`: renomear o cabeçalho e envolver o conteúdo em `Tabs` (`DpTabsBar`, padrão do módulo), com aba controlada por query string (`?aba=cargos|complementos`) para permitir deep link e redirecionamento.
- Extrair o corpo da tela atual de adicionais em componentes reaproveitáveis (`TempoServicoCard` e o já existente `SalarioFamiliaTabelaForm`) e montá-los como cards da aba Complementos; a página `src/pages/dp/cadastros/DpAdicionaisTempoServico.tsx` deixa de ser rota e é removida após a extração.
- Ativação por empresa: duas colunas booleanas em `dp_config_dp` (`tempo_servico_ativo`, `salario_familia_ativo`, default `true` para não mudar o comportamento atual), lidas por um helper `complementosAtivos()` usado tanto na aba quanto na Remuneração e nos cálculos (`tempoServico.ts`, `salarioFamilia.ts`) — quando desligado, o complemento retorna zero e não é exibido.
- Demais hooks permanecem os mesmos (`useDpAdicionaisTempoServico`, `useDpSalarioFamiliaConfig`, `useDpCargos`).
- `src/App.tsx`: `cadastros/adicionais` passa a `Navigate` para `/dp/cadastros/cargos?aba=complementos`.
- Atualizar `src/config/dpNavigation.tsx`, `src/pages/dp/DpCadastrosHub.tsx`, `src/components/dp/favoritablePages.ts`, `src/components/dp/AdicionalTempoServicoCard.tsx` e `src/components/dp/SalarioFamiliaTabelaDialog.tsx`.
- Títulos em Title Case ("Cargos e Salários", "Complementos Salariais") e abas com rolagem horizontal no mobile, seguindo o padrão do módulo.
