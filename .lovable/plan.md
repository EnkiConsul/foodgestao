# Salário do cargo por unidade (negociação patronal)

## Problema

Hoje o cargo tem um único salário de referência (`dp_cargos.salario_base`), válido para toda a empresa. Como o sindicato patronal é vinculado à unidade (`dp_sindicato_unidades`) e o laboral ao cargo (`dp_sindicato_cargos`), dois colaboradores no mesmo cargo em unidades diferentes acabam travados no mesmo salário — mesmo quando as convenções patronais definem pisos diferentes.

## O que vamos fazer

Passar a tratar o salário do cargo como **salário por cargo + unidade**, mantendo o valor geral do cargo apenas como padrão quando a unidade não tem valor próprio.

1. **Piso por unidade**: nova tabela de salários do cargo por unidade, com vigência (início/fim opcional) e observação. Cada linha guarda o sindicato patronal da unidade no momento do registro, apenas como informação de origem.
2. **Regra de resolução do salário de referência** (fonte única, em `src/lib/dp/cargos.ts`):
   - salário do cargo naquela unidade vigente na data → senão
   - salário geral do cargo → senão
   - sem referência (colaborador informa manualmente).
3. **Cadastro de Cargos (`/dp/cadastros/cargos`)**: na ficha do cargo, tabela "Salário por unidade" para adicionar/editar/encerrar valores por unidade, mostrando o sindicato patronal de cada unidade e o laboral do cargo. A lista de cargos passa a mostrar "por unidade" quando houver mais de um valor, em vez de um valor único.
4. **Cadastro do colaborador (aba Remuneração)**: o salário travado pelo cargo passa a usar o valor da **unidade do colaborador**; o texto explicativo cita cargo + unidade. Trocar a unidade recalcula o valor travado. Quando o cargo tem valores diferentes por unidade e a unidade ainda não tem piso, o campo não é travado e mostra aviso para cadastrar o piso da unidade.
5. **Enquadramento sindical**: o bloco do colaborador passa a exibir que o piso vem da unidade/patronal, deixando claro que o mesmo laboral não implica o mesmo salário.
6. **Folha, provisões e rescisão**: os cálculos que hoje leem `dp_cargos.salario_base` passam a usar a resolução por unidade do colaborador (data de referência = competência/desligamento).

## Detalhes técnicos

- Migração: `dp_cargo_salarios` (`id`, `company_id`, `cargo_id`, `unidade_id`, `salario_base numeric`, `vigencia_inicio date`, `vigencia_fim date null`, `sindicato_patronal_id null`, `observacao`, timestamps), índice único parcial por cargo+unidade+vigência aberta, GRANTs para `authenticated`/`service_role`, RLS por empresa no mesmo padrão das demais tabelas DP.
- `src/lib/dp/cargos.ts`: novas funções puras `salarioCargoNaUnidade(pisos, unidadeId, data)` e ajuste de `salarioReferencia`/`compararSalarioCargo` para receber o valor já resolvido; testes em `src/lib/dp/__tests__/cargos.test.ts` cobrindo precedência, vigência e ausência de piso.
- Novo hook `useDpCargoSalarios(cargoId)` (leitura + mutações) seguindo o padrão de `useDpCadastros`.
- Consumidores atualizados: `RemuneracaoFields.tsx`, `ColaboradorFormDialog.tsx` (`salarioCargo` resolvido por unidade), `ColaboradorFichaDialog.tsx`, `DpCargos.tsx`, `useDpFolhaApuracao.tsx`, `useDpProvisoes.tsx`, `useDpRescisao.tsx`.
- Compatibilidade: nenhum dado existente muda — cargos sem piso por unidade continuam usando `dp_cargos.salario_base`.
