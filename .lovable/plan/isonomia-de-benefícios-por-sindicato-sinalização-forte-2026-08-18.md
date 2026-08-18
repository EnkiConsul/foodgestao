# Isonomia de benefícios por sindicato — sinalização forte

## O que aconteceu com o Erildson

O alerta de isonomia existe (`alertaIsonomia` em `src/lib/dp/beneficios-regras.ts` + `BeneficioDispensaDialog`), mas ele não podia disparar no caso dele, por três motivos confirmados no código:

1. Ele só é avaliado quando existe um registro **ativo** em `dp_colaborador_beneficios` que o usuário desmarcou (`dispensasPendentes` em `ColaboradorFormDialog.tsx`, linha 551: `if (!colaborador?.id) return []` e `if (!atual?.ativo …) continue`). A tabela de atribuições está vazia nesta empresa; VA/VT/assiduidade hoje vivem como campos do próprio colaborador (`vale_alimentacao`, `vale_transporte`, `premio_assiduidade`). Esses campos não são checados por isonomia em nenhum lugar.
2. A comparação de "situação equivalente" usa apenas cargo + unidade. Sindicato laboral e patronal não entram — exatamente o critério que você considera o mais relevante.
3. A única sinalização é um diálogo no momento do salvamento. Não há nada visível enquanto a pessoa edita a aba Remuneração — então, mesmo se disparasse, é fácil não ver.

## O que vou construir

### 1. Grupo de equivalência por sindicato
Nova função em `src/lib/dp/beneficios-regras.ts` que monta o grupo comparável na seguinte ordem de força:

- mesmo **sindicato laboral** (campo `sindicato_id` do colaborador) **e** mesmo **sindicato patronal** (resolvido pela unidade, como já é feito no motor de salários) — grupo forte;
- mesma unidade + mesmo cargo — grupo complementar, quando não houver sindicato definido.

O alerta passa a citar o sindicato: "Colegas representados pelo SECHSEG recebem o Vale-alimentação".

### 2. Cobertura dos benefícios reais
A checagem passa a considerar os benefícios que hoje ficam no cadastro do colaborador — vale-alimentação, vale-transporte e prêmio de assiduidade —, além das atribuições da tabela de benefícios. Também passa a valer para **cadastro novo** e para quem simplesmente **nunca teve** o benefício ligado (o caso do Erildson), não apenas para quem teve o benefício removido.

Também sinalizo divergência de **valor** (ex.: colega com VA de R$ 24/dia e este com R$ 15/dia), não só ligado/desligado.

### 3. Sinalização visível, em três camadas
- **Banner fixo na aba Remuneração**, em destaque de atenção, listando cada divergência com o número de colegas e o sindicato em comum, com botão "Aplicar como os colegas" que preenche os campos do benefício com o padrão do grupo.
- **Indicador na aba** "Remuneração" (mesmo padrão de pendência já usado nas outras abas), para que a divergência apareça mesmo com a aba fechada.
- **Diálogo de confirmação ao salvar** (o `BeneficioDispensaDialog` atual, reaproveitado e ampliado): exige escolher um motivo objetivo (previsão em norma coletiva, condição do benefício, opção do colaborador, outro + texto) e registra a ciência em `dp_regras_historico`, com opção de emitir o termo de dispensa. Sem escolher o motivo, o salvamento não passa.

### 4. Sinalização fora do cadastro
Na lista de colaboradores e no painel de benefícios, uma coluna/selo "Divergência de benefício" para os casos em que alguém do mesmo grupo sindical está fora do padrão, para que a situação não fique escondida dentro do formulário.

## Detalhes técnicos

- `src/lib/dp/beneficios-regras.ts`: `grupoIsonomia()` e evolução de `alertaIsonomia()` para receber sindicato laboral/patronal, tipo de divergência (`ausente` | `valor_menor`) e o valor padrão do grupo. Funções puras.
- Resolução do sindicato patronal por unidade: reutilizar o caminho já usado em `cargoSalarios.ts` / `dp_sindicato_unidades`, sem nova consulta duplicada.
- `ColaboradorFormDialog.tsx`: `dispensasPendentes()` deixa de exigir `colaborador?.id` e passa a comparar os campos de VA/VT/assiduidade; novo cálculo memoizado alimenta banner, indicador de aba e diálogo.
- `RemuneracaoFields.tsx`: recebe as divergências por prop e renderiza o banner + ação de aplicar o padrão do grupo (apresentação apenas).
- Testes unitários novos em `src/test/unit/` cobrindo: mesmo sindicato com benefício ausente (caso Erildson), sindicatos diferentes sem alerta, divergência de valor e grupo sem sindicato caindo em cargo+unidade.
- Sem mudanças de schema.
