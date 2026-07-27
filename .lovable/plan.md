## Objetivo

Refinar a tela **Regras de Folgas** (`/dp/folgas/configuracoes/regras`) e fazer o calendário do portal do colaborador respeitar os dias negociados e a frequência configurada.

---

## 1. Dias de descanso negociados — ordem Seg → Dom

Hoje os chips aparecem como Dom, Seg, Ter… Sáb. Passam a aparecer **Seg, Ter, Qua, Qui, Sex, Sáb, Dom**. Só a ordem de exibição muda — o valor gravado continua sendo o número do dia da semana (0 = domingo), então nada quebra no motor de escala nem na conformidade.

## 2. Remover o vínculo com acordo sindical

- Some o campo **"Acordo / convenção vinculada"** e a validação que obrigava escolher uma negociação para salvar no modo acordo coletivo.
- O modo "Acordo coletivo (dias negociados)" continua existindo; passa a exigir apenas **ao menos um dia negociado marcado**.
- A coluna `negociacao_id` permanece no banco (histórico), apenas deixa de ser editada e enviada pela tela.

## 3. Sinalização "Menos protetiva" com base legal

O badge vermelho ganha um ícone **"i"** ao lado que abre um popover explicando **por que** aquela escolha é menos protetiva, com a base legal correspondente:

- **Regra geral** — Lei 10.101/2000, art. 6º, parágrafo único (comércio: 1 domingo a cada 3 semanas); demais setores: 1 a cada 7 semanas, prática consolidada na jurisprudência (a Portaria 417/1966 foi revogada pela Portaria MTP 671/2021).
- **Mulheres** — Art. 386 da CLT: folga dominical quinzenal.

O popover mostra: valor configurado × padrão legal, a fonte legal e o aviso de que salvar exige confirmação de ciência (o diálogo de ciência atual continua no fluxo de salvar).

A sinalização passa a aparecer nos **quatro** campos: semanas (geral), domingos por mês (geral), semanas (mulheres) e domingos por mês (mulheres) — hoje a versão feminina só é avaliada quando existem colaboradoras; o badge passa a aparecer sempre que a configuração for menos protetiva, mantendo o diálogo de ciência condicionado à existência de mulheres.

## 4. "Base da regra de DSR" no topo, com trava CLT

O seletor **Base da regra de DSR** (CLT / Acordo-Convenção / Política própria) sai do fim do bloco e vai para o **início da seção "Folga dominical (DSR)"**, antes do toggle de comércio.

Comportamento vinculado:

- Escolher **CLT** → os campos de frequência voltam ao padrão legal automaticamente: modo "a cada X semanas", geral = 3 ou 7 (conforme o setor), mulheres = 2. Os campos de frequência ficam **somente leitura**, com nota "Valores fixados pelo padrão CLT — mude a base da regra para editar".
- Alterar qualquer frequência para valor diferente do padrão CLT só é possível em **Acordo/Convenção coletiva** ou **Política própria**. Se a base estiver em CLT e o usuário tentar editar, o campo está travado — não há estado inconsistente possível.
- Ao sair de CLT, os campos destravam mantendo os valores atuais.

## 5. Calendário do colaborador guiado pelas regras

Hoje o portal só libera **sábado e domingo** para o colaborador marcar folga (regra fixa no código), e o teto mensal é o `folgas_fds_por_mes`.

Passa a ser:

- **Dias elegíveis** = dias de descanso negociados da regra aplicável (no modo legislação, apenas domingo + sábado como hoje). Um dia não elegível aparece como "não disponível para folga", com o motivo.
- **Teto mensal** = derivado da frequência configurada (ex.: "1 domingo por mês" limita a 1 domingo marcado no mês; "a cada 3 semanas" limita conforme o intervalo), somado ao teto de `folgas_fds_por_mes` já existente. O menor dos dois prevalece.
- A regra usada é a **da unidade do colaborador**, com fallback para a regra padrão da empresa.

Isso vale para as três superfícies do calendário: `/dp/meu/calendario`, o formulário de solicitação do portal e o calendário compartilhado usado pelo admin.

---

## Detalhes técnicos

- `src/lib/dp/dsr-rules.ts`: exportar `ORDEM_DIAS_SEG_DOM` (ordem de exibição), `baseLegalDe(campo)` retornando `{ titulo, texto, fonte }` para o popover, e `padroesCltDe(setorComercio)` para o reset do modo CLT.
- `src/pages/dp/cadastros/DpConfiguracoesJornada.tsx`: reordenar os chips; remover o Select de negociação e sua validação; extrair um componente local `MenosProtetivaBadge` (Badge + `Popover` do shadcn com o texto legal) reutilizado nos 4 campos; mover o Select `regra_dsr` para o topo da seção DSR com o handler de reset/trava (`disabled` nos inputs quando `regra_dsr === "clt"`).
- `src/hooks/useDpConfigDp.tsx`: parar de enviar `negociacao_id` no payload (mantém a coluna); remover a query `negociacoes` se ficar sem uso na tela.
- `src/lib/dp/folga-rules.ts`: `calculateDateStatus` passa a receber `diasElegiveis?: number[]` e `tetoMensal?: number`, substituindo a checagem fixa de fim de semana e usando o menor teto.
- `src/pages/dp/portal/DpMeuCalendario.tsx`, `src/pages/dp/portal/DpMeuSolicitacoes.tsx` e `src/components/dp/FolgaCalendarShared.tsx`: consumir `useDpConfigDp(unidadeDoColaborador)` e repassar `diasElegiveis` / `tetoMensal`.
- Testes: estender `src/lib/dp/__tests__/dsr-rules.test.ts` (padrões CLT, base legal) e adicionar casos de `calculateDateStatus` com dias elegíveis fora do fim de semana.
- Sem migração de banco — nenhuma coluna nova é necessária.
