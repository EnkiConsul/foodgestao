# Piso por sindicato patronal: cadastro obrigatório por cargo + patronal

## O problema

Hoje, quando a unidade não tem valor próprio, o sistema cai no "salário de referência" geral do cargo. Isso é arriscado: uma unidade com outro sindicato patronal herda silenciosamente um salário negociado por outra convenção.

## Regra nova

O salário de referência passa a ser **por cargo + sindicato patronal**, não por unidade:

1. **Cadastro obrigatório por patronal**: para cada combinação cargo + sindicato patronal existe um piso. Enquanto não houver piso cadastrado para o patronal da unidade do colaborador, o sistema **não** usa o valor geral do cargo — ele exige o cadastro (aviso bloqueante no cadastro do colaborador, com atalho para cadastrar).
2. **Unidades com o mesmo patronal (e mesmo laboral do cargo) compartilham o piso**: cadastrar uma vez vale para todas essas unidades, independentemente de quantas sejam.
3. **Override por unidade é permitido**: mesmo com laboral e patronal iguais, o usuário pode registrar um valor diferente para uma unidade específica — desde que seja **maior ou igual ao piso do patronal**. Valor abaixo do piso é recusado com mensagem explicando o mínimo.
4. **Salário geral do cargo** deixa de ser referência de cálculo. Fica apenas como sugestão de preenchimento ao cadastrar o primeiro piso, com rótulo claro de que não vale como piso.

## Ordem de resolução (fonte única)

```text
1. valor da unidade (override), se vigente
2. piso do cargo no sindicato patronal da unidade, se vigente
3. pendência: "cadastre o piso deste cargo para o patronal <nome>"
```

## Onde isso aparece

- **Cargos (`/dp/cadastros/cargos`)**: o painel atual "Salário por unidade" passa a ter duas partes — "Piso por sindicato patronal" (linha por patronal, com vigência) e, abaixo, "Ajuste por unidade" (opcional, validado contra o piso). A lista de cargos indica quantos patronais já têm piso e sinaliza cargos com patronal pendente.
- **Cadastro do colaborador (Remuneração)**: mostra de qual patronal veio o piso; quando falta piso, o campo não trava, exibe alerta e oferece cadastrar na hora. Trocar a unidade recalcula pelo patronal dela.
- **Enquadramento sindical**: exibe laboral (cargo) + patronal (unidade) e qual piso está sendo aplicado.
- **Negociações sindicais**: a aplicação em lote passa a gravar o piso do **patronal** da negociação (atingindo todas as unidades dele), e não um valor por unidade.
- **Folha, provisões e rescisão**: usam a mesma resolução; colaboradores sem piso do patronal entram como pendência de remuneração em vez de calcular com valor herdado.

## Detalhes técnicos

- Migração em `dp_cargo_salarios`: `unidade_id` passa a ser nullable e entra `sindicato_patronal_id` como chave da linha de piso. Linha com `unidade_id NULL` = piso do patronal; com `unidade_id` preenchido = override da unidade. Índices únicos parciais separados para (cargo, patronal, vigência aberta) e (cargo, unidade, vigência aberta); check garantindo que ao menos um dos dois esteja preenchido. Dados atuais migram como override de unidade, com `sindicato_patronal_id` preenchido a partir de `dp_sindicato_unidades`.
- `src/lib/dp/cargoSalarios.ts`: `salarioCargoNaUnidade` recebe também o patronal da unidade e retorna `origem: "unidade" | "patronal" | "pendente"`, mais `pisoPatronal` para validar o override. Nova função `validarOverrideUnidade(valor, pisoPatronal)`. O fallback para `dp_cargos.salario_base` sai da resolução.
- `src/lib/dp/cargoSalariosQuery.ts` e `carregarPisosPorCargo`: passam a carregar o mapa unidade → patronal (`dp_sindicato_unidades`) e agrupar pisos por patronal.
- Componentes/hooks a ajustar: `CargoSalariosUnidadePanel.tsx`, `DpCargos.tsx`, `ColaboradorFormDialog.tsx`, `RemuneracaoFields.tsx`, `AplicarPisoUnidadeDialog.tsx`, `DpSindicatoNegociacoes.tsx`, `useDpCadastros.tsx`, `useDpFolhaApuracao.tsx`, `useDpProvisoes.tsx`, `useDpRescisao.tsx`.
- Testes em `src/lib/dp/__tests__/cargoSalarios.test.ts`: compartilhamento entre unidades do mesmo patronal, pendência quando falta piso, override aceito acima do piso e recusado abaixo, vigências.

## Ponto a confirmar

Unidade sem sindicato patronal vinculado: tratar como pendência (exige vincular o patronal antes de definir salário) — é o comportamento assumido aqui.
