# Regras de folgas — tudo por unidade, ordem e nomes mais claros

## 1. "Regras das Folgas" vira "Particularidade de Folgas" e muda de lugar

O bloco sai de cima (hoje entre os dias de descanso e a frequência dominical) e passa a ficar **abaixo do quadro "Frequência da Folga Dominical (DSR)"**, com o novo título **"Particularidade de Folgas"** e um texto curto explicando que ali ficam as travas do dia a dia: quantidade de pessoas por dia, limite por cargo e pessoas que não podem folgar no mesmo dia.

## 2. Toda a tela passa a ser por unidade, com replicação

Fim da mistura "metade empresa, metade unidade": a unidade escolhida no topo vale para **tudo** na tela.

- Em "Particularidade de Folgas" sai a opção "Vale para: toda a empresa". A regra é sempre da unidade que está sendo editada, e a lista mostra apenas as regras dessa unidade.
- Cada regra ganha a ação **"Replicar para outras unidades"**: o gestor marca as unidades que devem receber uma cópia da mesma regra e confirma. As cópias passam a existir de forma independente (editar uma depois não altera as outras), e o resultado é informado ("Regra copiada para 2 unidades").
- Regras antigas que estavam salvas no nível empresa passam a valer, na prática, para todas as unidades: elas são convertidas em uma regra por unidade, mantendo tipo, dia, limite, cargos, pessoas e vigência.
- O cabeçalho da tela diz de forma direta que todas as configurações abaixo pertencem à unidade selecionada e que, ao salvar, é possível aplicar as mesmas regras em outras unidades (comportamento que já existe para o descanso/DSR).

## 3. Frequência deixa de falar só em "domingo" quando o sábado foi negociado

Quando em "Dias de descanso negociados" houver sábado (ou outro dia além do domingo), os rótulos do bloco de frequência passam a falar em folga de fim de semana / dia de descanso:

- Título: "Frequência da Folga de Descanso (DSR)" quando houver mais dias negociados; segue "Frequência da Folga Dominical (DSR)" no padrão CLT/só domingo.
- "Domingos de folga por mês" → "Folgas de fim de semana por mês"; "Domingo de folga a cada (semanas)" → "Folga de descanso a cada (semanas)"; o mesmo nos campos de mulheres, mantendo a menção ao Art. 386.
- Uma linha explicativa lista os dias negociados atuais ("Considera sábado e domingo"), para deixar claro que a quantidade escolhida vale entre esses dias.

Nada muda no cálculo nem nos dados gravados de DSR — apenas os textos refletem os dias negociados.

## Detalhes técnicos

Banco (migração nova):
- `dp_folga_limite_regras`: expandir as linhas com `unidade_id IS NULL` em uma linha por unidade da empresa (copiando vínculos de `dp_folga_limite_regra_cargos` e `dp_folga_limite_regra_colaboradores`) e remover as linhas de escopo empresa; depois `ALTER COLUMN unidade_id SET NOT NULL`. Empresas sem unidade cadastrada mantêm a linha atual (sem NOT NULL possível → aplicar o NOT NULL só se não houver órfãs; caso haja, criar a unidade não é responsabilidade desta tela: nesse caso as linhas remanescentes são desativadas e reportadas na descrição da migração).
- `dp_folga_limite_dia` e `dp_folga_conflito_colaboradores` deixam de considerar o fallback de empresa (`unidade_id IS NULL`) e passam a casar só pela unidade recebida.

Frontend:
- `src/pages/dp/cadastros/DpConfiguracoesJornada.tsx`: mover `<FolgaRegrasPanel />` (com `Separator`) para depois do `SubSection` "Frequência Da Folga Dominical (DSR)"; passar `unidadeId`/`unidades` ao painel; derivar `apenasDomingo` de `form.dias_descanso_negociados` + `baseRegra` para escolher os rótulos do bloco de frequência (constantes locais, sem mudar `set()`/payload); textos de escopo no cabeçalho.
- `src/components/dp/folgas/FolgaRegrasPanel.tsx`: título "Particularidade de Folgas"; remover o campo "Vale para" e gravar sempre `unidade_id` da unidade ativa; filtrar a lista por essa unidade; nova ação por regra abrindo um diálogo de replicação (checkboxes de unidades + "selecionar todas").
- `src/hooks/useDpFolgaLimites.tsx`: aceitar `unidadeId` como escopo da leitura e da gravação e nova mutation `replicar({ id, unidadeIds })` que insere cópias da regra e dos vínculos.
- `src/lib/dp/folga-limites.ts`: `resolverLimiteFolga` deixa de tratar regra de empresa como fallback; `resumoRegra` sem menção a "toda a empresa".
- Sem `as any`; tipos regenerados após a migração.

Verificação: `bunx tsgo --noEmit -p tsconfig.app.json`, `bunx vitest run src/test/unit/folgaLimites.test.ts src/test/unit/folgaJanela.test.ts` (incluindo casos novos: sem fallback de empresa e replicação) e `bunx eslint` nos arquivos alterados.
