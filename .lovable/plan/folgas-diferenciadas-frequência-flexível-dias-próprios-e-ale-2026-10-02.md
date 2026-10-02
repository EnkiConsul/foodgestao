# Folgas Diferenciadas: frequência flexível, dias próprios e alerta de isonomia

## Objetivo
Na seção **Folgas Diferenciadas** (dentro de Editar Regras de Folgas da unidade), a exceção por Cargo ou Colaborador passa a seguir o mesmo padrão da regra da unidade e sempre avisa sobre o Princípio da Isonomia antes de salvar.

## 1. Cadastro da exceção no mesmo padrão da unidade
1. **Alvo:** Cargo ou Colaborador (só ativos da unidade).
2. **Dias considerados:** "Seguir os dias da unidade" (padrão) ou escolher dias da semana (Seg a Dom). Exemplo: Domingo e Segunda.
3. **Modelo de frequência:** "A cada X semanas" ou "X por mês", com campo de quantidade.
4. **Comparativo na hora:** regra da unidade (Homens / Mulheres) x exceção proposta, com equivalência mensal e selo "Mais favorável" ou "Abaixo do mínimo legal". Abaixo da lei continua bloqueado.
5. A lista de exceções mostra o resumo completo, por exemplo: "PIZZAIOLO — Domingo e Segunda, 2 por mês".

## 2. Alerta de isonomia (sempre, com ou sem sindicato)
O sistema compara a pessoa (ou as pessoas do cargo) com os colegas da mesma unidade que ficam na regra padrão.

**Alerta 1, afirmativo** (mesmo sindicato laboral e patronal, ou nenhum sindicato cadastrado):
"Princípio da Isonomia (Art. 5º, caput, e Art. 7º, XXX, da Constituição Federal; Art. 461 da CLT): colaboradores da mesma unidade e mesmo enquadramento sindical devem ter as mesmas condições de descanso. Esta diferenciação gera risco de questionamento por tratamento desigual e precisa de motivo objetivo documentado."

**Alerta 2, orientativo** (sindicato laboral ou patronal diferente entre os envolvidos):
"Atenção ao Princípio da Isonomia (Art. 5º, caput, e Art. 7º, XXX, da Constituição Federal; Art. 461 da CLT): há enquadramento sindical diferente entre os envolvidos. A diferença pode ser válida se vier da Convenção Coletiva aplicável. Confirme que o descanso concedido decorre da CCT ou de justificativa contratual documentada."

O alerta mostra os sindicatos de cada lado (ou "sem sindicato cadastrado") e quantos colegas ficam na regra padrão.

## 3. Ciência obrigatória ao salvar
- Justificativa obrigatória (mínimo 15 caracteres) e caixa de ciência dos riscos.
- Ao salvar, ficam no histórico de regras: quem concedeu, data, alvo, regra anterior e nova, tipo de alerta, sindicatos comparados, justificativa e ciência.
- O alerta não volta para a mesma exceção. Só aparece de novo se ela for alterada.
- Remover uma exceção (voltar à regra da unidade) não pede ciência, mas fica registrado.

## 4. Onde a regra vale
Calendário do portal, escolha de folgas, conformidade da CLT e ficha do colaborador passam a usar os dias e a frequência da exceção. A ordem continua: colaborador > cargo > unidade.

## Detalhes técnicos
- Migração reversível:
  - `dp_folga_domingo_cargos`: novas colunas `modo_frequencia` ('semanas' | 'por_mes'), `periodicidade_semanas`, `dias_descanso smallint[]` (null = dias da unidade); `domingos_mes` continua como equivalente mensal.
  - `dp_colaboradores`: colunas equivalentes para a exceção individual (`folga_dif_modo`, `folga_dif_periodicidade`, `folga_dif_dias`), com o valor atual em `domingos_folga_mes` preservado.
  - RPCs `dp_folga_domingo_cargo_definir` e `dp_colaborador_definir_domingos_folga` recebem os novos campos, `_justificativa` e `_ciencia`; recusam salvar sem ciência quando houver diferença (fail-closed); revalidam o mínimo legal no banco; gravam em `dp_regras_historico`.
- Nova lib pura `src/lib/dp/folga-isonomia.ts`: classifica o cenário (mesmo enquadramento / sem sindicato / diferente) a partir de `sindicato_id` (laboral) e do patronal da unidade, e monta os textos com a base legal. Testes unitários.
- `FolgasDiferenciadasPanel.tsx`: seletor de dias, modo de frequência, comparativo, alerta e ciência (reaproveitando o padrão de `CienciaLegalDialog`).
- `domingosDiferenciados` e `useDpRegrasColaborador` passam a devolver também modo e dias; consumidores (`DpMeuCalendario`, `DpMeuSolicitacoes`, `DpConformidadeDsr`, `ColaboradorJornadaPanel`) usam esses dados.
- Regra registrada no `AGENTS.md`. Nada publicado (freeze ativo).
