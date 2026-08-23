# Gênero no Cadastro + Aba "Horário" com Regra de Folga Dominical

## Contexto verificado

- A coluna `sexo` já existe em `dp_colaboradores` (valores permitidos `F`, `M`, `outro`), mas **não** há campo para preenchê-la no cadastro do colaborador (`ColaboradorFormDialog.tsx`).
- O motor de DSR (`src/lib/dp/dsr-rules.ts`) já usa `sexo === "F"` para aplicar a frequência específica de mulheres (Art. 386 CLT / negociação coletiva) — Conformidade DSR, Escalas, Portal e calculadora de vales leem esse campo. Hoje ele fica vazio, então todo mundo cai na regra geral.
- A aba se chama "Horário de Trabalho" e não menciona a regra dominical; a regra vive em Folgas > Regras (`/dp/folgas?aba=regras`).

## O que será feito

### 1. Campo Gênero na aba Dados
- Novo select **Gênero** (Feminino / Masculino / Outro / Prefiro não informar) ao lado de Data de Nascimento, gravado em `dp_colaboradores.sexo`.
- **Quando o gênero for diferente de Masculino ou Feminino** (Outro / Prefiro não informar), abre um campo obrigatório logo abaixo:
  **"Folgas dominicais por mês (padrão CLT)"** com as opções **1 por mês** e **2 por mês**.
  - Bloqueia o salvamento enquanto não for escolhido, explicando que essa frequência define quantas folgas dominicais o colaborador pode escolher.
  - Texto de apoio: 1 por mês = regra geral do comércio; 2 por mês = regra do Art. 386 da CLT.
- Para Masculino e Feminino o campo não aparece: o sistema segue a regra da unidade (geral / mulheres) como hoje.
- Exibir gênero e, quando houver, a frequência dominical escolhida na ficha resumo do colaborador.

### 2. Renomear a aba para "Horário"
- Título da aba e textos que citam "Horário de Trabalho" nas telas do colaborador passam a "Horário" (rota e dados não mudam).

### 3. Bloco de folga dominical na aba Horário
Novo painel informativo, logo abaixo dos dias da semana, mostrando a regra efetiva do colaborador:
- Base do descanso (legal ou acordo/convenção coletiva) e dias negociados.
- Domingos de folga por mês exigidos para **este** colaborador: regra de mulheres quando gênero = Feminino, regra geral para Masculino e a **frequência informada no cadastro** quando o gênero for Outro / Não informado.
- Aviso quando os domingos previstos no horário habitual não atingem o mínimo da regra.
- Texto explícito: "A folga dominical é definida na tela Folgas; o sindicato pode alterar essa frequência."
- Botão/atalho **Ver regras de folgas** abrindo `/dp/folgas?aba=regras` em nova aba, para não perder o cadastro em edição.

## Detalhes técnicos

- Migração: nova coluna `dp_colaboradores.domingos_folga_mes smallint` com check `IN (1,2)` (nula para M/F) e trigger de validação exigindo o valor quando `sexo` não for `F`/`M` e o regime for CLT.
- `ColaboradorFormDialog.tsx`: campos `sexo` e `domingos_folga_mes` no estado, na carga da edição e no payload; validação da etapa Dados; rótulo da aba `jornada` → "Horário".
- `dsr-rules.ts`: `tetoFolgasMes`, `domingosFolgaNoPeriodo` e `resumoEscolhaFolgas` passam a aceitar um override de domingos por mês do colaborador, aplicado antes da regra geral. Conformidade DSR, portal, escalas e calculadora de vales herdam o mesmo override.
- `ColaboradorJornadaPanel.tsx`: recebe `sexo`, `domingos_folga_mes` e `unidadeId` por prop e usa `useDpRegrasColaborador` + as funções acima para montar o bloco informativo.
- `ColaboradorFichaDialog.tsx`: linhas "Gênero" e "Folgas dominicais/mês".
