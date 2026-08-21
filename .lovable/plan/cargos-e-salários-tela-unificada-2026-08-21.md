# Cargos e Salários — Tela Unificada

Faz sentido, sim. Hoje "Cargos" e "Adicionais e Salário-Família" são telas separadas, mas tratam do mesmo assunto: quanto o colaborador recebe pelo cargo. Unificar reduz o menu de cadastros e coloca piso salarial e adicionais no mesmo lugar.

Sobre o nome: "Adicionais" é vago. Como cada empresa usa um conjunto diferente (a Pakerê usa tempo de serviço e salário-família; outra pode não usar nenhum dos dois), o melhor é **uma aba única chamada "Complementos Salariais"** — termo que cobre adicionais legais (tempo de serviço, insalubridade, periculosidade, noturno) e vantagens como salário-família e prêmio de assiduidade, sem prometer que todos existem.

## O que muda

A tela `/dp/cadastros/cargos` passa a se chamar **Cargos e Salários**, com duas abas:

1. **Cargos** — a lista atual (piso, insalubridade/periculosidade, base de horas, salário por unidade), sem alteração de comportamento.
2. **Complementos Salariais** — uma aba única, em cards, um por tipo de complemento:
   - **Adicional por Tempo de Serviço** — regras de anuênio/triênio/quinquênio por escopo (empresa, sindicato, unidade, cargo), nos modos escada e cumulativo já existentes.
   - **Salário-Família** — tabela anual (cota/teto/vigência) com o aviso de confirmação anual.
   - **Insalubridade** e **Periculosidade** — percentual padrão por cargo, editável aqui, com a lista de cargos que já têm o percentual definido.
   - **Prêmio de Assiduidade** — padrão da empresa (tipo, valor, critério, tolerância, limites de atraso/atestado), o mesmo padrão que hoje é aplicado na remuneração.
   - **Adicional Noturno** — card informativo com o percentual legal e atalho para a jornada, que é onde o horário noturno é definido.

### Centralização sem perder o cadastro no colaborador

Sim, esses complementos passam a ter um ponto central de configuração — mas o cadastro na ficha do colaborador permanece, ligado ao mesmo dado:

- Nesta tela o admin define o **padrão** (por empresa, unidade ou cargo).
- Na ficha do colaborador o admin continua vendo e editando os mesmos campos; ao alterar, o sistema pergunta se é **exceção do colaborador** ou **novo padrão** (cargo/unidade/empresa), exatamente como já funciona para os vales.
- Quando o valor vem do padrão, o campo na ficha mostra a origem ("padrão do cargo ATENDENTE") com atalho para esta tela; quando é exceção, mostra o selo de exceção e o botão de voltar ao padrão.

Cada card tem também um botão para **ativar/desativar o complemento para a empresa**. Empresa que não usa tempo de serviço ou salário-família desliga o card: ele fica recolhido no fim da aba, em "Não utilizados nesta empresa", e o complemento deixa de aparecer na Remuneração e nos cálculos do colaborador. Nada é apagado — reativar traz a configuração de volta.

A antiga rota `/dp/cadastros/adicionais` continua funcionando e redireciona para a aba Complementos Salariais, para não quebrar links, favoritos e atalhos.

## Navegação

- Menu Cadastros: um item só, "Cargos e Salários"; o item "Adicionais e salário-família" sai.
- Hub de Cadastros: os dois cartões viram um cartão único, cobrindo cargos, pisos e complementos.
- Favoritos e busca de páginas passam a apontar para a tela única.
- Atalhos existentes (card de tempo de serviço na Remuneração, aviso da tabela do salário-família) apontam para a aba certa.

## Detalhes técnicos

- `src/pages/dp/DpCargos.tsx`: renomear o cabeçalho e envolver o conteúdo em `Tabs` (`DpTabsBar`, padrão do módulo), com aba controlada por query string (`?aba=cargos|complementos`) para permitir deep link e redirecionamento.
- Extrair o corpo da tela atual de adicionais em componentes reaproveitáveis (`TempoServicoCard` e o já existente `SalarioFamiliaTabelaForm`) e montá-los como cards da aba Complementos; a página `src/pages/dp/cadastros/DpAdicionaisTempoServico.tsx` deixa de ser rota e é removida após a extração.
- Sem duplicar dados: insalubridade/periculosidade continuam em `dp_cargos.insalubridade_percentual` / `periculosidade_percentual` (com override em `dp_colaboradores`), e a assiduidade continua no padrão `dp_beneficios_padroes` + campos do colaborador. Os cards desta tela editam exatamente essas fontes, reaproveitando `usePropagarRiscosCargo` e o diálogo de "aplicar padrão" já existentes.
- Ativação por empresa: colunas booleanas em `dp_config_dp` (`tempo_servico_ativo` já existe como `adicional_tempo_servico_ativo`; acrescentar `salario_familia_ativo` e `assiduidade_ativa`, default `true` para não mudar o comportamento atual), lidas por um helper `complementosAtivos()` usado na aba, na Remuneração e nos cálculos (`tempoServico.ts`, `salarioFamilia.ts`) — quando desligado, o complemento retorna zero e não é exibido.
- Demais hooks permanecem os mesmos (`useDpAdicionaisTempoServico`, `useDpSalarioFamiliaConfig`, `useDpCargos`).
- `src/App.tsx`: `cadastros/adicionais` passa a `Navigate` para `/dp/cadastros/cargos?aba=complementos`.
- Atualizar `src/config/dpNavigation.tsx`, `src/pages/dp/DpCadastrosHub.tsx`, `src/components/dp/favoritablePages.ts`, `src/components/dp/AdicionalTempoServicoCard.tsx`, `src/components/dp/RemuneracaoFields.tsx` (indicação de origem + atalhos) e `src/components/dp/SalarioFamiliaTabelaDialog.tsx`.
- Títulos em Title Case ("Cargos e Salários", "Complementos Salariais") e abas com rolagem horizontal no mobile, seguindo o padrão do módulo.
