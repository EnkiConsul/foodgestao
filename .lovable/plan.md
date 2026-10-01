# Ajustes da Reunião com a Samanta (Praianos)

Itens já resolvidos e fora deste plano: modelo de mensagem de acesso ao Portal para todas as empresas, e o erro ao aprovar contracheques de 08 (envio em blocos).

Observação: o congelamento de versão está ativo. As mudanças abaixo só chegam ao site oficial depois de publicar.

## Fase 1 — Erros que Atrapalham o Uso (Prioridade)

1. **CNPJ do sindicato perde o cursor a cada dígito** na ficha do colaborador — corrigir o campo para não ser recriado a cada tecla.
2. **Cadastrar regra de tempo de casa pela ficha fecha a tela sem salvar nem avisar** — manter a ficha aberta, salvar a regra e mostrar confirmação (ou o motivo do erro).
3. **Mensagem de aniversário oferece modelos de ano de casa e de acesso ao Portal** — mostrar só os modelos do tipo da ocasião (aniversário, tempo de casa, acesso).
4. **Tela de documentos duplicados corta no computador e no celular** — janela com rolagem interna e botões sempre visíveis.
5. **Lote de folha de ponto aparece como "Parcial"** — conferir o lote da Samanta e corrigir a contagem (ou explicar na tela o que falta).

## Fase 2 — Clareza das Telas

6. **Nova condição x correção de cadastro**: trocar os dois blocos por opções de marcar (bolinhas) com título e explicação curta de cada uma.
7. **Data-base do sindicato só com dia e mês**, sem ano.
8. **Sindicato laboral fácil de achar**: atalho em Cadastros e na ficha do colaborador ("Cadastrar Sindicato").
9. **"Possui folha de ponto" vai para a aba Turno & Jornada**, saindo de Dados.
10. **Unidade com folha de ponto**: quando a unidade tem colaboradores com folha de ponto e a opção da unidade está desmarcada, mostrar aviso com botão para marcar.
11. **Adicional por tempo de serviço**: permitir ciclos maiores que o quinquênio (ex.: a cada 10 anos ou número livre de anos) e "acumular a cada ciclo" desmarcado por padrão.

## Fase 3 — Importação de Fichas e Documentos

12. **Horário da ficha diferente do cadastro**: ao alterar o horário lido na ficha, mostrar aviso "Horário Diferente da Ficha" com o horário original para conferência.
13. **Sindicato lido na ficha**: sugerir o sindicato cadastrado correspondente ou oferecer "Cadastrar Este Sindicato" já preenchido.
14. **Histórico de férias e afastamentos da ficha**: listar o que foi lido e oferecer "Importar Histórico" (férias gozadas e afastamentos com datas), com conferência antes de gravar.
15. **Histórico de advertências da ficha**: sugerir lançar no Dossiê Disciplinar como registro interno (sem notificar o colaborador).
16. **Folha de ponto com pessoas a mais**: além de "Faltando", mostrar a lista "Sem Cadastro no Sistema" com botão "Criar Cadastro" usando nome e CPF lidos da página.

## Perguntas em Aberto (Resposta Antes de Implementar)

- **Pagamento por conta salário**: hoje existe a forma de pagamento; falta confirmar se precisa guardar banco, agência e conta do colaborador.
- **Samanta administradora e colaboradora**: ela entra com o mesmo login e alterna entre a área de gestão e o Portal do Colaborador. Confirmar se ela deve poder ver os próprios dados sensíveis pela gestão.
- **Mulheres com 1 ou 2 domingos de folga por mês**: proposta de campo "Domingos de Folga por Mês" na ficha (padrão pela lei: 1 a cada 15 dias para mulheres, Art. 386 da CLT), usado na escala. Confirmar se é por colaboradora ou por cargo/unidade.

## Detalhes Técnicos

- Itens 1–5 começam por reproduzir o erro e consultar os dados reais; a causa ainda não foi confirmada.
- Item 13–16 ampliam a leitura da ficha (`dados_extraidos`) e a revisão em `FichaRevisaoCard`; gravações passam por rotinas do servidor com checagem de permissão e sem duplicar (idempotentes).
- Item 16 reaproveita o fluxo de cadastro manual com CPF/nome pré-preenchidos.
- Item 11 exige pequena mudança no banco (ciclo em anos livre), reversível.
- Ao final de cada fase: verificação de tipos e testes passando.
