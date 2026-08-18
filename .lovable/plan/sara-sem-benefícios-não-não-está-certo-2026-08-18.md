# Sara sem benefícios: não, não está certo

Conferi no banco: a Sara está ativa, na unidade sem padrão próprio, então o padrão que vale para ela é o **da empresa** (3 atrasos, tolerância 10 min, prêmio de assiduidade 11%, VA R$ 24,00/dia). O cadastro dela está com prêmio, VA e VT desligados e limite de atrasos vazio — ou seja, o padrão nunca foi replicado para ela.

Dois motivos, ambos confirmados:

1. O padrão da empresa foi salvo com alcance "só os próximos cadastros", então quem já existia (inclusive a Sara) ficou intocado.
2. O aviso de divergência ao abrir um cadastro existente **não está aparecendo**: o componente do banner foi criado e importado no formulário do colaborador, mas nunca foi renderizado na aba Remuneração. Por isso você abriu a Sara, viu tudo vazio e o sistema não sinalizou nada.

Hoje, dos 11 colaboradores ativos: 3 estão sem prêmio de assiduidade e 3 estão sem vale-alimentação fora da exceção prevista (o cargo que tem padrão próprio com VA desligado, 2 pessoas, continua correto).

## O que vamos fazer

### 1. Ligar de fato o aviso de divergência na edição
- Renderizar o banner âmbar no topo da aba **Remuneração** quando o cadastro aberto difere do padrão aplicável (cargo → unidade → empresa), campo por campo: "Vale-alimentação: padrão R$ 24,00/dia • neste cadastro não tem".
- Botões **Aplicar padrão** (preenche o formulário, você confere e salva) e **Manter como está** (dispensa o aviso nesta edição).
- Ponto âmbar no rótulo da aba Remuneração quando houver divergência, no mesmo estilo do aviso de isonomia.
- Nada muda sozinho: abrir e fechar o cadastro não altera valor nenhum.

### 2. Alinhar quem já está fora do padrão
- Usar a ação **"Sincronizar com o padrão"** (já existe na tela de Colaboradores) para alinhar os ativos divergentes — Sara incluída — respeitando o padrão de cada escopo, sem tocar no cargo que tem padrão próprio com VA desligado.
- Conferência depois: nenhum ativo divergente do padrão do próprio escopo.

### 3. Evitar a repetição
- No diálogo de salvar padrão, deixar mais explícito que "só os próximos" não corrige quem já existe, mostrando a contagem de divergentes ao lado da opção "Todos os colaboradores deste alcance".

## Detalhes técnicos

- `src/components/dp/ColaboradorFormDialog.tsx`: calcular `diferencasDoPadrao` com `divergenciasColaboradorVsPadrao(colaborador, padraoAplicavel?.payload)` em modo edição, estado `avisoPadraoDispensado`, renderizar `PadraoDivergenciaAviso` no `TabsContent value="remuneracao"` e ponto na `TabsTrigger`.
- Aplicar padrão no formulário via `aplicarPadrao(rem, padraoAplicavel?.payload)` já existente em `src/lib/dp/beneficiosPadrao.ts`.
- Sincronização dos registros atuais pelo diálogo existente (`SincronizarPadraoDialog` + `useSincronizarPadraoColaboradores`), sem mudança de schema.
- Teste unitário cobrindo o caso "colaborador com campos vazios vs padrão da empresa" em `src/test/unit/beneficiosPadrao.test.ts`.
