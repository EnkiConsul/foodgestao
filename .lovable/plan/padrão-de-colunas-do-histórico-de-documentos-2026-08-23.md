# Padrão de Colunas do Histórico de Documentos

## Objetivo
Aplicar o padrão visual do histórico da Pakerê como padrão do sistema na tela `/dp/documentos/historico`, centralizando todas as colunas exceto "Colaborador", sem remover a personalização de largura/ordem do usuário.

## Mudanças

### 1. Alinhamento central das colunas

Na tabela desktop de `src/pages/dp/DpHistoricoCompleto.tsx`:

- **Coluna Colaborador**: mantém alinhamento à esquerda (cabeçalho e célula).
- **Colunas Tipo, Competência, Unidade, Aceite**: cabeçalho e conteúdo alinhados ao centro.
- **Coluna Ações**: cabeçalho e botões alinhados ao centro.

Ajustes necessários:
- Adicionar classes `text-center` e `justify-center` nos cabeçalhos centralizados.
- Adicionar `text-center` nas células de Tipo, Competência, Unidade e Aceite.
- Ajustar o `render` da coluna Tipo para que o `Badge` fique centralizado (`justify-center` ou wrapper flex).
- Ajustar o `render` da coluna Aceite para que o `Badge` ou `span` fique centralizado.
- Manter `whitespace-normal break-words` em Tipo e Unidade para que a quebra de linha continue funcionando mesmo com texto centralizado.

### 2. Preservação da personalização

- O redimensionamento manual das colunas continua funcionando.
- A reordenação por drag-and-drop continua funcionando.
- As larguras e a ordem persistem em `localStorage` como hoje.

### 3. Mobile

- Os cards mobile não são alterados; o alinhamento central aplica-se apenas à tabela desktop.

## Detalhes técnicos

- Arquivo alterado: `src/pages/dp/DpHistoricoCompleto.tsx`.
- O objeto `COLS` ganha ajustes em `cellClass` para as colunas centralizadas.
- O cabeçalho "Ações" recebe `text-center` no `TableHead`.
- A célula de Ações mantém o grid 2x2 de botões, mas com `justify-items-center` e `text-center` no cabeçalho.
- Verificar se o `title` do tooltip do Colaborador continua exibindo o nome completo ao passar o mouse.
