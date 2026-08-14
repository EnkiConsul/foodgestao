# Cadastro do Colaborador em tela única (3 abas)

Unificar o cadastro do colaborador em um único diálogo com três abas: **Dados**, **Turno & Jornada** e **Remuneração**. Além disso, calcular o valor da hora automaticamente a partir de base salarial ÷ base de horas (útil para intermitentes) e incluir **prêmio de assiduidade/pontualidade**.

## Como a tela fica

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ Editar colaborador · Maria Souza            [ CLT intermitente ] [ X ]   │
├──────────────────────────────────────────────────────────────────────────┤
│ ( Dados )   ( Turno & Jornada )   ( Remuneração )        3 de 3 completos│
├──────────────────────────────────────────────────────────────────────────┤
│  ABA 1 — DADOS                                                          │
│  Nome*            CPF*             Nascimento      Telefone             │
│  Unidade*         Cargo*           Vínculo*        Admissão*            │
│  E-mail           Acesso ao portal [on]   Observações                   │
├──────────────────────────────────────────────────────────────────────────┤
│  ABA 2 — TURNO & JORNADA   (conteúdo atual de Configuração de Trabalho) │
│  Unidade da escala      Turno padrão  [ Noite 18:00–23:20  ▾ ] [+ Novo] │
│  Folga variável [on]    Vigência a partir de [14/08/2026]               │
│  Dom Seg Ter Qua Qui Sex Sáb  → trabalha? / turno do dia                │
│  Carga semanal: 36h00  ✓ dentro do limite legal                         │
│  [ Copiar de outro colaborador ]        Histórico de vigências ▾        │
├──────────────────────────────────────────────────────────────────────────┤
│  ABA 3 — REMUNERAÇÃO                                                    │
│  Forma de pagamento* [ Horista ▾ ]   (opções conforme o vínculo)        │
│  ┌ Base de cálculo da hora ──────────────────────────────────────────┐  │
│  │ Base salarial [ 2.200,00 ]  ÷  Base de horas/mês [ 220 ]          │  │
│  │ = Valor da hora calculado: R$ 10,00     [ usar valor manual ]     │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│  Dependentes IRRF [0]     Adicional insal./peric. (%) [0]               │
│  ┌ Assiduidade e pontualidade ───────────────────────────────────────┐  │
│  │ Prêmio de assiduidade [on]   Valor mensal [ 150,00 ]              │  │
│  │ Critério: (•) Sem faltas e sem atrasos                            │  │
│  │           ( ) Sem faltas (atrasos tolerados)                      │  │
│  │           ( ) Perde proporcional por ocorrência                   │  │
│  │ Tolerância de atraso: [10] min/dia · máx. [2] atrasos no mês      │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│  Vale-transporte [on] · Valor/dia [10,40] → mês R$ 228,80 / desc. 6%   │
│  Benefícios: ☑ VR  ☐ Plano de saúde  ☐ Cesta                           │
├──────────────────────────────────────────────────────────────────────────┤
│ Pendências: nenhuma                        [ Cancelar ]  [ Salvar ]     │
└──────────────────────────────────────────────────────────────────────────┘
```

Comportamento:
- Diálogo mais largo (`max-w-4xl`), abas no topo, rodapé único com **Salvar** salvando tudo de uma vez.
- Ao **criar** um colaborador novo, as abas 2 e 3 ficam habilitadas mas a jornada só é persistida após o registro existir: salva-se dados + remuneração e, na sequência, a configuração de trabalho.
- Indicador por aba (ponto laranja) quando houver campo obrigatório pendente naquela aba.
- Em mobile as abas viram scroll horizontal; o conteúdo continua em coluna única.

## Cálculo automático do valor da hora

- Novos campos: **base salarial** e **base de horas/mês** (padrão 220; sugestões 220/200/180).
- `valor_hora = base_salarial / base_horas`, arredondado em 2 casas, recalculado a cada digitação.
- Botão "usar valor manual" permite sobrepor o cálculo; nesse caso a base fica só como referência.
- Para diarista, a mesma caixa vira base salarial ÷ dias/mês (padrão 30) → valor do dia.
- Regras centralizadas em `src/lib/dp/remuneracao.ts` (função pura + testes), sem cálculo inline em tela.

## Assiduidade e pontualidade

- Campos por colaborador: prêmio ativo, valor mensal, critério (sem faltas e atrasos / sem faltas / proporcional), tolerância de atraso em minutos e máximo de atrasos.
- Gravados no cadastro e usados depois pela folha/ponto (módulos hoje em desenvolvimento) — nesta fase apenas cadastro + exibição, sem alterar a geração de folha.

## Detalhes técnicos

- Migração em `dp_colaboradores`: `base_salarial numeric`, `base_horas_mes numeric default 220`, `valor_hora_manual boolean default false`, `premio_assiduidade boolean default false`, `premio_assiduidade_valor numeric`, `assiduidade_criterio text` (check nos 3 valores), `assiduidade_tolerancia_min int default 0`, `assiduidade_max_atrasos int`.
- `ColaboradorFormDialog.tsx`: passa a usar `Tabs`; conteúdo de dados extraído para `ColaboradorDadosTab.tsx`, jornada para `ColaboradorJornadaTab.tsx` (corpo reaproveitado de `ColaboradorConfigTrabalhoDialog.tsx`), remuneração continua em `RemuneracaoFields.tsx` acrescido dos blocos novos.
- `ColaboradorConfigTrabalhoDialog.tsx` passa a ser um wrapper fino que abre o formulário unificado na aba de jornada, preservando o atalho existente na listagem `DpColaboradores.tsx`.
- Nenhuma mudança em RLS; salvamento continua pelos hooks atuais (`useDpColaboradores`, `useDpColaboradorConfigTrabalho`).
