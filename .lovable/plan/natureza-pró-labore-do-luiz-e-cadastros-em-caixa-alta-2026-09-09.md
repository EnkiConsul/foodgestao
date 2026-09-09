# Natureza pró-labore do Luiz e cadastros em CAIXA ALTA

## 1. Por que a natureza do Luiz continua "Contracheque"

Confirmado no banco: o cadastro do Luiz está correto (vínculo Sócio, remuneração pró-labore), mas a página do documento dele foi vinculada **antes** da correção — o registro guarda `contracheque` com origem "leitura". A regra nova só age no momento em que alguém vincula a pessoa, então páginas já vinculadas continuam com a natureza antiga. Na aprovação o documento já sairia como pró-labore, mas na tela continua aparecendo errado.

O que muda:

- Ao abrir a conferência, toda página já vinculada a um sócio com pró-labore tem a natureza corrigida na hora para **Recibo de Pró-Labore** (uma única atualização por página, sem repetir).
- Isso vale para os lotes em revisão hoje, incluindo o do Luiz.
- Empregados (CLT e afins) e demais naturezas seguem intocados; correção manual feita pelo usuário é respeitada.
- Como a conferência do Luiz já está aberta, um ajuste único no banco também corrige aquela página imediatamente.

## 2. Cadastros em CAIXA ALTA

Passa a ser gravado em maiúsculas ao salvar, e os registros existentes serão convertidos:

- Colaborador: nome, nome social, nome da mãe/pai
- Cargo, setor, unidade
- Turno, jornada, sindicato

Não muda: e-mail, senha, endereços de link, documentos numéricos, observações e textos livres. Comunicação (avisos, mensagens, modelos, boas-vindas, notificações, e-mails) continua em Primeira Maiúscula como hoje.

## Detalhes técnicos

**Natureza por vínculo**
- Em `BulkReviewInline.tsx` (e espelho em `BulkReviewDialog.tsx`): efeito que, quando `items` e `colaboradores` estão carregados, percorre linhas `status = "pending"` com `matched_colaborador_id`, calcula `tipoCanonicoPorVinculo(r.tipo_detectado ?? batch.tipo, colab)` e, quando difere, faz um `update` em lote de `tipo_detectado` + `tipo_origem: "vinculo"` + `tipo_confidence: 1`; guarda os ids já normalizados em `useRef` para não reprocessar. Só atua quando `tipo_origem !== "manual"`.
- Correção pontual do dado existente via `run_sql`: `update dp_bulk_import_items set tipo_detectado='pro_labore', tipo_origem='vinculo' where id='0137201d-8286-42fc-a4a7-e7b52ef48015'`.
- Sem alteração de schema, RLS ou do motor de leitura.

**Caixa alta**
- Novo helper puro `src/lib/text/upperName.ts` → `toUpperCadastro(v)`: `trim`, colapso de espaços, `toLocaleUpperCase("pt-BR")`, preservando vazio/nulo. Testes unitários.
- Aplicar na gravação dos hooks/diálogos de cadastro: `useDpCadastros` (cargos, setores, unidades, turnos, jornadas), `useDpColaboradores`/`ColaboradorFormDialog`, `NovoColaboradorInlineDialog`, sindicatos. Normalizar no payload antes do insert/update, não no `onChange`, para não atrapalhar a digitação.
- Migração com triggers `BEFORE INSERT OR UPDATE` nas tabelas `dp_colaboradores` (nome, nome_social, nome_mae, nome_pai — conforme colunas existentes), `dp_cargos`, `dp_setores`, `dp_unidades`, `dp_turnos`, `dp_jornadas`, `dp_sindicatos`, garantindo caixa alta mesmo em gravações por função/importação.
- `run_sql` único de normalização dos registros existentes nessas mesmas colunas.
- Onde houver `toProperName`/`tituloSistema` aplicado sobre esses nomes na exibição, remover para não descaracterizar o caixa alta.
- Verificação: testes do helper, typecheck, suíte de DP, e conferência visual do lote do Luiz mostrando "Recibo de Pró-Labore".

## Reversão

Triggers podem ser removidas por migração; a conversão de texto já gravado não é reversível automaticamente.
