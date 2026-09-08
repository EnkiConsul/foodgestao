# Pessoas 360° — Fase 3 (continuação): Limpeza da Folha, Freelancer e CLT Parcial

## Onde estamos no plano mestre

Da Fase 3 (Vínculos, Remuneração, Freelancer e Recontratação) já entregue:

- Item 2 — Alterar Condições de Trabalho com vigência e histórico;
- Item 7 — Visão unificada Todos | Colaboradores | Folguistas | Em Teste;
- Item 5 — Transformar folguista/em teste em colaborador (botão já disponível);
- Item 6 — Reintegrar/Recontratar (ações já existentes na tela de desligados).

Restam três itens, que formam esta etapa:

## 1. Remover referências visíveis à Folha de Pagamento

As telas `/dp/folha*` já redirecionam para `/dp`, mas ainda há textos soltos que sugerem que a plataforma "gera folha". A varredura confirmou ocorrências em:

- `src/pages/dp/DpFolha.tsx`, `DpFolhaRelatorios.tsx`, `DpFolhaProvisoes.tsx`, `DpRescisoes.tsx` (páginas legadas — ajustar textos de redirecionamento);
- `src/hooks/useDpBeneficios.tsx` (mensagem sobre folha);
- `src/lib/modules.ts` e `ModuloEmDesenvolvimentoGate.tsx` (rótulos de módulo).

Ações:

- Revisar cada texto e trocar por linguagem correta (ex.: "a folha é gerada pela contabilidade; aqui você acompanha ponto e documentos");
- Ampliar a busca por variações ("gerar folha", "calcular folha", placeholders e tooltips);
- Não tocar em: Folha de Ponto, batidas, espelho, remuneração contratual, contracheques importados.

## 2. Freelancer sem regras de CLT

No cadastro/edição com vínculo Freelancer:

- Não exigir sindicato, salário-base CLT/piso sindical nem benefícios de CLT;
- Não aplicar regras de adiantamento salarial CLT;
- Permitir "Remuneração Acordada" com formas flexíveis: fixo, por hora, por diária, semanal, mensal, por turno, por serviço/acordo;
- Manter Cargo apenas como identificação da atividade.

Arquivos: `ColaboradorFormDialog.tsx`, `RemuneracaoFields.tsx`, `src/lib/dp/contrato-policy.ts`, `src/lib/dp/cadastro-completude.ts` (para o selo de "cadastro incompleto" não cobrar campos CLT de freelancer).

## 3. CLT em Regime de Tempo Parcial

- Separar **Salário de Referência do Cargo** (piso/padrão, não muda por colaborador) de **Remuneração Contratual do Colaborador**;
- Permitir remuneração contratual proporcional (ex.: 30h, 25h) diferente da referência do cargo, sem sobrescrever o cargo;
- Garantir que a regra de "cadastro incompleto" e as telas de remuneração respeitem essa separação.

## Critérios de aceite

- Nenhuma tela afirma que a plataforma gera Folha de Pagamento; Folha de Ponto intacta.
- Freelancer salva sem sindicato, piso ou benefícios CLT e sem selo indevido de cadastro incompleto.
- CLT parcial tem remuneração contratual própria sem alterar o salário de referência do cargo.
- Build, typecheck e testes unitários passando.

## Detalhes técnicos

- Arquivos: `src/pages/dp/DpFolha*.tsx`, `src/pages/dp/DpRescisoes.tsx`, `src/hooks/useDpBeneficios.tsx`, `src/lib/modules.ts`, `src/components/dp/ModuloEmDesenvolvimentoGate.tsx`, `src/components/dp/ColaboradorFormDialog.tsx`, `src/components/dp/RemuneracaoFields.tsx`, `src/lib/dp/contrato-policy.ts`, `src/lib/dp/cadastro-completude.ts`.
- Sem mudanças de banco nesta etapa (avaliar se o modo "por turno/serviço" do freelancer cabe nas colunas atuais de remuneração antes de propor migração).
