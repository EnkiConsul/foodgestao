Plan: Ficha de visualização do colaborador ao clicar na linha

## Contexto
Atualmente a página `/dp/colaboradores` lista colaboradores em uma tabela desktop e cards mobile. A edição só é possível pelo botão "Editar" na linha/card. O usuário quer que o clique na linha/card abra uma **ficha de visualização** com os dados do colaborador, e dentro dessa ficha exista a opção de clicar em **Editar** para abrir o formulário existente (`ColaboradorFormDialog`).

## Escopo
- Criar um novo componente de visualização apenas-leitura: `src/components/dp/ColaboradorFichaDialog.tsx`.
- Refatorar `src/pages/dp/DpColaboradores.tsx` para abrir a ficha ao clicar na linha da tabela (desktop) ou no card (mobile), mantendo ações rápidas existentes.
- Manter a compatibilidade com o formulário atual: a ficha terá um botão "Editar" que abre `ColaboradorFormDialog`.
- Não alterar a estrutura de dados, hooks, RLS ou backend.

## Detalhes técnicos
1. **Componente `ColaboradorFichaDialog.tsx`**
   - Props: `open`, `onOpenChange`, `colaborador: DpColaborador | null`, `onEdit: () => void`.
   - Layout: `Dialog` com `DialogContent` de largura confortável (`max-w-3xl` ou `max-w-4xl`), sem scroll global forçado.
   - Seções na ficha (visualização apenas):
     - **Cabeçalho**: nome, CPF, matrícula, badge de status (ativo/desligado), badge de perfil.
     - **Dados pessoais e empregatícios**: e-mail, WhatsApp, cargo, unidade, data de admissão, data de nascimento, tipo de vínculo.
     - **Jornada**: folga fixa semanal, possui folha de ponto, optante por adiantamento (se aplicável).
     - **Remuneração**: forma de pagamento, salário base, valor hora, base de cálculo, dependentes IRRF, adicional, vale-transporte, prêmio de assiduidade (se ativo), benefícios ativos.
     - **Acesso ao portal**: CPF de login, indicação de usuário vinculado ou não vinculado.
     - **Desligamento** (se aplicável): data, motivo, elegibilidade, observação, data de carência do portal.
   - Botão de ação principal: "Editar" no `DialogFooter` (ou próximo ao título) que chama `onEdit` e fecha a ficha.
   - Botão secundário: "Fechar".

2. **Alterações em `src/pages/dp/DpColaboradores.tsx`**
   - Adicionar estado `viewing: DpColaborador | null`.
   - Tornar a `TableRow` clicável inteira (`cursor-pointer`, hover sutil) abrindo a ficha. Garantir que botões de ação e DropdownMenu não propaguem o clique para a linha (`stopPropagation`/`onClick` isolado).
   - Tornar o card mobile clicável na área de conteúdo (não nos botões) para abrir a ficha.
   - Incluir `<ColaboradorFichaDialog open={!!viewing} ... onEdit={() => { setViewing(null); setEditing(viewing); setDialogOpen(true); }} />`.

3. **Design** (seguir a identidade 360°FOOD e padrão GitHub/DP)
   - Usar `Dialog`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter`.
   - Seções em cards internos com `rounded-xl border bg-card p-4` ou similar.
   - Badges para status, perfil, vínculo.
   - Ícones do Lucide para cada seção (ex: `User`, `Briefcase`, `Building`, `Calendar`, `Wallet`, `Lock`, `LogOut`).
   - Evitar cores hardcoded (usar tokens Tailwind do projeto).

## Fora de escopo
- Não alterar o `ColaboradorFormDialog` em funcionalidade.
- Não criar backend ou RLS.
- Não alterar navegação de rotas (permanece dialog, não página).
