# Alterar Condições de Trabalho: turno, horário, carga e jornada parcial

Hoje a tela "Alterar Condições de Trabalho" só permite mudar vínculo, cargo, unidade, setor, forma de pagamento e o valor pago. Turno, horário, dias da semana e carga horária ficam apenas no cadastro do colaborador (aba Turno & Jornada) e não entram no histórico com data de vigência. Por isso não foi possível alterar tudo do Herick em um só lugar.

## O que muda

1. **Turno e horário na própria tela de condições**
   - Novos campos: turno da unidade, dias da semana trabalhados com entrada, saída e intervalo, e folga fixa/variável — o mesmo conjunto já usado na aba Turno & Jornada, agora com data de início de vigência.
   - Ao salvar, o horário anterior é encerrado no dia anterior e o novo passa a valer na data informada, sem apagar o passado.

2. **Jornada parcial com carga horária**
   - Campo "Carga horária semanal" (ex.: 30h) e "Base de horas do mês" (preenchida automaticamente com 150h para 30h semanais; 220h para jornada integral). O gestor pode ajustar.
   - Quando a carga informada for menor que a jornada base do cargo, a tela sinaliza "Jornada parcial" e mostra o cálculo.

3. **Salário proporcional às horas**
   - Base do cálculo: salário do cargo (considerando o piso da unidade, quando houver) com a jornada base do cargo.
   - O salário do colaborador é calculado proporcionalmente à carga informada: salário do cargo × (carga informada ÷ carga base do cargo).
   - A tela mostra a conta em texto claro, o valor mensal resultante e o valor da hora, com opção de o gestor informar um valor diferente do calculado (com o motivo obrigatório que já existe).

4. **Caso do Herick**
   - Vínculo passa de Intermitente para CLT, mensalista, 30h semanais, base de 150h/mês, salário proporcional calculado a partir do cargo, com o horário e os dias definidos na mesma tela e registrados no histórico.

5. **Histórico mais completo**
   - Cada linha do histórico passa a mostrar também turno, carga semanal, base de horas e o horário resultante, além do que já aparece.

## Detalhes técnicos

- `dp_colaborador_historico_condicoes`: acrescentar `turno_padrao_id`, `carga_semanal_horas`, `folga_variavel`, `folga_fixa_dow` e um `jsonb` com o horário por dia da semana (espelho do que é gravado em `dp_colaborador_config_dias`).
- `dp_colaborador_aplicar_condicao`: nova versão que, além do que já faz, recebe turno, carga semanal, folga e dias com horários; encerra `dp_colaborador_config_trabalho` vigente (`vigencia_fim = vigência - 1`), insere a nova configuração com `vigencia_inicio`, e regrava `dp_colaborador_config_dias`. Mantém `base_horas_mes` / `base_dias_mes` já previstos na assinatura atual.
- `src/lib/dp/cargoSalarios.ts` + novo helper de proporcionalidade: resolve salário do cargo na unidade na data de vigência, calcula `salario = salarioCargo × cargaInformada / cargaBaseCargo` (carga base vinda de `dp_cargos.carga_horaria_semanal`, com fallback 44h) e `valor_hora = salario / base_horas_mes`. Cobrir com testes unitários (30/44 → 150h, carga igual à base, cargo sem salário, gestor sobrescrevendo o valor).
- `ColaboradorCondicoesDialog.tsx`: reaproveitar os controles de dias/horários de `ColaboradorJornadaPanel` (extrair o bloco de edição de dias para um componente compartilhado) e validar com `validarConfigTrabalho` de `src/lib/dp/config-trabalho.ts`.
- `useDpColaboradorCondicoes.tsx`: enviar os novos parâmetros e invalidar também `dp_colab_config_trabalho`, `dp_colab_config_dias`, escala do mês e panorama da operação.
- Sem mudança no enum `dp_regime_trabalho`: "parcial" é a carga horária, não um vínculo — CLT + 30h semanais.
- Depois: `bunx tsgo --noEmit`, suíte DP e conferência no navegador em `/dp/cadastro` abrindo as condições do Herick.
