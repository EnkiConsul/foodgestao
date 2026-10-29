import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { SuspensaoNovoModal } from "@/components/dp/disciplinar/SuspensaoNovoModal";
const mocks = vi.hoisted(() => ({registrar:vi.fn().mockResolvedValue("fixture"),invoke:vi.fn().mockResolvedValue({data:{signed_url:null},error:null})}));
vi.mock("@/lib/dp/colaborador-oficial",()=>({registrarDisciplinar:mocks.registrar}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{functions:{invoke:mocks.invoke}}}));
vi.mock("@/hooks/useCompanyContext",()=>({useCompanyContext:()=>({selectedCompanyId:"empresa"})}));
vi.mock("@/components/dp/DpDialogShell",()=>({DpDialogShell:({children,footer}: {children:React.ReactNode;footer:React.ReactNode})=><div>{children}{footer}</div>}));
vi.mock("@/components/dp/disciplinar/DisciplinarAntecedentes",()=>({DisciplinarAntecedentes:({onChange}:{onChange:(v:string[])=>void})=><button onClick={()=>onChange(["verbal"])}>Selecionar referência</button>}));
describe("suspensão no calendário",()=>{
  it("envia os antecedentes selecionados sem perder motivo e novos fatos",async()=>{
    render(<QueryClientProvider client={new QueryClient()}><SuspensaoNovoModal open onOpenChange={()=>{}} colaboradorId="pessoa" colaboradorNome="Fictício" regime="clt" data="2026-10-29" /></QueryClientProvider>);
    fireEvent.click(screen.getByRole("checkbox",{name:"Indisciplina / Descumprimento de Normas Internas"}));
    fireEvent.change(screen.getByRole("textbox"),{target:{value:"Novos fatos fictícios descritos."}});
    fireEvent.click(screen.getByRole("button",{name:"Selecionar referência"}));
    fireEvent.click(screen.getByRole("button",{name:"Registrar e Gerar Modelo"}));
    await waitFor(()=>expect(mocks.registrar).toHaveBeenCalledWith(expect.objectContaining({antecedentesIds:["verbal"],motivo:"Indisciplina / Descumprimento de Normas Internas",descricao:"Novos fatos fictícios descritos."})));
  });
});