# Pente fino no Portal do Colaborador

Revisão do portal (`/dp/meu`) para priorizar o que a empresa envia, deixar títulos claros, simplificar os quadros e ajustar atalhos e menu ao tipo de vínculo. Nada de regra de negócio, banco, permissão ou isolamento entre empresas muda.

## 1. Meus documentos — prioridade e títulos

- Ordem da tela: primeiro **Documentos recebidos da empresa**, depois **Documentos que eu preciso enviar** (o checklist que hoje vem no topo), e por último meus envios.
- Título de cada documento passa a ser **tipo · competência** — ex.: "Contracheque · 08/2026". O nome do arquivo enviado aparece em letra pequena embaixo, sem competir com o assunto.
- Quando não houver competência, usa a data de envio ("Contracheque · enviado em 05/09/2026").
- Documentos que a empresa manda ganham selo "Novo" até serem abertos/confirmados.

## 2. Confirmação de recebimento mais clara

- Botão passa a ser **"Confirmar Documento"**.
- Ao clicar, abre uma confirmação curta explicando: "Você confirma que recebeu e leu este documento. Isso não confirma valores nem pagamento."
- O selo depois da confirmação vira "Documento confirmado em dd/mm".

## 3. Pendências em destaque no início

- O card **Minhas Pendências** sobe para o topo da página inicial, logo depois da saudação, antes dos cartões de resumo.
- Quando não há pendência, ele encolhe em uma faixa fina "Tudo em dia", para não roubar espaço.

## 4. Unificar "Últimos Avisos" com "Meus Avisos e Notificações"

- Um único quadro **Avisos e Notificações**, com as duas fontes juntas, ordenadas por data, cada item marcado com sua origem (Mural da empresa / Aviso pessoal) e estado lido/não lido.
- Clicar em um item leva ao destino certo (mural ou tela relacionada) e marca como lido, como já acontece hoje.
- Contador único de não lidos no cabeçalho do quadro.

## 5. Aniversariantes no portal

- No portal aparecem: **aniversários de nascimento dos colegas da mesma unidade** e **o próprio aniversário de contratação** do colaborador.
- Aniversário de contratação de colegas deixa de aparecer no portal. A tela administrativa continua exatamente como é hoje.

## 6. Atalhos da barra inferior

- No portal, os atalhos deixam de apontar para Financeiro e para a área administrativa de Pessoas. Passam a ser **Documentos** e **Rotina da loja**.
- O botão do Hub de módulos só aparece se o colaborador realmente tiver acesso a outro módulo; caso contrário, aquele espaço vira o atalho do portal. O mesmo vale para o botão "Hub" no topo.

## 7. Nova tela: Rotina da loja (somente leitura)

- Nova tela no portal mostrando **quem está escalado hoje na unidade do colaborador**, agrupado por turno e função, com horário previsto.
- Somente leitura: sem editar escala, sem cobrir ninguém, sem ver salário ou dado pessoal — apenas nome, função, turno e horário.
- Respeita a unidade do colaborador e a empresa dele.

## 8. Escala e convocações conforme o vínculo

- **Convocações** passam a aparecer no menu do portal apenas para quem pode ser convocado (intermitente/folguista). Para colaborador fixo, como o Nordman, o item desaparece do menu e da busca.
- **Minha Escala** continua visível para todos.

## 9. Nomes sem caixa alta

- Nomes de pessoas passam a ser exibidos em "Primeira Letra Maiúscula", com preposições em minúsculas, reaproveitando a função de nomes próprios já usada no financeiro. Aplica-se à saudação, listas, aniversariantes, rotina da loja e cabeçalhos do portal. Os dados gravados não mudam.

## 10. Pente fino nas demais telas do portal


## 11. Card "Próxima folga" com qualquer folga

- Hoje o card só encontra a folga quando ela está lançada como folga confirmada; a folga semanal fixa (quarta-feira, no caso do Nordman) não aparece.
- Passa a mostrar a próxima folga futura de qualquer origem: folga semanal da escala, folga dominical, folga escolhida, folga extra aprovada e feriado/dispensa — a que vier primeiro, com o motivo em letra pequena ("Folga semanal", "Folga dominical" etc.).

## 12. Ações de folga sem depender de colega

Na folga semanal e na dominical, o colaborador passa a ter três caminhos, mesmo sem colega disponível:

- **Trocar com um colega** — como hoje, quando existir colega elegível.
- **Pedir troca do dia ao gestor** — sem colega envolvido: escolhe o novo dia, justifica e o gestor aprova.
- **Pedir folga extra ao gestor** — dia adicional, com justificativa e aprovação.

Na folga dominical, além dessas, **pedir exceção** para datas bloqueadas ou lotadas. Ao pedir exceção, o sistema pergunta se é **exceção para folga extra** ou **exceção para marcar a folga dominical**, e o pedido segue para o gestor com esse motivo registrado. Limites, bloqueios, lotação e regras de DSR continuam valendo — a exceção não fura a regra sozinha, ela pede autorização.

## 13. Jornada e ponto no portal

- "Sem jornada prevista" ganha explicação clara: quando o dia é folga, diz "Hoje é sua folga"; quando não há horário configurado, diz "Sem horário definido para hoje — fale com seu gestor".
- O botão de problema com ponto só aparece quando a unidade do colaborador realmente registra ponto. Quando não registra, ele é substituído por **"Registrar ocorrência de pontualidade"**, permitindo informar atraso na entrada ou no retorno do intervalo mesmo sem marcação.
- Os rótulos deixam de ser só no futuro. Cada ação pergunta se **já aconteceu** ou **vai acontecer**: "Cheguei atrasado / Vou me atrasar", "Faltei / Não poderei comparecer", "Saí antes / Vou sair antes". O registro guarda essa diferença, e o texto que o gestor vê acompanha ("Atrasou 20 min" x "Prevê atraso de 20 min").

## 10. Pente fino nas demais telas do portal

Revisão das 13 telas do portal para corrigir inconsistências do mesmo tipo: títulos que repetem nome de arquivo, textos em caixa alta, botões com rótulo ambíguo, quadros vazios sem mensagem, e telas que aparecem para quem não tem o assunto (ex.: Folha de Ponto quando o colaborador não usa ponto). Cada ajuste encontrado é listado no fim, com antes/depois.


## Detalhes técnicos

- Arquivos previstos: `src/pages/dp/portal/DpMeuHome.tsx`, `DpMeuDocumentos.tsx`, `src/hooks/portal/useMeusDocumentos.tsx` (rótulo do título), `src/components/dp/home/MinhasNotificacoesCard.tsx` (vira quadro unificado), `MinhasPendenciasCard.tsx`, `AniversariantesCard.tsx` (variante portal), `src/config/mobileNav.tsx` (atalhos do portal), `src/config/dpNavigation.tsx` (visibilidade de Convocações), `src/components/dp/DpHeader.tsx` (botão Hub condicional), nova página da Rotina da loja + rota, e `src/lib/text/properName.ts` reaproveitado.
- Elegibilidade a convocação e módulos disponíveis são lidos por consulta já existente (regime do colaborador e `company_modules`/`can_use_module`), sem nova tabela ou migração.
- Testes: rótulo de título/competência, quadro unificado ordenado por data, filtro de aniversariantes por unidade e tipo, visibilidade de Convocações por regime, e nomes em caixa mista. Typecheck e a suíte de Pessoas rodam ao final; verificação visual em 360 px e desktop.
- Sem migração de banco; rollback é reverter os arquivos citados.
