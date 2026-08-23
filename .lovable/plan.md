# Sexo no Cadastro + Aba "Horário" com Regra de Folga Dominical

## Contexto verificado

- A coluna `sexo` já existe em `dp_colaboradores` (valores permitidos `F`, `M`, `outro`), mas **não** há campo para preenchê-la no cadastro do colaborador (`ColaboradorFormDialog.tsx`).
- O motor de DSR (`src/lib/dp/dsr-rules.ts`) já usa `sexo === "F"` para aplicar a frequência específica de mulheres (Art. 386 CLT / negociação coletiva) — Conformidade DSR, Escalas, Portal e calculadora de vales leem esse campo. Hoje ele fica vazio, então todo mundo cai na regra geral.
- A aba se chama "Horário de Trabalho" e não menciona a regra dominical; a regra vive em Folgas > Regras (`/dp/folgas?aba=regras`).

## O que será feito

### 1. Campo Sexo na aba Dados
- Novo select **Sexo** (Feminino / Masculino / Outro / Não informado) ao lado de Data de Nascimento.
- Salvo em `dp_colaboradores.sexo` e carregado na edição.
- Sem obrigatoriedade bloqueante: se estiver vazio e o vínculo for CLT, aparece um aviso leve na aba Dados explicando que sem o sexo o sistema aplica a regra geral de folga dominical.
- Exibir o dado também na ficha resumo do colaborador.

### 2. Renomear a aba para "Horário"
- Título da aba e textos que citam "Horário de Trabalho" nas telas do colaborador passam a "Horário" (rota e dados não mudam).

### 3. Bloco de folga dominical na aba Horário
Novo painel informativo, logo abaixo dos dias da semana, mostrando a regra efetiva da unidade do colaborador:
- Base do descanso (legal ou acordo/convenção coletiva) e dias negociados.
- Domingos de folga por mês exigidos para **este** colaborador — usando a regra de mulheres quando `sexo = F`, e a geral nos demais casos.
- Aviso quando os domingos previstos no horário habitual não atingem o mínimo da regra, ou quando o sexo não está informado (regra feminina não avaliada).
- Texto explícito: "A folga dominical é definida na tela Folgas; o sindicato pode alterar essa frequência."
- Botão/atalho **Ver regras de folgas** abrindo `/dp/folgas?aba=regras` (nova aba, para não perder o cadastro em edição).

## Detalhes técnicos

- `ColaboradorFormDialog.tsx`: novo campo no estado do form (`sexo`), no mapeamento de carga (`c.sexo`) e no payload de insert/update; rótulo da aba `jornada` → "Horário".
- `ColaboradorJornadaPanel.tsx`: recebe `sexo` e `unidadeId` por prop; usa `useDpRegrasColaborador(companyId, unidadeId, sexo)` (já existente) + `tetoFolgasMes`/`resumoEscolhaFolgas` de `dsr-rules.ts` para montar o bloco. Nenhuma nova regra de cálculo é criada — apenas leitura das funções atuais.
- `ColaboradorFichaDialog.tsx`: linha "Sexo" no card de dados.
- Sem migração de banco: a coluna e o check constraint já existem.
