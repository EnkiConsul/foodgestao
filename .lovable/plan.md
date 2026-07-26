## Resultado da avaliação

As telas novas (Férias, Conformidade, Benefícios, Analytics, Mural) estão estruturalmente prontas: rotas registradas, botões com ações reais (nada de placeholder/TODO), tabelas/RPCs/enums existentes no banco, queries escopadas por empresa e estados de carregando/vazio presentes.

Encontrei 3 pendências reais — uma delas bloqueia o uso do Mural pelo colaborador.

### 1. Bloqueador: colaborador não consegue ver o Mural
As regras de acesso de `dp_avisos` (e comentários/reações) exigem que o usuário esteja na tabela de membros da empresa. Verifiquei no banco: dos colaboradores com login ativo, **nenhum** está registrado como membro da empresa. Resultado: o feed do Mural abre vazio para o colaborador, mesmo com avisos publicados.

Correção: ajustar as regras de acesso do Mural para aceitar também o vínculo de colaborador (mesma lógica já usada em outras tabelas do DP: colaborador ativo daquela empresa), mantendo escrita/moderação restrita a admin/gestor.

### 2. Mural não aparece no menu em telas grandes
A rota `/dp/meu/mural` existe e aparece na navegação inferior do celular, mas não está na barra lateral do portal do colaborador (`PORTAL_ITEMS` em `src/components/dp/DpSidebar.tsx`). No desktop só é possível chegar digitando a URL.

Correção: adicionar o item "Mural" à lista do portal na barra lateral.

### 3. Erros de carregamento ficam invisíveis
Nenhuma das telas novas trata o estado de erro das consultas — apenas erros de gravação viram aviso. Se uma consulta falhar, a tela fica "vazia" ou presa em carregando, sem explicação.

Correção: exibir um bloco de erro com botão "Tentar novamente" nas consultas principais de Férias, Conformidade, Benefícios, Analytics e Mural.

### Detalhes técnicos
- Migração ajustando as policies `dp_avisos_read`, `dp_comentarios_read`, `dp_comentarios_self_insert`, `dp_reacoes_read` para `is_company_member(...) OR dp_colaborador_ativo_of(...)` (função já existente no banco).
- `useDpMural.tsx`: passar a filtrar explicitamente `company_id` em vez de depender só do RLS.
- Componente reutilizável de estado de erro em `src/components/dp/` usado por `DpFerias.tsx`, `DpConformidade.tsx`, `DpBeneficios.tsx`, `DpAnalytics.tsx`, `MuralFeed.tsx`.
- Após a migração, validação com Playwright: abrir o mural autenticado e confirmar que os avisos carregam.
