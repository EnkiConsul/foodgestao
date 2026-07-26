## Objetivo

Trocar o botão "inativar" (switch solto na lista de colaboradores) por um **fluxo formal de desligamento**, com registro auditável e período de carência de acesso ao portal.

## Concordo com sua proposta — e sugiro alguns complementos

O que você pediz faz total sentido: hoje o switch inativa sem registrar data, motivo ou responsável, o que quebra os cálculos históricos (ex.: cobertura de documentos por competência já usa `data_desligamento`, que muitas vezes fica vazio).

Complementos que recomendo:
1. **Reversão de desligamento** ("Reintegrar") em vez de simplesmente religar o switch — limpa/arquiva o desligamento e registra quem reintegrou.
2. **Registrar quem desligou e quando** (`desligado_por`, `desligado_em`), separado da data efetiva de demissão.
3. **Elegibilidade para recontratação** — campo sim/não/com ressalvas, ao lado da observação. É o dado que o admin realmente procura numa futura avaliação.
4. **Efeitos colaterais automáticos**: cancelar folgas futuras agendadas e solicitações pendentes a partir da data de demissão, com aviso na confirmação ("X folgas futuras serão canceladas").
5. **Aviso de carência**: banner no portal do colaborador desligado ("Seu acesso encerra em N dias — baixe seus documentos"), e bloqueio de ações de escrita (pedir folga, troca, solicitações) desde já — só leitura/download.
6. **Data de demissão futura**: permitir agendar (aviso prévio). O acesso completo continua até a data, e a carência conta a partir dela.
7. **Filtro "Desligados"** com coluna de motivo e data, além de exportação.

## Escopo da implementação

### Banco de dados
- Novo enum `dp_motivo_desligamento`: pedido de demissão, dispensa sem justa causa, dispensa com justa causa, término de contrato/experiência, acordo mútuo, abandono de emprego, aposentadoria, falecimento, outro.
- Em `dp_colaboradores`: `motivo_desligamento` (enum, opcional), `observacao_desligamento` (texto), `elegivel_recontratacao` (enum/texto opcional), `desligado_por` (uuid), `desligado_em` (timestamp), `acesso_portal_ate` (date).
- `data_desligamento` passa a ser obrigatória sempre que `ativo = false` — validado por trigger (não CHECK, por depender de dados).
- Trigger de desligamento: ao definir `data_desligamento`, calcula `acesso_portal_ate = data_desligamento + 30 dias`, seta `ativo = false` e preenche auditoria.
- Ajustar a função de acesso do colaborador (`auth_access_enabled` / gate do portal) para permitir login enquanto `now() <= acesso_portal_ate`, e negar depois. Políticas de escrita do colaborador (folgas, solicitações, trocas) passam a exigir `ativo = true`.
- Prazo de 30 dias configurável em `dp_pendencias_config`-style (ou nova chave de config DP), com default 30.

### Frontend
- Remover o `Switch` de ativo/inativo da lista e do card mobile (`src/pages/dp/DpColaboradores.tsx`).
- Novo `DesligamentoDialog.tsx`: data da demissão (obrigatória), motivo (select opcional), observação (textarea), elegibilidade para recontratação, resumo dos efeitos (folgas/solicitações canceladas, data-limite de acesso ao portal).
- Novo `ReintegrarDialog.tsx` (confirmação simples + limpeza dos campos, mantendo histórico).
- Aba/filtro "Desligados" com motivo, data e data-limite de acesso; detalhe do colaborador mostra bloco "Desligamento".
- Portal do colaborador (`ColaboradorShell.tsx`): banner de carência com contagem regressiva e ocultação/desativação das ações de escrita.

### Detalhes técnicos
- Validação Zod em `src/lib/validations.ts` (`desligamentoSchema`) usada com `validateWithToast`.
- Cancelamento de folgas/solicitações futuras via função SQL `SECURITY DEFINER` chamada na mesma transação do desligamento.
- Registro em `audit_logs` da ação de desligamento e reintegração.
- Testes unitários para o cálculo da janela de carência e para `ativoNaCompetencia` continuar correto com os novos campos.
