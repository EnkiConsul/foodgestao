// Edge function: dp-generate-disciplinary-pdf
// Gera um PDF real da advertência/registro disciplinar via pdf-lib,
// grava em storage `dp-disciplinar/{company_id}/{registro_id}.pdf`
// e atualiza `dp_registros_disciplinares.pdf_storage_path`.
//
// Body: { registro_id: uuid }
// Retorna: { path, signed_url }

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";
import { z } from "npm:zod@3";

const BUCKET = "dp-disciplinar";

const BodySchema = z.object({ registro_id: z.string().uuid() });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Usuário (para respeitar RLS na leitura do registro)
    const supabaseUser = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: reg, error: regErr } = await supabaseUser
      .from("dp_registros_disciplinares")
      .select("*, dp_colaboradores(nome, cpf, matricula, cargo)")
      .eq("id", parsed.data.registro_id)
      .maybeSingle();
    if (regErr || !reg) return json({ error: regErr?.message ?? "Registro não encontrado" }, 404);

    // Empresa (nome no cabeçalho)
    const supabaseSvc = createClient(url, service);
    const { data: company } = await supabaseSvc
      .from("companies").select("razao_social, nome_fantasia").eq("id", reg.company_id).maybeSingle();

    // --- Gerar PDF ---
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595, 842]); // A4
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const { width } = page.getSize();
    let y = 800;

    const draw = (text: string, size = 11, fnt = font) => {
      // Quebrar em linhas simples (largura ~500)
      const words = text.split(/\s+/);
      let line = "";
      const maxWidth = width - 100;
      for (const w of words) {
        const test = line ? line + " " + w : w;
        if (fnt.widthOfTextAtSize(test, size) > maxWidth) {
          page.drawText(line, { x: 50, y, size, font: fnt, color: rgb(0.1, 0.1, 0.1) });
          y -= size + 4;
          line = w;
        } else line = test;
      }
      if (line) {
        page.drawText(line, { x: 50, y, size, font: fnt, color: rgb(0.1, 0.1, 0.1) });
        y -= size + 4;
      }
    };

    const companyName = (company as any)?.razao_social ?? (company as any)?.nome_fantasia ?? "";
    draw(companyName, 14, bold);
    y -= 6;
    draw("REGISTRO DISCIPLINAR", 16, bold);
    y -= 10;

    const TIPO: Record<string, string> = {
      advertencia_verbal: "Advertência Verbal",
      advertencia_escrita: "Advertência Escrita",
      suspensao: "Suspensão",
      elogio: "Elogio",
      observacao: "Observação",
    };
    draw(`Tipo: ${TIPO[reg.tipo] ?? reg.tipo}`, 12, bold);
    draw(`Data: ${reg.data}`, 11);
    if (reg.suspensao_dias) draw(`Dias de suspensão: ${reg.suspensao_dias}`, 11);
    y -= 6;

    const colab = (reg as any).dp_colaboradores ?? {};
    draw("Colaborador", 12, bold);
    draw(`Nome: ${colab.nome ?? "—"}`);
    if (colab.cpf) draw(`CPF: ${colab.cpf}`);
    if (colab.matricula) draw(`Matrícula: ${colab.matricula}`);
    if (colab.cargo) draw(`Cargo: ${colab.cargo}`);
    y -= 6;

    draw("Motivo", 12, bold);
    draw(reg.motivo ?? "—");
    y -= 6;

    if (reg.descricao) {
      draw("Descrição", 12, bold);
      for (const paragraph of String(reg.descricao).split("\n")) draw(paragraph);
      y -= 6;
    }

    y -= 20;
    draw("Assinaturas", 12, bold);
    y -= 30;
    page.drawLine({ start: { x: 50, y }, end: { x: 260, y }, thickness: 0.5 });
    page.drawLine({ start: { x: 320, y }, end: { x: 545, y }, thickness: 0.5 });
    y -= 12;
    page.drawText("Colaborador", { x: 50, y, size: 10, font });
    page.drawText("Responsável DP", { x: 320, y, size: 10, font });

    const bytes = await pdf.save();

    // --- Upload storage ---
    const path = `${reg.company_id}/${reg.id}.pdf`;
    const up = await supabaseSvc.storage.from(BUCKET).upload(path, bytes, {
      contentType: "application/pdf", upsert: true,
    });
    if (up.error) return json({ error: up.error.message }, 500);

    await supabaseSvc.from("dp_registros_disciplinares")
      .update({ pdf_storage_path: path }).eq("id", reg.id);

    const signed = await supabaseSvc.storage.from(BUCKET).createSignedUrl(path, 300);

    return json({ path, signed_url: signed.data?.signedUrl });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
