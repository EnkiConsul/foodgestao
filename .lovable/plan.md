# Cargos e Salários como Tela Única de Regras do Cargo

## O que muda

A tela **Cargos e Salários** passa a ter 4 abas:

```text
Cargos e Salários
├── Cargos                  (lista atual)
├── Complementos Salariais  (atual)
├── Turnos                  (vem de /dp/cadastros/turnos)
└── Documentos Obrigatórios (vem de /dp/cadastros/documentos-exigidos)
```

O menu **Cadastro** cai de 8 para 6 itens: Colaboradores, Cargos e Salários, Unidades, Sindicatos, Benefícios, Pendências.

## Turnos

- Os turnos de **jornada do colaborador** (almoço, jantar, abertura, fechamento) passam a viver na aba Turnos dentro de Cargos e Salários — é lá que se define o que o cargo trabalha.
- Os **horários de funcionamento da loja** continuam onde estão: dentro de Unidades, aba Funcionamento. Nada muda ali.
- Para não confundir os dois conceitos, a aba nova leva o subtítulo "Turnos de jornada dos colaboradores. O horário de funcionamento da loja fica em Unidades", com atalho para Unidades.

## Documentos Obrigatórios

- A tela troca de nome: "Documentos exigidos" passa a ser **Documentos Obrigatórios** (Title Case) em todo o sistema.
- As **regras** (quais documentos são obrigatórios, por cargo/unidade, se exige validade, etc.) ficam nesta aba — é o único lugar de edição das regras.
- Na ficha do colaborador continua aparecendo **somente os documentos dele** (checklist do que entregou/falta), sem edição de regra. Ganha um atalho "Gerenciar Documentos Obrigatórios" que abre esta aba já com o contexto do cargo do colaborador.

## Compatibilidade de links

As rotas antigas continuam funcionando por redirecionamento, para não quebrar favoritos e atalhos já salvos:

- `/dp/cadastros/turnos` → `/dp/cadastros/cargos?aba=turnos`
- `/dp/turnos` → mesmo destino
- `/dp/cadastros/documentos-exigidos` → `/dp/cadastros/cargos?aba=documentos`

## Detalhes técnicos

- `src/pages/dp/DpCargos.tsx`: adicionar as abas `turnos` e `documentos` ao `DpTabsBar` já existente, controladas pela mesma query string `?aba=`.
- Extrair o conteúdo de `src/pages/dp/cadastros/DpTurnos.tsx` e `DpDocumentosExigidos.tsx` para painéis (`TurnosPanel`, `DocumentosObrigatoriosPanel`) em `src/components/dp/cargos/`, mantendo hooks, diálogos e lógica atuais sem alteração de comportamento. As páginas antigas deixam de existir como rota própria.
- `src/App.tsx`: trocar as duas rotas por `Navigate` com a query string correspondente.
- `src/config/dpNavigation.tsx`: remover os itens Turnos e Documentos exigidos do grupo Cadastro.
- `src/pages/dp/DpCadastrosHub.tsx`: remover o card de Turnos (ou apontar para a nova aba) e ajustar o card de Cargos e Salários para citar turnos e documentos.
- `src/lib/dp/favoritablePages.ts`: atualizar rótulos/rotas favoritáveis.
- `src/components/dp/documentos/ColaboradorDocumentosPanel.tsx`: atualizar o link para a nova aba e o rótulo do atalho.
- `src/components/dp/cargos/ComplementosSalariaisPanel.tsx`: o atalho de Adicional Noturno passa a apontar para a aba interna de Turnos.
- `src/hooks/useDpPendenciasColaborador.tsx`: atualizar a rota do item de pendência `documentos-exigidos`.
- Nenhuma mudança de banco de dados: `dp_turnos` e `dp_documento_requisitos` seguem iguais.
- Revisar títulos tocados para Title Case.
