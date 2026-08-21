# Atalhos de benefício no cadastro do colaborador

Hoje o bloco "Benefícios" da aba Remuneração só mostra caixas de seleção dos benefícios já existentes no catálogo da empresa, e só aparece quando existe pelo menos um benefício cadastrado. Criar ou corrigir um benefício exige sair do cadastro e ir até a tela de Benefícios.

## O que muda

1. Botão **Novo benefício** no cabeçalho do bloco "Benefícios", dentro da aba Remuneração. Abre o mesmo formulário de benefício usado na tela de Benefícios (nome, tipo, valor padrão, desconto, se entra na folha).
   - Ao salvar, o benefício novo aparece imediatamente na lista e já vem marcado para o colaborador em edição.
2. Ícone de **lápis** em cada benefício da lista, para editar o cadastro do catálogo (valor padrão, nome, desconto, folha) sem sair da tela do colaborador.
   - Um aviso curto no diálogo deixa claro que a alteração vale para todos os colaboradores que usam esse benefício, já que é o cadastro do catálogo.
   - O valor específico de um colaborador (valor diferente do padrão, desconto individual, período de vigência) continua sendo ajustado em Benefícios > Por colaborador — o atalho aqui é do catálogo.
3. Quando o catálogo estiver vazio, o bloco passa a aparecer com uma linha explicativa e o botão **Criar primeiro benefício**, em vez de simplesmente não existir.
4. Nada muda na gravação atual: ao salvar o colaborador, os benefícios marcados continuam gerando/ativando a atribuição e entrando na folha.

## Detalhes técnicos

- `src/components/dp/RemuneracaoFields.tsx`: novas props opcionais `onNovoBeneficio` e `onEditarBeneficio(beneficio)`; cabeçalho do bloco com o botão, lápis por item e estado vazio com CTA. O bloco deixa de ser condicionado a `beneficios.length > 0`.
- `src/components/dp/ColaboradorFormDialog.tsx`: passa os dois callbacks, controla `beneficioDialogOpen`/`beneficioEditando` e renderiza `BeneficioDialog` (de `beneficios/BeneficiosDialogs.tsx`) usando `saveBeneficio` do hook `useDpBeneficios` (já importado no arquivo). No `onSuccess` de criação, marca o novo id em `rem.beneficios`.
- `src/hooks/useDpBeneficios.tsx`: `saveBeneficio` precisa retornar o registro salvo (`select().single()`) para permitir marcar o benefício recém-criado; invalidações de cache seguem como estão.
- Diálogo aninhado: `BeneficioDialog` é renderizado dentro do dialog do colaborador com z-index acima e sem fechar o formulário do colaborador, no mesmo padrão já usado no atalho "Nova unidade".
- Mobile: botão em largura cheia no bloco e ações de lápis com área de toque mínima, seguindo o padrão do módulo.
