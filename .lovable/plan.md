# Próxima etapa

Os 15 ajustes da ficha de admissão estão fechados. Ficaram três frentes em aberto na lista de tarefas. Sugiro esta ordem:

## Etapa A (recomendada agora) — Fechar o endereço e os pendentes visuais da admissão

1. Endereço do colaborador dentro de Pessoas 360°: hoje o bloco padrão (CEP primeiro, preenchimento automático, lista de estados, "Sem número") já está na ficha do candidato, no perfil do colaborador, em Empresas, Unidades e no cadastro inicial da empresa. Falta o endereço editado pelo DP na ficha do colaborador, que ainda não usa esse bloco.
2. Conferência da ficha oficial: a tela de comparação mostra o CEP em campo solto; passar a usar o mesmo bloco, mantendo a comparação lado a lado como está.
3. Revisão rápida no navegador de cada tela alterada (uma passagem por tela, sem bateria de testes).

## Etapa B — Validações pendentes da admissão

1. Duas finalizações ao mesmo tempo do mesmo candidato (garantir que só uma conclui).
2. Percurso completo com convite fictício: preencher, anexar frente e verso, retomar, pedir correção, preparar para a contabilidade, receber e conferir a ficha oficial, concluir.
3. Acesso aos arquivos com pessoas diferentes: quem é de outra empresa ou não tem permissão não consegue abrir nem baixar.

Nada é enviado por WhatsApp ou e-mail a pessoas reais e os dados de teste não são apagados.

## Etapa C — Auditoria de Open Finance e conciliação

Cinco pontos já mapeados: permissão nas rotinas de conciliação, trava contra confirmação dupla, resultado detalhado na tela de conciliação, contadores reais da sincronização e tratamento de webhook/revogação/extrato. Os três lançamentos marcados para revisão manual continuam intocados.

## Detalhes técnicos

- Etapa A reaproveita `src/components/shared/EnderecoFields.tsx` e `src/lib/endereco.ts`; a ficha do colaborador guarda o endereço em campo estruturado (JSON) em `dp_colaboradores`, então a mudança é só de tela, sem migration. `FichaRevisaoCard` mantém o modo de comparação e apenas troca os campos de entrada.
- Etapa B roda com fixtures próprias em empresa de teste, chamadas HTTP reais às funções de admissão e sessões distintas para o teste de arquivos.
- Etapa C exige migrations (permissões e travas) e será apresentada com o SQL para aprovação antes de aplicar.
- Verificação em todas as etapas: tipos, lint dos arquivos alterados e os testes já existentes — sem baterias completas.
