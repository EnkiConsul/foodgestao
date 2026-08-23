# Regras de Folgas: base única, folga CLT automática e troca de folga

Quatro ajustes na aba **Regras** de Folgas (`/dp/folgas?aba=regras`).

## 1. Um único campo de base da regra

Hoje há dois campos que dizem quase a mesma coisa: "Base do descanso dominical" e "Base da regra de DSR". Passam a ser **um só**: "Base da regra de folgas", com três opções:

- **CLT (padrão legal)** — descanso é o domingo estrito, e as frequências (geral e mulheres, Art. 386) voltam automaticamente ao padrão CLT do setor e ficam travadas.
- **Acordo / convenção coletiva** — libera os dias de descanso negociados e as frequências.
- **Política própria da empresa** — igual à anterior, com registro de ciência quando menos protetiva.

Comportamento: ao escolher CLT, os campos de frequência abaixo são redefinidos para o padrão CLT na hora (sem precisar salvar antes) e ficam somente leitura; o bloco "Dias de descanso negociados" desaparece. Ao sair de CLT, os dias negociados aparecem já com domingo marcado.

## 2. Replicar para outras unidades só no momento de salvar

A lista de checkboxes "Aplicar a mesma regra também em" sai do corpo do formulário. Ao clicar em **Salvar**, abre um diálogo:

```text
┌ Salvar Regras De Folgas ─────────────────────────────┐
│ As regras serão salvas em: Pakerê Garavelo           │
│ Aplicar também em (opcional):                        │
│   ☐ Pakerê T-63 (ainda não configurada)              │
│   ☐ Buriti                                           │
│   [Selecionar todas] [Limpar seleção]                │
│                        [Cancelar] [Salvar em 1 unid.]│
└──────────────────────────────────────────────────────┘
```

Se houver apenas uma unidade, o diálogo é dispensado e o salvamento é direto. O alerta de ciência legal continua aparecendo depois da confirmação, como hoje.

## 3. Folga dominical automática no modo CLT

Quando a unidade segue CLT, o colaborador **não marca** a folga dominical: o sistema gera as folgas dominicais a partir da data de admissão, na frequência da regra (com a variação de mulheres do Art. 386).

- As folgas geradas ficam gravadas no calendário como origem "automática (CLT)", contando na Operação, na Conformidade e no portal.
- No portal, esses domingos aparecem bloqueados para edição, com a nota "Folga definida pela CLT".
- O colaborador continua podendo: **solicitar troca com um colega** ou **solicitar mudança do dia** (ex.: domingo → sábado) para aprovação do admin. Ambas passam pelos fluxos já existentes de Trocas e Solicitações.
- Na tela de admin, um botão "Gerar folgas CLT" por unidade/mês cobre colaboradores novos e o mês seguinte; a geração é idempotente (não duplica).

## 4. Regra de troca de folga da unidade

Novo campo na regra da unidade, "Troca de folga entre colaboradores", com três opções:

- **Direta** — vale quando o colega aceita, sem passar pelo gestor.
- **Com aprovação do admin** (padrão) — depois do colega aceitar, ainda precisa do gestor.
- **Não permitida** — a unidade não aceita troca entre colaboradores; só mudança solicitada ao admin.

A regra é aplicada de verdade: no portal o botão de troca fica indisponível quando "não permitida" (com o motivo), e quando "direta" a troca é concluída no aceite do colega, sem etapa de gestor. A tela de Trocas do DP mostra o modo vigente da unidade.

## Detalhes técnicos

- Banco: em `dp_config_dp`, adicionar `troca_folga_modo text not null default 'aprovacao_admin'` (valores `direta` | `aprovacao_admin` | `proibida`) e manter `tipo_descanso_domingo` derivado de `regra_dsr` (`clt` → `legal`, senão `acordo_coletivo`) para não quebrar o motor atual. Em `dp_folgas`, usar `origem` = `automatica_clt` (enum `dp_folga_origem`) para as folgas geradas.
- `src/lib/dp/dsr-rules.ts`: função `aplicarBaseRegra(form, base)` centralizando o reset CLT (já existe `padroesCltDe`) e sincronizando `tipo_descanso_domingo`/`dias_descanso_negociados`.
- Novo `src/lib/dp/folgas-clt.ts`: dado admissão, mês/ano e regra efetiva, retorna os domingos de DSR do colaborador (usa `semanasEfetivas`/`semanasEfetivasMulher` e o gênero). Coberto por testes unitários em `src/test/unit/`.
- `src/pages/dp/cadastros/DpConfiguracoesJornada.tsx`: remove o card de replicação, cria `SalvarRegrasDialog`, unifica os dois selects, adiciona o campo de troca de folga.
- `src/hooks/useDpConfigDp.tsx`: `saveMany` já aceita lista de alvos — segue igual, chamado a partir do diálogo.
- `src/pages/dp/portal/DpMeuCalendario.tsx`: bloqueia edição em domingos com `origem = automatica_clt`, mantém os botões de troca/solicitação conforme `troca_folga_modo`.
- `src/pages/dp/portal/DpMeuTrocas.tsx` e `src/hooks/useDpTrocas.tsx`: no modo `direta`, o aceite do colega grava `status = 'aprovada'` em vez de `pendente_gestor`.
- Geração das folgas CLT: RPC no banco (`dp_gerar_folgas_clt(unidade, ano, mes)`) para rodar em lote com segurança de RLS, acionada pelo botão no admin.
