# Regras de src/lib/dp

- Atas de Reunião: rascunho em `dp_atas`/`dp_ata_participantes`; ao enviar, cada participante recebe um `dp_documentos` tipo `ata_reuniao` (anexos PDF/imagem incorporados ao PDF) e assina pelo fluxo oficial `dp-documento-aceitar` — reaproveita hash, certificado e portal.
- Atas: condutores ficam em `dp_atas.condutores` (colaborador ou nome livre); participantes sem cadastro usam `avulso_*` em `dp_ata_participantes` e assinam no PDF impresso, sem gerar `dp_documentos`; mural só publica se `publicar_mural` (desligado por padrão) via `salvarAviso`.
- Atas por link: sem cadastro assina via `dp-ata-avulso` (token só em hash, confirma CPF, via única do PDF em `arquivo_path`); importadas (`origem`) enviam o PDF original e, se já assinadas, sem exigir aceite; áudio vira ata por `dp-ata-transcrever` sem guardar o arquivo.

- Divergência com a Ficha de Registro: qualquer cargo, salário, vínculo, forma de pagamento ou horário gravado diferente da ficha de origem exige justificativa (mín. 15) e ciência, registradas via `registrarCienciaRegra` (`src/lib/dp/ficha-registro/divergencia.ts`) — a ficha é registro contábil (CTPS/eSocial).
- Banco de horas e compensação de feriados vêm da unidade; exceção individual fica em `dp_colaborador_compensacao` (NULL = segue a unidade, false = fora) e assuntos pendentes podem sair num termo único — regra coletiva com ajuste por pessoa.
- Excedente de colaboradores: com checkout_v2 = v2, dono/admin inclui acima da franquia só após ciência registrada por `dp_colaborador_excedente_confirmar` (consumida pelo gatilho `dp_guard_limite_colaborador` em 15 min); em legado a trava segue rígida — o banco é a defesa, não a tela.
