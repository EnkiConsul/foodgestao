# Alterar Condições de Trabalho: tudo do contrato em um só lugar

Hoje a tela "Alterar Condições de Trabalho" só permite mudar vínculo, cargo, unidade, setor, forma de pagamento e o valor pago. Turno, horário, carga horária, sindicato e benefícios ficam apenas no cadastro do colaborador e não entram no histórico com data de vigência. Por isso não foi possível alterar tudo do Herick em um só lugar.

## Regra geral

A tela passa a permitir mudar **todas as condições de trabalho**, com data em que passam a valer e registro no histórico. Ficam fora dela, seguindo apenas no cadastro:

- dados pessoais e documentos do colaborador;
- preferências do colaborador, como adiantamento salarial (que já tem o próprio histórico de solicitações).

## O que muda

1. **Turno, horário e dias da semana**
   - Turno da unidade, dias trabalhados com entrada, saída e intervalo, folga fixa ou variável — o mesmo conjunto da aba Turno & Jornada, agora com data de início.
   - O horário anterior é encerrado no dia anterior; o novo passa a valer na data informada, sem apagar o passado.

2. **Jornada parcial com carga horária**
   - Campos "Carga horária semanal" (ex.: 30h) e "Base de horas do mês" (sugerida automaticamente: 150h para 30h semanais, 220h para integral), ajustáveis pelo gestor.
   - Quando a carga for menor que a jornada base do cargo, a tela sinaliza "Jornada parcial" e mostra o cálculo.

3. **Salário proporcional às horas**
   - Base: salário do cargo (com o piso da unidade, quando houver) e a jornada base do cargo.
   - Salário do colaborador = salário do cargo × (carga informada ÷ carga base do cargo); valor da hora = salário ÷ base de horas do mês.
   - A conta aparece em texto claro, com opção de informar um valor diferente do calculado (o motivo já é obrigatório).

4. **Sindicato**
   - Escolha do sindicato laboral com vigência. Ao trocar, a tela recalcula e mostra o piso aplicável e avisa se o valor informado ficar abaixo do piso.

5. **Benefícios**
   - Lista de benefícios ativos/inativos do colaborador, com valores próprios quando houver, dentro da mesma mudança de vigência.
   - Aviso de equidade (comparação com o padrão do cargo/unidade) igual ao do cadastro.

6. **Demais condições contratuais na mesma tela**
   - Vínculo, cargo, unidade, setor, forma de pagamento, remuneração, base de dias do mês, escala/regra de folga e "compõe equipe habitual".

7. **Caso do Herick**
   - Vínculo passa de Intermitente para CLT, mensalista, 30h semanais, base de 150h/mês, salário proporcional calculado a partir do cargo, com horário e dias definidos na mesma tela e gravados no histórico.

8. **Histórico mais completo**
   - Cada linha passa a mostrar turno, carga semanal, base de horas, horário resultante, sindicato e benefícios alterados, além do que já aparece.

## Detalhes técnicos

- `dp_colaborador_historico_condicoes`: acrescentar `turno_padrao_id`, `carga_semanal_horas`, `folga_variavel`, `folga_fixa_dow`, `sindicato_id`, `compoe_equipe_habitual`, um `jsonb` com o horário por dia da semana (espelho de `dp_colaborador_config_dias`) e um `jsonb` com o retrato dos benefícios aplicados.
- `dp_colaborador_aplicar_condicao`: nova versão que também recebe turno, carga semanal, folga, dias com horários, sindicato e a lista de benefícios. Ela encerra `dp_colaborador_config_trabalho` vigente (`vigencia_fim = vigência - 1`), insere a nova configuração com `vigencia_inicio`, regrava `dp_colaborador_config_dias`, atualiza `dp_colaboradores.sindicato_id` e sincroniza `dp_colaborador_beneficios`. Mantém `base_horas_mes`/`base_dias_mes` já previstos na assinatura atual.
- Novo helper de proporcionalidade ao lado de `src/lib/dp/cargoSalarios.ts`: resolve o salário do cargo na unidade na data de vigência, calcula `salario = salarioCargo × cargaInformada / cargaBaseCargo` (base em `dp_cargos.carga_horaria_semanal`, fallback 44h) e `valor_hora = salario / base_horas_mes`. Testes: 30/44 com 150h, carga igual à base, cargo sem salário, valor sobrescrito pelo gestor.
- `ColaboradorCondicoesDialog.tsx` passa a ter abas (Vínculo & Cargo · Turno & Jornada · Remuneração · Benefícios), reaproveitando os controles já existentes de `ColaboradorJornadaPanel`, `RemuneracaoFields` e `BeneficiosDialogs` — extrair os blocos compartilhados em vez de duplicar. Validação com `validarConfigTrabalho` de `src/lib/dp/config-trabalho.ts` e as regras de `beneficios-regras.ts`.
- `useDpColaboradorCondicoes.tsx`: enviar os novos parâmetros e invalidar `dp_colab_config_trabalho`, `dp_colab_config_dias`, benefícios, escala do mês e panorama da operação.
- Sem mudança no enum `dp_regime_trabalho`: "parcial" é carga horária, não vínculo — CLT + 30h semanais.
- Ao final: `bunx tsgo --noEmit`, suíte DP e conferência no navegador abrindo as condições do Herick.
- Registrar as duas frentes em `roadmap.md` no início da implementação.
