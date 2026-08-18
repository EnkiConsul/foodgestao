# Por que a pergunta de padrão voltou na Cristiane

## O que foi verificado no banco

- Você salvou um **padrão da empresa** (sem unidade) com: assiduidade 11%, tolerância 10 min, **máximo de 3 atrasos**, **considera atestado = sim**, VA R$ 24/dia.
- A unidade da Cristiane já tinha, de antes, um **padrão de unidade** com **máximo de 5 atrasos** e **sem o campo de atestado** (criado antes desse campo existir).
- A ficha da Cristiane está com 3 atrasos e considera atestado = sim.

Como o padrão de unidade tem prioridade sobre o da empresa, o sistema comparou a ficha dela com o padrão **da unidade** (5 atrasos, atestado ausente) — e por isso encontrou diferença real e perguntou. Não é a comparação de texto quebrada de antes; é padrão antigo de unidade conflitando com o novo padrão de empresa.

## Correções

### 1. Não perguntar quando os valores já batem com algum padrão vigente

A pergunta passa a considerar todos os níveis aplicáveis (cargo, unidade e empresa). Se o conteúdo da tela for igual a qualquer um deles, nada é perguntado.

### 2. Campos ausentes em padrões antigos deixam de contar como diferença

Campos booleanos que não existiam quando o padrão foi salvo (como "considera atestado") passam a ser tratados como "não informado" equivalente a falso na comparação, em vez de diferença.

### 3. Deixar claro qual padrão está valendo e resolver conflito de nível

- O diálogo de padrão mostra qual nível está vigente hoje e no que ele difere da tela (por exemplo: "padrão da unidade Matriz: máximo de 5 atrasos; nesta tela: 3").
- Ao escolher **Padrão da empresa**, aparece a opção "aplicar também às unidades/cargos que já têm padrão próprio", que remove os padrões mais específicos conflitantes — assim a decisão de empresa passa a valer de fato.
- Sem essa marcação, o padrão de unidade continua tendo prioridade (comportamento atual, agora explicado na tela).

## Detalhes técnicos

- `src/lib/dp/beneficiosPadrao.ts`: `normalizarPadrao` trata `undefined` em campos booleanos como `false`; novo `padroesIguaisAlgum(atual, linhas, {unidadeId, cargoId})` que testa contra cargo/unidade/empresa; novo `diferencasPadrao()` retornando os campos divergentes com rótulos em português para o diálogo.
- `src/components/dp/ColaboradorFormDialog.tsx`: `devePerguntarPadrao()` usa `padroesIguaisAlgum`; diálogo exibe nível vigente + lista de diferenças; opção "substituir padrões mais específicos" quando o escopo escolhido é empresa (e unidade sobre cargos).
- `src/hooks/useDpBeneficiosPadrao.tsx`: mutação aceita `limparEscoposMaisEspecificos` e apaga as linhas de unidade/cargo abrangidas na mesma operação.
- Testes em `src/test/unit/beneficiosPadrao.test.ts`: igualdade com campo booleano ausente, comparação contra múltiplos níveis e cálculo de diferenças.
