# Valor do salário ao lado do cargo na ficha do colaborador

## O que está acontecendo

Na ficha da Hanna, a lista de cargos mostra "PIZZAIOLO" sem valor, mas mostra "ATENDENTE — R$ 1.750,00" e "MOTOQUEIRO — R$ 1.750,00".

Motivo confirmado nos dados: essa lista lê um campo antigo de salário gravado no próprio cargo. Atendente e Motoqueiro têm esse campo antigo preenchido (herança do modelo anterior); Pizzaiolo não tem. O salário do Pizzaiolo existe e está correto no lugar novo — piso de R$ 1.750,00 do sindicato patronal SINDTUR, vigente desde 18/11/2025, e a unidade da Hanna está vinculada ao SINDTUR. Ou seja: o vínculo existe, a lista só está olhando para a fonte errada.

## O que vai mudar

1. A lista de cargos da ficha passa a exibir o salário resolvido pela regra oficial: ajuste da unidade do colaborador, senão piso do sindicato patronal daquela unidade, considerando a data de admissão.
   - Pizzaiolo passa a aparecer como "PIZZAIOLO — R$ 1.750,00".
2. Quando o cargo não tem piso para o patronal da unidade escolhida, em vez de aparecer sem nada, aparece a indicação "piso a cadastrar" — assim fica claro que falta cadastro, e não que o cargo é sem salário.
3. Enquanto nenhuma unidade estiver selecionada, o cargo mostra a faixa de pisos cadastrados (ex.: "R$ 1.750,00" ou "R$ 1.750,00 a R$ 1.900,00"), igual à lista da tela de Cargos.
4. O campo antigo de salário do cargo deixa de ser usado para exibir valor em qualquer tela, para não voltar a mostrar dois números diferentes para o mesmo cargo. Nada é apagado do banco.

Nenhuma regra de cálculo de folha, piso mínimo ou travas de compliance muda: continua valendo piso do patronal como mínimo e ajuste por unidade só acima dele.

## Detalhes técnicos

- `src/components/dp/ColaboradorFormDialog.tsx` (lista de cargos, linhas ~1283-1291): trocar `salarioReferencia(c)` por um rótulo derivado dos pisos.
  - Carregar os pisos de todos os cargos da empresa uma única vez com `useDpCargoSalarios()` (sem `cargoId`) e agrupar por `cargo_id`.
  - Para cada opção, resolver com `salarioCargoNaUnidade(linhasDoCargo, form.unidade_id, patronalUnidade?.id, form.data_admissao, { aceitarFuturo: true })` — mesma chamada já usada em `refSalario`, garantindo que o rótulo e o bloco de enquadramento nunca divirjam.
  - Sem unidade selecionada: calcular min/max das linhas vigentes (`pisoVigente`) e formatar com `moedaBR`, no mesmo formato de `salarioResumo` em `src/pages/dp/DpCargos.tsx`.
  - Sem piso resolvido: sufixo textual discreto "— piso a cadastrar".
- Extrair o formatador para `src/lib/dp/cargoSalarios.ts` (ex.: `rotuloSalarioCargo`) para que `DpCargos.tsx` e a ficha compartilhem a mesma função, com testes unitários em `src/lib/dp/__tests__/cargoSalarios.test.ts` cobrindo: piso único, faixa por patronais distintos, ajuste da unidade acima do piso, piso futuro aceito pela admissão e ausência de piso.
- `salarioReferencia` em `src/lib/dp/cargos.ts` continua existindo para a comparação "um cargo = um salário", que já recebe o valor resolvido via `cargoParaComparacao`; remover apenas seu uso como fonte de exibição.
- Verificação: `bunx vitest run src/lib/dp/__tests__` e conferência no preview abrindo a ficha da Hanna (unidade vinculada ao SINDTUR) para ver "PIZZAIOLO — R$ 1.750,00".
