# Próxima etapa — Validação da importação de ficha de registro

A implementação está completa (migração, leitura por IA, telas, botão e item de menu). A etapa seguinte é validar tudo funcionando de ponta a ponta antes de dar por concluído.

## Etapa: Validar em runtime

1. Abrir a tela "Importar ficha de registro" (Pessoas > Cadastro > Importar ficha de registro) no preview autenticado.
2. Enviar o PDF "Ficha_Registro_de_Empregado_3.pdf" (modelo Domínio) e conferir:
   - Barra de progresso até "pronta para revisão".
   - Dados pessoais extraídos (nome, CPF, RG, CTPS, filiação, endereço).
   - Jornada por dia da semana (Dom trabalhado, Seg folga etc.) correta.
3. Enviar o PDF "fichas_de_registro_todos_funcionarios.pdf" (modelo Praianos, 44 fichas) e conferir:
   - Separação automática das 44 fichas.
   - Jornada em linha compacta ("Escala: 08:00/12:00-14:00/18:00") interpretada.
4. Testar ações de revisão:
   - Criar colaborador novo a partir de uma ficha (com e sem jornada).
   - Ficha com CPF já cadastrado aparece como "duplicado" e permite "Atualizar existente".
   - Ignorar ficha.
5. Conferir que o colaborador criado aparece na lista de Colaboradores com origem "importação".
6. Se a leitura de algum campo falhar nos dois modelos, ajustar o prompt/função de leitura e revalidar.

## Depois da validação (opcional, próximos passos)

- Publicar a versão para o app em produção.
- Considerar módulo de ocorrências (plano já proposto e arquivado), se quiser retomá-lo.

## Detalhes técnicos

- Verificação via Playwright em `http://localhost:8080/dp/colaboradores/importar-ficha`, com sessão autenticada (LOVABLE_BROWSER_SUPABASE_*).
- Função de leitura: `dp-ficha-registro-parse` (gemini-3.7-flash, até 120 páginas, 4 páginas em paralelo).
- Nenhuma migração nova prevista nesta etapa.
