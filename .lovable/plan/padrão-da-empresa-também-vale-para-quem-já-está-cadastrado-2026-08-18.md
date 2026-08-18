# Padrão da empresa também vale para quem já está cadastrado

Hoje o padrão de benefícios/assiduidade só é usado em **cadastro novo**. Ao abrir um colaborador já existente (como a Hanna), o formulário carrega apenas o que está gravado nele e não avisa nada quando aquele valor difere do padrão vigente — foi por isso que apareceu "5 atrasos" mesmo com o padrão da empresa em 3 atrasos.

Conferido no banco: o padrão da empresa está com 3 atrasos e tolerância de 10 min, mas ainda existem colaboradores ativos com 5 atrasos (Rosângela, Herick, Nordman), ou seja, a replicação "para todos" não alcançou esses registros.

## O que vamos fazer

### 1. Aviso de divergência ao editar (não muda nada sozinho)
- Na aba **Remuneração**, banner âmbar quando o cadastro aberto difere do padrão aplicável (cargo → unidade → empresa), listando campo por campo: "Máximo de atrasos: padrão 3 • neste cadastro 5".
- Botões: **Aplicar padrão** (preenche o formulário com os valores do padrão, você ainda confirma no salvar) e **Manter como está** (esconde o aviso nesta edição).
- Ponto âmbar no rótulo da aba Remuneração quando houver divergência, no mesmo estilo já usado pelo aviso de isonomia.
- Nenhum valor é alterado sem clique — cadastro aberto continua intocado se você só olhar e fechar.

### 2. Sincronizar a base atual com o padrão
- Correção pontual dos colaboradores ativos que ainda estão fora do padrão vigente (os três acima), alinhando os campos de assiduidade ao padrão da empresa.
- Ação fixa **"Sincronizar com o padrão"** na tela de Colaboradores: abre um diálogo que lista quem está divergente (nome, cargo, unidade e o que difere), permite escolher os grupos (Assiduidade, VA, VT, Ficha) e desmarcar colaboradores que devem seguir como exceção antes de aplicar.
- Resumo ao final: quantos foram atualizados.

### 3. Reduzir a chance de o padrão "não pegar"
- No diálogo de salvar padrão, quando existirem colaboradores ativos divergentes no alcance, o alcance vem pré-selecionado em **"Todos os colaboradores deste alcance"** com a contagem ao lado, em vez de sempre voltar para "só os próximos".
- Se a replicação atualizar 0 registros, o aviso deixa isso explícito ("nenhum colaborador foi alterado") em vez de dar a impressão de sucesso total.

## Detalhes técnicos

- `src/components/dp/ColaboradorFormDialog.tsx`: remover o `if (isEdit) return;` do efeito de padrão apenas para **calcular divergências** (a aplicação automática continua só em cadastro novo); novo estado para dispensar o aviso; ponto na aba.
- Novo `src/components/dp/PadraoDivergenciaAviso.tsx`: banner reutilizando `diferencasPadrao`, `nivelPadrao` e `aplicarPadrao` de `src/lib/dp/beneficiosPadrao.ts`.
- Novo `src/components/dp/SincronizarPadraoDialog.tsx` + ação na página de colaboradores; a comparação de cada colaborador contra o padrão usa uma função nova em `beneficiosPadrao.ts` (`divergenciasColaboradorVsPadrao`), com testes em `src/test/unit/beneficiosPadrao.test.ts`.
- `src/hooks/useDpBeneficiosPadrao.tsx`: reutilizar `padraoParaColunasColaborador` para o update em lote a partir do novo diálogo, aceitando lista explícita de ids.
- Sincronização dos três registros atuais via operação de dados (UPDATE pontual), sem mudança de schema.
