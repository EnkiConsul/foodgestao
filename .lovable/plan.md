# Escolher quais regras replicar no padrão de benefícios

Hoje o padrão é tudo-ou-nada: ao salvar como padrão de cargo/unidade/empresa, todos os itens de assiduidade, vale-alimentação, vale-transporte e ficha de benefícios vão juntos. A melhoria é deixar o usuário marcar exatamente o que quer replicar, tanto para "somente novos cadastros" quanto para "todos os colaboradores do alcance".

## Como fica na tela

No diálogo "Usar como padrão?", abaixo do alcance (novos / todos), aparece um bloco **"O que replicar?"** com grupos marcáveis:

- **Prêmio de assiduidade** — liga/desliga, valor, tipo (valor ou %), critério, tolerância em minutos, máximo de atrasos, atestado conta e máximo de atestados
- **Vale-alimentação** — liga/desliga, valor, periodicidade, dias base, origem dos dias e desconto
- **Vale-transporte** — liga/desliga e valor por dia
- **Ficha de benefícios** — os benefícios marcados na aba Remuneração

Regras da interface:

- Todos vêm marcados por padrão (comportamento atual, sem surpresa).
- Cada grupo mostra um resumo curto do que será gravado (ex.: "Prêmio 11% • sem faltas • 3 atrasos") e um selo "diferente do padrão atual" quando o grupo divergir do padrão de referência.
- Desmarcar todos os grupos desabilita o botão de salvar padrão.
- O texto do alcance "Todos" passa a citar só os grupos marcados, para o usuário saber exatamente o que será sobrescrito.

## Comportamento ao salvar

- O padrão gravado no banco passa a ser um merge: parte-se do padrão existente naquele escopo e sobrescrevem-se somente os campos dos grupos marcados. Assim é possível, por exemplo, atualizar só a regra de atrasos da empresa sem mexer no vale-alimentação já padronizado.
- Se não houver padrão anterior naquele escopo, os grupos não marcados ficam de fora do payload (não viram zeros).
- Com alcance "todos", a atualização em massa em `dp_colaboradores` envia apenas as colunas dos grupos marcados; os demais campos de cada colaborador ficam intactos.
- A ficha de benefícios (`dp_colaborador_beneficios`) só é sincronizada se o grupo "Ficha de benefícios" estiver marcado.
- A limpeza de padrões mais específicos em conflito continua acontecendo apenas no alcance "todos".

## Detalhes técnicos

- `src/lib/dp/beneficiosPadrao.ts`: novo tipo `GrupoPadrao` (`assiduidade` | `vale_alimentacao` | `vale_transporte` | `beneficios`) e mapa `CAMPOS_POR_GRUPO` derivado de `CAMPOS_PADRAO`; helpers `filtrarPadraoPorGrupos(payload, grupos)`, `mesclarPadrao(base, novo, grupos)`, `gruposComDiferenca(atual, referencia)` e `resumoGrupo(payload, grupo)`. `padraoParaColunasColaborador` recebe um segundo parâmetro opcional `grupos` e retorna só as colunas correspondentes.
- `src/hooks/useDpBeneficiosPadrao.tsx`: a mutation recebe `grupos: GrupoPadrao[]`; faz o merge com o payload existente antes do upsert, aplica `padraoParaColunasColaborador(payload, grupos)` no update em massa e pula o bloco da ficha de benefícios quando o grupo não estiver marcado.
- `src/components/dp/ColaboradorFormDialog.tsx`: estado `gruposPadrao` (todos marcados ao abrir o diálogo), lista de checkboxes com resumo e selo de diferença, botão de salvar desabilitado sem grupos, e envio de `grupos` na mutation. O `padraoRespondidoRef`/assinatura continuam evitando perguntas repetidas.
- Testes unitários em `src/test/unit/beneficiosPadrao.test.ts` para `filtrarPadraoPorGrupos`, `mesclarPadrao` e `padraoParaColunasColaborador` com subconjunto de grupos; typecheck ao final.
