// @vitest-environment node
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as pdfLib from "pdf-lib";
import { z } from "zod";
import { describe, expect, it } from "vitest";

describe("carta disciplinar com referências persistidas", () => {
  it("gera uma página por via e preserva originais com caminhos únicos", async () => {
    let handler: (r: Request) => Promise<Response> = async () => new Response(null, {status:500});
    let bytes: Uint8Array = new Uint8Array();
    const paths: string[] = [];
    const reg = { id: "00000000-0000-4000-8000-000000000001", company_id:"empresa",colaborador_id:"pessoa", tipo:"suspensao",suspensao_dias:2,data:"2026-10-29",motivo:"Indisciplina / Descumprimento de Normas Internas",descricao:"Novos fatos descritos objetivamente para conferência.",reincidencia_texto:"Consta no histórico do contrato atual orientação e advertência verbal em 10/09/2026, pelo motivo: Atraso." };
    const client = {
      from(table: string) {
        const b = {select: () => b,eq: () => b, update: () => b,
          maybeSingle: async () => ({data: table === "dp_registros_disciplinares" ? reg : table === "companies" ? {razao_social:"EMPRESA FICTÍCIA LTDA",cidade:"Goiânia"} : {nome:"COLABORADOR CIVIL",nome_social:"NOME SOCIAL PROIBIDO",cargo:"Atendente"}}),
          then: (ok: (v: unknown) => unknown) => Promise.resolve({error:null}).then(ok),
        }; return b;
      },
      storage: {from: () => ({upload: async (path: string, data: Uint8Array, opts: {upsert: boolean}) => {
        expect(opts.upsert).toBe(false); paths.push(path); bytes=data; return {error:null};
      },createSignedUrl: async () => ({data:{signedUrl:"https://example.invalid/test.pdf"}})})},
    };
    const code = ts.transpile(readFileSync("supabase/functions/dp-generate-disciplinary-pdf/index.ts","utf8"),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022});
    const req = (name: string) => name.includes("pdf-lib") ? pdfLib : name.includes("zod") ? {z} : name.includes("cors") ? {corsHeaders:{}} : name.includes("authz") ? {requireUser:async () => ({id:"ator",token:"fixture"}),requireCompanyAccess:async () => true} : {createClient:()=>client};
    new Function("require","exports","Deno",code)(req,{}, {env:{get:()=>"fixture"},serve:(fn: typeof handler)=>{handler=fn}});
    const invoke = () => handler(new Request("http://localhost",{method:"POST",body:JSON.stringify({registro_id:reg.id})}));
    expect((await invoke()).status).toBe(200);
    const normal = await pdfLib.PDFDocument.load(bytes);
    expect(normal.getPageCount()).toBe(2);
    await invoke();
    expect(paths[0]).not.toBe(paths[1]);
    reg.descricao = Array(100).fill("Descrição longa de fatos fictícios para testar continuação sem reduzir a legibilidade.").join(" ");
    expect((await invoke()).status).toBe(200);
    expect((await pdfLib.PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(2);
  });
});