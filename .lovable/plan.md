# "Aplicar a todos" nos padrões de benefícios deve alcançar colaboradores já cadastrados

## O que está acontecendo

Hoje o "Aplicar a todos" do diálogo de padrão só mexe em **padrões**, não em **pessoas**:

- ao confirmar "Padrão da empresa" + "Aplicar a todos", o sistema grava o padrão da empresa e **apaga** os padrões de unidade e de cargo (`useSalvarDpBeneficiosPadrao` → `limparEscoposMaisEspecificos`);
- nenhuma linha de colaborador é atualizada — o próprio domínio declara isso: "nada é aplicado a colaborador já existente" (`src/lib/dp/beneficiosPadrao.ts`);
- além disso, o padrão só pré-preenche o formulário quando é **novo** cadastro (`!isEdit`).

Por isso a Alessandra continuou com 5 atrasos tolerados: o padrão da empresa virou 3, mas o registro dela nunca foi tocado.

## O que vamos construir

1. **Duas opções explícitas de alcance** no diálogo, logo abaixo da escolha de escopo (empresa/unidade/cargo):
   - **Somente novos cadastros** (selecionada por padrão): grava o padrão e não toca em ninguém já cadastrado — é o comportamento atual, agora nomeado com clareza.
   - **Todos os colaboradores do escopo**: grava o padrão, limpa os padrões mais específicos que conflitam e **atualiza os colaboradores ativos** do escopo com os campos do padrão: assiduidade (critério, tolerância, máximo de atrasos, atestado e máximo de atestados), prêmio, vale-transporte, vale-alimentação e a ficha de benefícios marcados.
2. **Transparência antes de aplicar.** Com "Todos" marcado, o diálogo mostra quantos colaboradores serão atualizados e avisa que valores individuais serão sobrescritos.
3. **Sem surpresa silenciosa.** O colaborador aberto na tela mantém o que está no formulário; desligados não são alterados; escopo cargo atualiza só quem tem aquele cargo (na unidade, quando houver).
4. **Feedback.** O toast informa o padrão gravado e, quando aplicável, quantos colaboradores foram atualizados.

## Detalhes técnicos

- `src/lib/dp/beneficiosPadrao.ts`: nova função para converter `BeneficiosPadraoPayload` nas colunas de `dp_colaboradores` (os nomes coincidem com `CAMPOS_PADRAO`, exceto `beneficios`, que vive em `dp_colaborador_beneficios`). Atualizar o comentário de cabeçalho, que hoje afirma o comportamento antigo.
- `src/hooks/useDpBeneficiosPadrao.tsx`: na mutation, novo parâmetro `alcance: "novos" | "todos"` + `ignorarColaboradorId`. Com `"todos"`, consulta os colaboradores ativos do escopo (`company_id`, mais `unidade_id`/`cargo_id` conforme o escopo), faz o `update` das colunas de remuneração, sincroniza `dp_colaborador_beneficios` e mantém a limpeza dos padrões mais específicos. Retorna a contagem de atualizados e invalida as queries de colaboradores.
- `src/components/dp/ColaboradorFormDialog.tsx`: substituir o checkbox `substituirEspecificos` por um RadioGroup de alcance ("Somente novos cadastros" / "Todos do escopo"), exibir contagem estimada quando "Todos" e mostrar a contagem aplicada no toast.
- Testes unitários em `src/test/unit/beneficiosPadrao.test.ts` cobrindo o mapeamento padrão → colunas do colaborador.
