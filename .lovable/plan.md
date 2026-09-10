# Ajustes em "Alterar condições de trabalho" e na data de desligamento

## 1. Jornada: trazer o horário e permitir copiar de um colega

Hoje a aba Jornada só mostra os horários se o colaborador já tiver dias gravados; quando o dia está em branco, nada é sugerido e não existe atalho para repetir a rotina de um colega (o cadastro do colaborador tem esses atalhos, a tela de condições não).

O que muda:

- Ao escolher o turno padrão, os dias trabalhados que estiverem sem horário passam a exibir entrada, saída e intervalo do turno como sugestão visível (texto de referência no campo), como acontece no cadastro.
- Volta o bloco "Copiar o horário de:" com o primeiro nome dos colegas da mesma unidade (mesmo cargo primeiro), copiando a semana inteira, mais o botão "Copiar de outro colaborador" que abre a lista completa.
- **Sócio nunca aparece como fonte de cópia** para um colaborador comum (sócio não tem jornada contratual). A lista de cópia passa a excluir sócios sempre que a pessoa em edição não for sócia.
- O mesmo filtro vale para os atalhos já existentes no cadastro do colaborador.

## 2. Benefícios: parar de dizer "nenhum benefício cadastrado"

A empresa configurou vale-alimentação (R$ 24/dia, pagamento dia 25) e prêmio de assiduidade no **padrão de benefícios**, mas a aba lê apenas o catálogo de benefícios, que está vazio — daí a mensagem errada.

O que muda:

- A aba passa a listar também os benefícios do padrão da empresa/unidade/cargo (vale-alimentação, vale-transporte, prêmio de assiduidade), já marcados conforme o padrão, com o valor editável para aquele colaborador.
- Novo botão **"Manter os benefícios atuais"**: aplica exatamente os benefícios que o colaborador já tem cadastrados hoje (mesmos itens e valores), útil quando só outras condições mudaram.
- A mensagem "nenhum benefício cadastrado" só aparece quando não houver nem catálogo nem padrão, e passa a trazer um atalho para cadastrar benefícios.

## 3. Tipo de vínculo: deixar CLT efetivo explícito

Os rótulos "CLT" e "CLT Intermitente" ficam parecidos na lista e não se vê qual é o vínculo atual.

O que muda:

- Os itens passam a ser "CLT efetivo (mensalista/parcial)" e "CLT intermitente (por convocação)", com o vínculo atual marcado como "atual".
- O padrão herdado do cargo deixa de mexer no tipo de vínculo: vínculo só muda quando o gestor escolhe (hoje a maioria dos colegas do cargo pode reescrever a escolha em silêncio).
- Antes de salvar, a tela mostra em uma linha o que vai mudar: vínculo, forma de pagamento, horas por semana e remuneração.

## 4. Data de desligamento sem sugestão

A tela de desligamento hoje já vem com a data de hoje preenchida. Ela passa a começar vazia, com o texto "informe a data do desligamento", e o botão de confirmar só habilita depois que o gestor informar a data.

## Detalhes técnicos

- `ColaboradorCondicoesDialog.tsx`: extrair/reusar os atalhos de cópia de `ColaboradorJornadaPanel.tsx` (`atalhosColegas`, `copiarSemanaDoColega`) e o `CopiarConfigColaboradorDialog`; usar `turnoDoDia`/`resumoSemanaPorFaixas` de `src/lib/dp/config-trabalho.ts` para os placeholders de horário.
- `useDpModelosHorario.tsx`: incluir `vinculo_label`/`regime` no select do colaborador e novo parâmetro para excluir sócios (`isSocio` de `contrato-policy.ts`); aplicar em `CopiarConfigColaboradorDialog.tsx` e no painel de jornada.
- Benefícios: unir `useDpBeneficios` (catálogo) com `useDpBeneficiosPadrao` (`dp_beneficios_padroes.payload`: `vale_alimentacao*`, `vale_transporte*`, `premio_assiduidade*`) numa lista única com origem marcada; enviar apenas os itens do catálogo em `beneficios` da RPC e os do padrão como valores próprios do colaborador.
- `cargoPadrao.ts` / efeito de herança: remover `regime` do preenchimento automático (manter setor, forma, turno, carga, folga, dias e benefícios).
- `ColaboradorDesligamentoPanel.tsx` linha ~57: iniciar `data` vazia em vez de `toDateOnly(new Date())` e validar antes de habilitar a ação.
- Testes: cópia de horário ignorando sócio, lista de benefícios vinda do padrão, herança do cargo sem sobrescrever vínculo. Depois: verificação de tipos, suíte DP e conferência no navegador com o Herick.
