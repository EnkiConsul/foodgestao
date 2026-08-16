# Salário base por unidade: como usar e onde melhorar

## Como usar hoje (já existe)

O piso por unidade **não fica no diálogo "Editar Cargo"** — ele está na ficha do cargo:

1. Em `/dp/cadastros/cargos`, **clique na linha do cargo** (não no lápis).
2. Abre a ficha do cargo, com o bloco **"Salário por unidade"**.
3. Escolha a **Unidade**, informe o **Salário** e a **Vigência** e clique em **Adicionar**.
4. Cada unidade listada mostra o valor e a data de início; a lixeira remove o piso daquela unidade.
5. Unidade sem valor próprio usa o **Salário de referência** do cargo (o campo do "Editar Cargo").

No cadastro do colaborador, o salário travado passa a ser o piso da **unidade dele**. Se o cargo tem piso em outra unidade mas não na dele, o campo não trava e aparece aviso para cadastrar o piso daquela unidade.

Reajuste em lote: em `/dp/cadastros/sindicatos` → negociações, a ação "Aplicar aos cargos desta unidade" grava os pisos por unidade (percentual ou valor fixo).

## O que vamos ajustar (descobribilidade)

O problema é só de visibilidade — quem entra pelo lápis não encontra a configuração.

1. **Editar Cargo**: renomear o campo atual para "Salário de referência (padrão da empresa)" e, ao editar um cargo existente, incluir o mesmo bloco "Salário por unidade" abaixo dele, com o texto explicando que o valor da unidade prevalece.
2. **Lista de cargos**: quando o cargo tiver pisos por unidade, mostrar "por unidade" (com dica do intervalo mín–máx) em vez de só o valor único, e um badge discreto na ficha.
3. **Ajuda inline**: uma linha curta no topo da tela de cargos indicando que pisos diferentes por unidade são configurados na ficha/edição do cargo.

## Detalhes técnicos

- Reutilizar `src/components/dp/CargoSalariosUnidadePanel.tsx` dentro do diálogo de edição em `src/pages/dp/DpCargos.tsx` (renderizar apenas quando `editing` existir, pois o painel precisa de `cargoId`).
- Resumo na lista via `useDpCargoSalarios()` (todos os pisos da empresa) + `pisoVigente` de `src/lib/dp/cargoSalarios.ts`, sem novas consultas por linha.
- Nenhuma mudança de banco, de regra de resolução salarial ou de folha.
