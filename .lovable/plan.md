## Correção

Conforme a documentação do repositório `portalcolaborador`, "Negociações Coletivas" **não** pertence ao grupo Cadastros. Atualmente está listada em `src/components/dp/DpSidebar.tsx` dentro do grupo "Cadastro" junto com Colaboradores/Cargos/Unidades/Sindicatos.

### Alterações

1. **`src/components/dp/DpSidebar.tsx`** — Remover o item `Negociações Coletivas` do grupo `Cadastro`. O grupo passa a conter apenas: Colaboradores, Cargos, Unidades, Sindicatos.

2. **`src/components/dp/DpSidebar.tsx`** — Adicionar "Negociações Coletivas" como item de nível superior (link direto no menu principal), fora de qualquer grupo, acompanhando a estrutura da documentação. Rota mantida: `/dp/sindicatos/negociacoes`, ícone `FileSignature`.

3. **`src/pages/dp/DpCadastrosHub.tsx`** — Verificar/garantir que o hub de Cadastros não liste "Negociações Coletivas" (hoje já lista apenas Unidades, Cargos, Sindicatos — nenhuma alteração necessária).

4. **`src/components/layout/sidebar-menus/DpMenu.tsx`** — Remover `Negociações` do grupo `Cadastros` deste menu alternativo e mantê-la fora (ou como link independente), para manter consistência entre os dois componentes de sidebar do módulo.

### Fora do escopo
- Rotas, permissões, backend, cores/tokens ou qualquer outra reorganização de menus.
- Alterações no portal do colaborador.
