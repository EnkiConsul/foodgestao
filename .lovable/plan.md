# Salário vindo do cargo não deve acender "Cadastro incompleto"

Hoje o selo "Cadastro incompleto" só olha o campo `salario_base` do próprio colaborador. Mas intermitentes (horistas) guardam o valor em `valor_hora` — ou nem isso, quando o salário vem do cadastro do cargo (piso do sindicato/ajuste da unidade). Resultado: intermitente com tudo certo aparece como incompleto por "falta de salário".

## O que vai mudar

1. **A regra de salário passa a entender cada tipo de pagamento** (em `src/lib/dp/cadastro-completude.ts`):
   - Mensalista → vale o `salario_base`.
   - Horista (caso dos intermitentes) → vale o `valor_hora`.
   - Diarista → vale o `valor_diaria`.
   - Sócio que recebe "somente lucros" → salário deixa de ser cobrado (não tem remuneração por desenho).
   - **Novidade:** se nenhum desses estiver preenchido, a regra olha o **salário do cargo** da pessoa na unidade dela (ajuste da unidade → piso do sindicato patronal, mesma lógica já usada no cadastro do colaborador). Se o cargo tem salário cadastrado, o salário conta como preenchido.

2. **Onde a regra é aplicada** — as quatro telas que usam a completude passam a informar o salário do cargo:
   - **Lista de Colaboradores** (selo, aba e filtro "Incompletos"): carrega os pisos de todos os cargos e o sindicato patronal de cada unidade (hooks já existentes) e resolve o salário por pessoa.
   - **Ficha de consulta do colaborador** (aviso no topo): idem, para o cargo/unidade daquela pessoa.
   - **Painel de pendências do DP** (item "Completar cadastro de…"): a consulta passa a trazer também forma de pagamento, valor-hora/diária, cargo e unidade, mais os pisos dos cargos.
   - **Conferência da importação da ficha**: o cartão da ficha também considera o salário do cargo escolhido, para não sugerir "salário" quando o cargo já cobre.

3. **Testes** (`src/test/unit/cadastroCompletude.test.ts`): intermitente com valor-hora, mensalista sem salário próprio mas com salário no cargo, diarista, sócio somente lucros, e o caso negativo (nem na ficha nem no cargo → continua incompleto).

## O que NÃO muda

- Nenhuma mudança no banco de dados — só código das telas e da regra.
- Salário continua obrigatório: quem não tem valor em lugar nenhum (nem na pessoa, nem no cargo) segue sinalizado.
- Nada muda no cálculo de folha/ponto — é só a sinalização de cadastro.

## Detalhes técnicos

- `ColaboradorCompletude` ganha `forma_pagamento`, `valor_hora`, `valor_diaria`, `base_salarial` e `socio_remuneracao`; `OpcoesCompletude` ganha `salarioCargo?: number | null` (já resolvido pelo chamador).
- Reuso de `salarioCargoNaUnidade` + `agruparPisosPorCargo` (`src/lib/dp/cargoSalarios.ts`), `useDpCargoSalarios()` e `useDpPatronalPorUnidade()` — mesma fonte de verdade do cadastro do colaborador, com `aceitarFuturo: true`.
- Na lista, o salário do cargo é resolvido uma vez por (cargo, unidade) e reutilizado entre colaboradores.
- Verificação: `bunx vitest run src/test/unit/cadastroCompletude.test.ts`, `bunx tsgo --noEmit` e conferência visual da aba "Incompletos" no preview mobile.
