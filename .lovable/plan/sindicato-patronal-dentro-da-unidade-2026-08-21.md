# Sindicato Patronal Dentro da Unidade

O cadastro do sindicato patronal passa a acontecer dentro da própria unidade, e não em uma aba separada da tela de Unidades.

## O Que Muda

**No diálogo de editar/criar unidade** (hoje com abas Dados e Funcionamento) entra uma terceira aba: **Sindicato Patronal**. Nela o admin:

- Escolhe, numa lista, o sindicato patronal que representa aquela unidade (um mesmo sindicato pode representar várias unidades).
- Cria um sindicato novo na hora, sem sair da unidade (nome, CNPJ, WhatsApp e data-base), já vinculado à unidade.
- Edita os dados do sindicato selecionado (o mesmo registro usado em qualquer outro lugar do sistema).
- Remove o vínculo, deixando a unidade sem sindicato patronal.

**No card de cada unidade** na listagem passa a aparecer o sindicato patronal vinculado (ou o aviso "Sem sindicato patronal", com atalho que abre a unidade já nessa aba).

**A aba "Sindicatos Patronais" da tela de Unidades é removida** — deixa de existir uma lista solta de sindicatos patronais; eles são gerenciados por unidade. Os sindicatos laborais continuam exatamente como estão em Cargos e Salários.

## O Que Não Muda

- Os dados e vínculos existentes (SINDIBARES, SINDTUR e suas unidades) permanecem intactos.
- Piso salarial por unidade, negociações (ACT/CCT), enquadramento do colaborador e todas as regras que dependem do sindicato patronal continuam funcionando com a mesma fonte de dados.
- As rotas antigas de sindicatos continuam redirecionando para Unidades.

## Detalhes Técnicos

- `src/components/dp/UnidadeFormDialog.tsx`: `TabsList` passa de 2 para 3 colunas com a aba `sindicato`. O conteúdo usa `useDpSindicatos` (filtrando `tipo === "patronal"`), `useUpsertDpSindicato` e leitura/escrita em `dp_sindicato_unidades` para o vínculo da unidade em edição. Em unidade nova, o vínculo é gravado após o `upsert` retornar o id.
- O painel da aba é extraído para `src/components/dp/unidades/UnidadeSindicatoPanel.tsx`, reaproveitando os campos de formulário já usados em `SindicatosPanel` (máscaras `maskCnpj`/`maskPhone`, validação de nome obrigatório).
- Invalidação de cache após salvar: `dp_sindicatos`, `dp_sindicato_unidades*`, `dp_unidades` e as queries de piso/negociação que já são invalidadas hoje pelo `SindicatosPanel`.
- `src/pages/dp/DpUnidades.tsx`: remove o `Tabs` e o `SindicatosPanel` patronal; a listagem volta a ser única e cada card mostra o sindicato patronal (consulta agregada por unidade, no mesmo padrão do contador de colaboradores).
- `src/components/dp/sindicatos/SindicatosPanel.tsx` permanece, usado apenas com `tipo="laboral"` em Cargos e Salários.
- `src/components/dp/favoritablePages.ts`: remove a entrada da aba de sindicatos patronais.
