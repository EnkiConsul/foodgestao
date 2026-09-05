# Regras de folgas — ordem, nomes e escopo mais claros

## 1. "Regras das Folgas" vira "Particularidade de Folgas" e muda de lugar

O bloco sai de cima (hoje entre os dias de descanso e a frequência dominical) e passa a ficar **abaixo do quadro "Frequência da Folga Dominical (DSR)"**, com o novo título **"Particularidade de Folgas"** e texto de apoio explicando que ali ficam as travas do dia a dia (quantidade por dia, limite por cargo e pessoas que não folgam juntas).

O título também é atualizado onde o nome aparecer em avisos e mensagens da própria tela.

## 2. Deixar claro o que é da unidade e o que é da empresa

Hoje o topo diz "estou configurando a unidade Pakerê Garavelo", mas dentro da tela há campos que valem para a empresa inteira — daí a confusão. Ajustes só de apresentação:

- No cabeçalho do cadastro, o texto passa a dizer que a unidade selecionada vale para o **descanso dominical e a frequência de DSR**, e que blocos com escopo próprio indicam isso no próprio bloco.
- Em "Particularidade de Folgas", cada regra ganha um selo visível de escopo: **"Toda a empresa"** ou o nome da unidade. O campo "Vale para" continua permitindo os dois, mas já vem pré-selecionado com a unidade que está sendo editada, e um texto curto avisa: "Esta regra vale para toda a empresa" quando o gestor escolher empresa.
- A lista ganha um filtro rápido "Todas / Desta unidade / Da empresa", para o gestor ver sem esforço o que é geral e o que é local.
- No quadro "Frequência da Folga Dominical (DSR)", um aviso curto informa que essa frequência é da unidade selecionada e que ao salvar pode ser replicada para outras unidades (como já acontece hoje).

## 3. Frequência deixa de falar só em "domingo" quando o sábado foi negociado

Quando em "Dias de descanso negociados" houver sábado (ou qualquer dia além do domingo), os rótulos do bloco de frequência passam a falar em **folga de fim de semana / dia de descanso**, e não em domingo:

- Título: "Frequência da Folga de Descanso (DSR)" quando houver mais dias negociados; segue "Frequência da Folga Dominical (DSR)" no padrão CLT/só domingo.
- "Domingos de folga por mês" → "Folgas de fim de semana por mês"; "Domingo de folga a cada (semanas)" → "Folga de descanso a cada (semanas)"; o mesmo para os campos de mulheres, mantendo a menção ao Art. 386.
- Uma linha explicativa lista os dias negociados atuais ("Considera sábado e domingo"), para o gestor entender que a quantidade escolhida vale entre esses dias.

Nada muda no cálculo nem nos dados gravados — apenas os textos passam a refletir os dias que a empresa negociou.

## Detalhes técnicos

- `src/pages/dp/cadastros/DpConfiguracoesJornada.tsx`: mover `<FolgaRegrasPanel />` (com seus `Separator`) para depois do `SubSection` "Frequência Da Folga Dominical (DSR)"; derivar `apenasDomingo` de `form.dias_descanso_negociados` + `baseRegra` e usar para escolher os rótulos do bloco de frequência (constantes locais, sem mudar `set()`/payload); textos de escopo no cabeçalho e no bloco de DSR.
- `src/components/dp/folgas/FolgaRegrasPanel.tsx`: prop opcional `unidadePadraoId` (passada pela tela) usada como valor inicial de `unidade_id` no formulário; badge de escopo em cada item da lista; filtro de escopo (estado local) somado ao filtro de tipo existente; título "Particularidade de Folgas".
- Sem alterações de banco, RPC, permissões ou lógica de validação de folgas.
- Verificação: `bunx tsgo --noEmit -p tsconfig.app.json`, `bunx vitest run src/test/unit/folgaLimites.test.ts src/test/unit/folgaJanela.test.ts` e `bunx eslint` nos dois arquivos.
