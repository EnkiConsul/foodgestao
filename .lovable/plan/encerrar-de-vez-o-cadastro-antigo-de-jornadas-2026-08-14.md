# Encerrar de vez o cadastro antigo de Jornadas

A tela `/dp/cadastros/jornadas` já está marcada como legado: o horário previsto hoje nasce de Turnos → Configuração de trabalho do colaborador → Escala do mês. Como ela não é mais usada, será removida por completo do sistema (menu, rota e tela).

## O que muda para o usuário

- O item "Configurações de Jornada" desaparece do menu lateral do DP e da lista de atalhos do menu "Mais" no mobile.
- O card "Jornadas e escalas" sai do hub de Cadastros.
- Quem tentar abrir o endereço antigo cai na página de "não encontrado" — não haverá mais tela de jornadas.
- Nenhum dado é apagado no banco: os vínculos antigos continuam armazenados e o gerador de escala segue lendo jornadas antigas quando existirem, sem qualquer mudança de comportamento.

## Detalhes técnicos

- `src/config/dpNavigation.tsx`: remover o item `Configurações de Jornada` do grupo `cadastro` (isso também elimina o atalho mobile, derivado do mesmo arquivo).
- `src/pages/dp/DpCadastrosHub.tsx`: remover o card que aponta para `/dp/cadastros/jornadas`.
- `src/App.tsx`: remover a rota `cadastros/jornadas` e o import lazy de `DpCadastroJornadas`.
- Excluir os arquivos que ficam sem uso: `src/pages/dp/cadastros/DpCadastroJornadas.tsx`, `src/components/dp/JornadaTemplates.tsx` e `src/hooks/useDpJornadas.tsx` (usado somente por essa tela).
- Manter intactos: tabelas `dp_jornadas` / `dp_jornada_horarios` / `dp_colaborador_jornadas`, os utilitários `src/lib/dp/jornada-utils.ts` e a leitura de jornadas em `src/pages/dp/DpEscalas.tsx` (Gerar Escala).
- Rodar os testes de paridade de navegação (`src/config/mobileNav.parity.test.ts`) e o typecheck para garantir que nada mais referencia a rota.
