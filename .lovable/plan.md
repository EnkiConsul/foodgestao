# Importar ficha de registro do colaborador (Pessoas 360°)

Objetivo: enviar o PDF da ficha de registro que o escritório contábil já emite, o sistema ler as informações, mostrar uma prévia e só criar/atualizar o cadastro depois da sua confirmação.

## Avaliação do plano que você recebeu

O plano está bem alinhado ao que o sistema já é. Concordo integralmente com:
- não depender de posição fixa no PDF (leitura por significado, com IA);
- prévia obrigatória, confiança por campo e nunca inventar informação;
- CPF como identificador, com opção de atualizar cadastro existente;
- unidade e setor nunca adivinhados;
- jornada sempre como sugestão revisável;
- não criar cadastro paralelo — a importação usa as mesmas regras do cadastro manual;
- guardar o arquivo original e o histórico da importação.

Ajustes que proponho:
1. **Reaproveitar o que já existe.** A plataforma já tem uma central de importação de PDF em massa que separa páginas, guarda o arquivo em um espaço próprio e casa o documento com o colaborador. A ficha de registro entra como uma nova natureza dentro dessa mesma central, em vez de uma estrutura nova do zero.
2. **Campos que o cadastro ainda não tem.** Hoje o cadastro do colaborador guarda nome, CPF, matrícula, nascimento, sexo, estado civil, telefone, e-mail, endereço, cargo, unidade, setor, admissão, salário, PIS e CNH. Não existem campos para RG, CTPS, título de eleitor, reservista, filiação (pai/mãe), naturalidade, nacionalidade, raça/cor, grau de instrução e deficiência. Sem criar esses campos, esses dados seriam lidos e jogados fora. Proponho criá-los junto (etapa 2) e, na etapa 1, guardá-los na ficha lida para não perder nada.
3. **Endereço.** O endereço já é guardado em bloco estruturado, então dá para separar rua/número/bairro/cidade/UF/CEP; quando a separação não for segura, o texto original fica visível para conferência.
4. **Uma tabela em vez de duas + itens.** Mantenho as duas entidades sugeridas (a importação e cada ficha identificada), porque a revisão parcial e o histórico precisam disso. O que não faço é criar tabela de "colaborador importado".
5. **Custo e limite.** Ler cada ficha com IA custa crédito e tempo. Vou limitar o arquivo (até ~40 fichas por envio) e processar em lotes, mostrando o andamento.
6. **Dependentes e históricos** ficam fora desta primeira versão, como você pediu — mas o arquivo original fica guardado para uma leitura futura.

## Etapas

### Etapa 1 — Ler a ficha e criar o cadastro
- Botão **Importar ficha de registro** na tela de Colaboradores e na central de importação.
- Envio do PDF, separação automática das fichas (páginas de continuação seguem com a pessoa anterior).
- Leitura por IA página a página, devolvendo cada campo com nível de confiança (Identificado / Revisar / Não encontrado).
- Lista do resultado: pronto para importar · revisar · já cadastrado (CPF) · com erro.
- Tela de revisão por pessoa, com o texto original ao lado quando a confiança for baixa.
- Cargo: correspondência por CBO + nome, na ordem CBO igual e nome parecido → CBO igual → nome parecido → sem correspondência. Criar cargo novo só com confirmação.
- Unidade e setor escolhidos por você; ação em lote para aplicar a mesma unidade/setor a vários selecionados.
- CPF: normaliza, valida dígitos, procura na empresa. Se existir, mostra comparação campo a campo (sistema × ficha) e você marca o que atualizar.
- Confirmação cria/atualiza usando as mesmas validações do cadastro manual; erro em uma ficha não cancela as outras.
- Arquivo original guardado e anexado a cada colaborador, com a página de origem; histórico da importação com totais (identificados, criados, atualizados, ignorados, com pendência).

### Etapa 2 — Campos novos de documentos e filiação
- Novos campos no cadastro: RG (número, órgão, UF, emissão), CTPS (número, série, UF, expedição), título de eleitor (zona/seção), reservista, filiação, nacionalidade, naturalidade, raça/cor, grau de instrução, deficiência.
- Esses campos passam a ser preenchidos pela importação e aparecem na ficha do colaborador.

### Etapa 3 — Jornada sugerida
- Interpretar tanto o formato compacto (`16:00/20:00-21:00/00:20`) quanto a tabela por dia da semana, incluindo folga e intervalo.
- Jornada que passa da meia-noite tratada como término no dia seguinte.
- Sempre como sugestão: **Confirmar jornada**, **Editar** ou **Não importar jornada**. Sem confiança, oferece "Configurar depois" e não grava nada.
- A gravação usa a estrutura de jornada/dias que já existe hoje.

## Detalhes técnicos

Banco:
- `dp_ficha_importacoes` (company_id, arquivo_path, arquivo_nome, status, totais, criado_por, created_at, concluido_em) + GRANTs + RLS por empresa.
- `dp_ficha_importacao_itens` (importacao_id, company_id, pagina_inicio/fim, nome_extraido, cpf_extraido, colaborador_existente_id, dados_extraidos jsonb, confianca_campos jsonb, status, erro) + GRANTs + RLS.
- `dp_colaboradores`: colunas `origem_cadastro` e `ficha_importacao_item_id` para auditoria; colunas de documentos/filiação na etapa 2.
- Reuso do bucket `dp-bulk-import` para o PDF; leitura por URL assinada.

Backend:
- Nova edge function `dp-ficha-registro-parse`: recebe o caminho do arquivo, extrai o texto por página, agrupa fichas, chama o modelo `openai/gpt-5.6-sol` (Responses API, saída estruturada com `confianca` por campo), grava os itens. Processa em lotes com retomada; trata 429/5xx com espera e 402/403 como bloqueio com mensagem clara.
- Nova edge function `dp-ficha-registro-aplicar`: aplica um item confirmado (criar/atualizar), reutilizando as validações do cadastro.

Frontend:
- `src/pages/dp/DpFichaRegistroImportar.tsx` (envio + acompanhamento + lista), `src/components/dp/ficha-registro/FichaRevisaoCard.tsx`, `FichaComparacaoDialog.tsx`, `CargoCorrespondenciaDialog.tsx`, `JornadaSugeridaCard.tsx`, `AplicarEmLoteBar.tsx`; hook `src/hooks/useDpFichaImportacao.tsx`.
- Regras puras testadas em `src/lib/dp/ficha-registro/`: `jornada-parse.ts`, `cargo-match.ts`, `endereco-parse.ts`, `confianca.ts`.
- Rota em `src/App.tsx` e item na navegação do Pessoas (Cadastro).

Observação: preciso dos 2 modelos de ficha em PDF para calibrar a separação das fichas e a leitura da jornada antes de fechar a etapa 1.
