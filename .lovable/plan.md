# Rotina do dia: cards em 2 linhas e pessoas do dia junto do turno

## 1. Cards em 2 linhas (no dia e no dia aberto pelo calendário do mês)

Hoje a rotina do dia tem 10 cards e a grade usa 4 colunas — por isso aparecem 3 linhas. Passa a usar 5 colunas em tela larga: 10 cards em exatamente 2 linhas, tanto na aba "Dia" como na janela que abre ao clicar num dia do calendário do mês (que também usa a mesma grade).

- Telas largas: 5 colunas. Telas médias: 3. Celular: 2.
- Todos os cards com a mesma altura, mesmo quando o título ocupa só uma linha — o espaço do título passa a reservar sempre duas linhas.
- "Atestado / Licença" continua podendo quebrar a linha sem cortar a palavra.

## 2. Ordem dos motivos ao adicionar pessoa

No formulário de adicionar pessoa, a lista de motivos passa para esta ordem, com "Folguista" já selecionado por padrão:

1. Folguista (cobrindo alguém)
2. Em teste na loja
3. Colaborador cadastrado que trabalhou

## 3. Título da seção

"Pessoas Registradas no Dia" passa a se chamar **"Mão de Obra Extra"**, com a descrição ajustada para dizer que ali ficam as pessoas incluídas manualmente naquele dia (para editar ou remover).

## 4. Pessoas adicionadas aparecem dentro do turno

As pessoas em teste e folguistas já entram no quadro do turno junto com os demais, com cargo e horário — mas hoje recebem a etiqueta "Fixos Escalados". Passa a mostrar a categoria real de cada uma:

- **Folguista** (com "cobrindo *nome*" quando houver titular indicado)
- **Em teste**
- **Registro manual**, para o colaborador cadastrado lançado à mão

Assim o gestor lê o turno inteiro numa lista só e distingue quem é do quadro fixo e quem foi incluído no dia. A seção "Pessoas Adicionais no Dia" continua abaixo, servindo para incluir, editar e remover esses registros.

## Detalhes técnicos

- `src/pages/dp/DpOperacaoPanorama.tsx`: grade em `GradeCards` de `grid-cols-2 sm:grid-cols-3 md:grid-cols-5`; etiqueta da pessoa nos blocos de turno passa a considerar `p.origem === "avulso" | "registro_manual"` e `p.avulso_tipo` (dados já presentes em `PessoaPanorama`) antes de cair em `CATEGORIA_LABEL`; textos da seção `Pessoas Registradas no Dia`.
- `src/components/dp/DpStatCard.tsx`: rótulo com altura mínima de duas linhas para padronizar a altura dos cards entre linhas.
- `src/components/dp/DpPessoaAvulsaDialog.tsx`: ordem de `TIPO_LABEL` (folguista → teste → registro manual) e valor inicial do formulário como `folguista`; edição continua respeitando o tipo salvo.
- Nada muda no banco nem nas regras de contagem: teste e folguista continuam somando em "Fixos Escalados" e registro manual segue somando no card do tipo do colaborador.
- Verificação: `bunx tsgo --noEmit -p tsconfig.app.json`, `bunx eslint` nos arquivos tocados, testes existentes de `src/lib/dp/__tests__` e conferência no navegador da aba Dia e da janela do dia no calendário do mês (contagem de linhas dos cards).
