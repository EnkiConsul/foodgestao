# "Aplicar a todos" nos padrões de benefícios deve alcançar colaboradores já cadastrados

## O que está acontecendo

Hoje o "Aplicar a todos" do diálogo de padrão só mexe em **padrões**, não em **pessoas**:

- ao confirmar "Padrão da empresa" + "Aplicar a todos", o sistema grava o padrão da empresa e **apaga** os padrões de unidade e de cargo (`useSalvarDpBeneficiosPadrao` → `limparEscoposMaisEspecificos`);
- nenhuma linha de colaborador é atualizada — o próprio domínio declara isso: "nada é aplicado a colaborador já existente" (`src/lib/dp/beneficiosPadrao.ts`);
- além disso, o padrão só pré-preenche o formulário quando é **novo** cadastro (`!isEdit`).

Por isso a Alessandra continuou com 5 atrasos tolerados: o padrão da empresa virou 3, mas o registro dela nunca foi tocado.

## O que vamos construir

1. **Propagação real.** Quando o usuário marcar "Aplicar a todos", além de limpar padrões mais específicos, o sistema atualiza os colaboradores **ativos** no escopo escolhido (empresa inteira, ou apenas a unidade) com os campos do padrão: assiduidade (critério, tolerância, máximo de atrasos, atestado e máximo de atestados), prêmio, vale-transporte, vale-alimentação e a ficha de benefícios marcados.
2. **Transparência antes de aplicar.** O texto do checkbox passa a dizer claramente que colaboradores já cadastrados serão atualizados, e o diálogo mostra quantos colaboradores serão afetados antes da confirmação.
3. **Sem surpresa silenciosa.** O colaborador que está sendo editado/cadastrado naquele momento continua com o que está na tela; os demais recebem o padrão. Colaboradores desligados não são alterados.
4. **Feedback.** Após confirmar, o toast informa o padrão gravado e o número de colaboradores atualizados.

## Detalhes técnicos

- `src/lib/dp/beneficiosPadrao.ts`: nova função para converter `BeneficiosPadraoPayload` nas colunas de `dp_colaboradores` (os nomes coincidem com `CAMPOS_PADRAO`, exceto `beneficios`, que vive em `dp_colaborador_beneficios`). Atualizar o comentário de cabeçalho, que hoje afirma o comportamento antigo.
- `src/hooks/useDpBeneficiosPadrao.tsx`: na mutation, novo parâmetro `aplicarAosColaboradores` + `ignorarColaboradorId`. Ela consulta os colaboradores ativos do escopo (`company_id`, e `unidade_id` quando o escopo é unidade; cargo quando escopo cargo não propaga), faz o `update` das colunas de remuneração e sincroniza `dp_colaborador_beneficios` (insere/remove conforme os benefícios marcados no padrão). Retorna a contagem de atualizados e invalida as queries de colaboradores.
- `src/components/dp/ColaboradorFormDialog.tsx`: reaproveitar o checkbox `substituirEspecificos` como "Aplicar a todos" real (limpar padrões + propagar), atualizar copy, exibir contagem estimada de colaboradores no escopo e mostrar a contagem aplicada no toast.
- Testes unitários em `src/test/unit/beneficiosPadrao.test.ts` cobrindo o mapeamento padrão → colunas do colaborador.
