# Cadastro de Sócio: remover o que é de empregado CLT

Seis ajustes no cadastro do colaborador quando o vínculo é **Sócio**.

## 1. Enquadramento sindical não aparece
O bloco "Enquadramento Sindical" (laboral + patronal) sai da aba **Dados** quando o vínculo é Sócio — sócio não é representado por convenção coletiva. Nada é apagado: se o vínculo mudar para CLT/intermitente, o bloco volta com o valor já gravado.

## 2. Alerta jurídico do sócio recolhido no "i"
Hoje o texto longo ("Sócio é remunerado por pró-labore, não por folha CLT…") ainda aparece como faixa aberta na aba Dados. Passa a ser um ícone de informação discreto ao lado do campo de vínculo, com o texto completo dentro do popover. Os demais vínculos (Freelancer, PJ/MEI, Autônomo) continuam com a faixa aberta, porque ali o alerta é de risco real de vínculo.

## 3. Desligamento não aparece para sócio
O bloco "Desligamento" da aba Dados fica oculto para Sócio (saída de sócio é alteração de contrato social, não rescisão). A exclusão do cadastro segue disponível pelo ícone de lixeira, com justificativa e lixeira de 7 dias.

## 4. Sem aviso de "fora do padrão de remuneração"
O comparativo com o padrão da empresa (prêmio de assiduidade, VA, corte do VA, descontos) não é exibido para Sócio, nem o botão "Aplicar padrão de remuneração" — o padrão é de folha CLT e o sócio é, por definição, fora dele.

## 5. Sem salário-família
Na aba Dependentes, o resumo de salário-família (cotas, teto, "Atualizar tabela", aviso de tabela vencida) e o selo "Salário-família" na lista não aparecem para sócio; benefício é exclusivo de segurado empregado. O cadastro de dependentes continua, apenas como informação cadastral.

## 6. Documentos: sem exigências de regime PJ/MEI e CLT
Na aba Documentos, requisitos marcados como "Regime PJ ou MEI" (ex.: Contrato social / CNPJ ativo) e "Regime com controle de ponto (CLT)" deixam de ser cobrados de sócio, alinhando com a política que já isenta o sócio de 13º, férias e folha. Isso vale também nos painéis de pendências, para não gerar pendência fantasma.

## Detalhes técnicos
- `ColaboradorFormDialog.tsx`: condicionar `SindicatoEnquadramentoField`, `ColaboradorDesligamentoPanel` e `PadraoDivergenciaAviso`/`padraoAplicado` a `!socioSelecionado`; renderizar o alerta de `regimeRisco` como popover quando `risco.tipo === "socio"` (mantendo faixa para os outros tipos) e não recalcular `diferencasDoPadrao` para sócio.
- `DependentesPanel.tsx`: nova prop `socio?: boolean` que oculta o card de salário-família, o selo por dependente e o aviso de tabela vencida; passada pelo diálogo.
- `documentos-requisitos.ts`: `ColaboradorContexto` ganha `socio?: boolean | null`; `requisitoAplicaColaborador` retorna `false` em `regime_pj` e `regime_clt` quando `socio`. Preencher a flag via `isSocio(vinculo_label)` em `useDpColaboradorDocumentos`, `useDpPendencias` e `useDpPendenciasColaborador` (incluir `vinculo_label` no select onde faltar). Cobrir com teste em `lib/dp/__tests__/documentos-requisitos.test.ts`.
- Correção de erro em runtime: referência remanescente a `DpCopyColWidthsButton` (componente já removido) em uma das telas de lista.
