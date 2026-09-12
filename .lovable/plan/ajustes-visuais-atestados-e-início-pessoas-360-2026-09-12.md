# Ajustes visuais: Atestados e Início (Pessoas 360°)

## 1. Respiro lateral no formulário de atestados
- Em `src/pages/dp/DpAtestados.tsx` (aba "Cadastrar" / "Cadastrar Atestado ou Licença"), os campos e textos estão encostados na margem esquerda do card no mobile.
- Ajustar o conteúdo do `DpContentCard` para garantir padding horizontal confortável (mínimo 16px no mobile, mantendo o desktop), sem alterar nenhuma regra de negócio nem campos.
- Verificar se o ajuste fica no `DpContentCard` em `src/components/dp/DpPage.tsx` ou só na tela de atestados, sem quebrar outras telas que usam o mesmo card.

## 2. Tela inicial (`src/pages/dp/DpHome.tsx` e `KpiCards.tsx`)
- **Renomear título**: "Painel Administrativo" → "Pessoas 360°" (título da página e aba do navegador).
- **Remover o card "Ajustes"** dos cards de KPI: em vez dele, colocar um ícone de engrenagem na mesma linha do título "Pessoas 360°" (ações do cabeçalho), que abre `/dp/configuracoes`. Ícone com tooltip "Configurações".
- **Card "Ocorrências hoje"**: só exibir quando houver pelo menos 1 ocorrência no dia. Quando for zero, o card não aparece (nenhum card vazio/zerado na tela).
- Resultado: quando não houver ocorrências, a faixa de cards some por completo e a tela vai direto aos cards de menus (mobile) e pendências/aniversariantes.

## 3. Validação
- Typecheck e testes existentes.
- Playwright em viewport mobile: conferir respiro lateral no formulário de atestados, engrenagem no cabeçalho, novo título e ocultação do card de ocorrências zerado.

## Detalhes técnicos
- Arquivos: `src/pages/dp/DpAtestados.tsx`, `src/components/dp/DpPage.tsx` (se necessário), `src/pages/dp/DpHome.tsx`, `src/components/dp/home/KpiCards.tsx`.
- Sem mudanças de banco de dados.
- Nome usado segue o padrão da marca: "Pessoas 360°".
