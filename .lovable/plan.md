# Revisar e publicar: focar nos dias com alerta

Quando a convocação tem dias em cima da hora, a tela de revisão hoje mostra todos os dias abertos e o gestor precisa rolar procurando onde escrever a justificativa. Vamos deixar em evidência só o que exige atenção.

## O que muda

1. **Dias sem alerta ficam recolhidos**
   Na lista "Como o colaborador vai receber", cada dia passa a ser uma linha recolhível.
   - Dias com alerta (em cima da hora, ninguém apto ou pessoa sem horário) já aparecem abertos.
   - Dias sem nenhuma observação aparecem recolhidos, mostrando data, cargo, vagas e horário; um toque abre a lista de pessoas.
   - Se nenhum dia tiver alerta, tudo segue aberto como hoje.
   - Contador no topo da seção: "3 dia(s) precisam de atenção · 5 sem observação", com um botão para abrir ou recolher todos.

2. **Rolagem automática para a justificativa**
   Ao entrar em "Revisar e publicar" com dias em cima da hora, a tela rola até o bloco amarelo "Convocação em cima da hora" e destaca o primeiro campo de justificativa. No celular a rolagem acontece dentro do próprio modal, deixando o campo visível acima do teclado.

3. **Publicar com pendência avisa e rola de volta**
   Se o gestor tocar em "Confirmar e publicar" sem marcar a ciência ou sem preencher alguma justificativa, além do aviso a tela rola até o primeiro campo faltante e o marca em vermelho.

## Detalhes técnicos

- `src/components/dp/convocacoes/RevisaoConvocacao.tsx`
  - Estado local `abertos: Record<string, boolean>` por chave `cargo_id|data`; valor inicial derivado de `precisaAtencao(dia)` = `abaixoDaAntecedencia` OU nenhum apto na pré-avaliação OU alguma linha sem horário.
  - Cabeçalho do dia vira `button` com `aria-expanded`; corpo (`Alert` + `ul` de pessoas) só renderiza quando aberto. Badges continuam visíveis no cabeçalho recolhido.
  - Recalcular o valor inicial quando `preAvaliacaoCarregando` terminar (dias que só viram "sem apto" depois da resposta do banco).
  - `ref` no bloco de exceção + `useEffect` com `scrollIntoView({ block: "start", behavior: "smooth" })` quando `diasEmCimaDaHora.length > 0`, disparado uma vez por montagem da revisão; `focus()` no primeiro `Textarea` sem valor apenas em telas largas (evita abrir o teclado sozinho no celular).
  - Nova prop opcional `focoPendenteId` para destacar/rolar até o campo faltante.
- `src/components/dp/convocacoes/NovaConvocacaoPlanner.tsx`: na tentativa de publicar bloqueada, definir `focoPendenteId` com o primeiro dia sem justificativa (ou `"ciente"`), além do toast atual.
- Validação com Playwright em viewport de celular (390x844) no rascunho da Pakerê: abrir "Revisar e publicar", conferir que só os dias com alerta estão abertos e que a tela já chega no bloco de justificativa.
