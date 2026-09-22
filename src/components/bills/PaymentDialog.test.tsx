import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { PaymentDialog } from "./PaymentDialog";
const mocks=vi.hoisted(()=>({rpc:vi.fn(),from:vi.fn(),error:vi.fn(),success:vi.fn()}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{rpc:mocks.rpc,from:mocks.from}}));
vi.mock("@/hooks/useAuth",()=>({useAuth:()=>({user:{id:"actor"}})}));
vi.mock("@/hooks/useCompanyContext",()=>({useCompanyContext:()=>({contextType:"pj",selectedCompanyId:"company"})}));
vi.mock("sonner",()=>({toast:{error:mocks.error,success:mocks.success}}));
const bill={id:"bill",description:"Despesa teste",amount:100,amount_paid:0,transaction_type:"saida" as const,account_id:"account",category_id:null,contact_id:null};
function builder(table:string) {
 const result=table==="transactions"
 ? {data:{amount:100,amount_paid:0,status:"pendente",payment_ledger_enabled:true},error:null}
 : {data:table==="accounts"?[{id:"account",name:"Conta teste"}]:[],error:null};
 const q:any={};
 for(const method of ["select","eq","is","order"])q[method]=()=>q;
 q.single=()=>Promise.resolve(result);
 q.then=(resolve:any,reject:any)=>Promise.resolve(result).then(resolve,reject);
 return q;
}
beforeEach(()=>{
 localStorage.clear();vi.clearAllMocks();
 mocks.from.mockImplementation(builder);
 mocks.rpc.mockImplementation((name:string)=>Promise.resolve({data:name==="get_accessible_payment_methods"?[]:{remaining:60},error:null}));
});
afterEach(cleanup);
async function ready(){
 await screen.findByRole("button",{name:"Registrar pagamento"});
 fireEvent.change(screen.getByLabelText("Valor do pagamento"),{target:{value:"4000"}});
}
describe("PaymentDialog request safety",()=>{
 it("sends only the new payment to the atomic RPC",async()=>{
  render(<PaymentDialog open bill={bill} onOpenChange={()=>{}} onPaid={()=>{}}/>);
  await ready();fireEvent.click(screen.getByRole("button",{name:"Registrar pagamento"}));
  await waitFor(()=>expect(mocks.rpc).toHaveBeenCalledWith("record_transaction_payment",expect.objectContaining({_amount:40,_transaction_id:"bill",_account_id:"account"})));
  const args=mocks.rpc.mock.calls.find(c=>c[0]==="record_transaction_payment")![1];
  expect(args).not.toHaveProperty("amount_paid");
  await waitFor(()=>expect(localStorage.getItem("f02-payment:actor:bill")).toBeNull());
 });
 it("reuses the request key after an uncertain response and reopening",async()=>{
  let attempts=0;
  mocks.rpc.mockImplementation((name:string)=>name==="get_accessible_payment_methods"
   ? Promise.resolve({data:[],error:null})
   : ++attempts===1 ? Promise.reject(new Error("Connection lost")) : Promise.resolve({data:{remaining:60},error:null}));
  const props={bill,onOpenChange:()=>{},onPaid:()=>{}};
  const view=render(<PaymentDialog {...props} open/>);
  await ready();fireEvent.click(screen.getByRole("button",{name:"Registrar pagamento"}));
  await waitFor(()=>expect(mocks.error).toHaveBeenCalled());
  const first=mocks.rpc.mock.calls.find(c=>c[0]==="record_transaction_payment")![1];
  view.rerender(<PaymentDialog {...props} open={false}/>);
  view.rerender(<PaymentDialog {...props} open/>);
  await screen.findByRole("button",{name:"Registrar pagamento"});
  await waitFor(()=>expect(screen.getByLabelText("Valor do pagamento")).toHaveValue("40,00"));
  fireEvent.click(screen.getByRole("button",{name:"Registrar pagamento"}));
  await waitFor(()=>expect(mocks.rpc.mock.calls.filter(c=>c[0]==="record_transaction_payment")).toHaveLength(2));
  expect(mocks.rpc.mock.calls.filter(c=>c[0]==="record_transaction_payment")[1][1]).toEqual(first);
 });
 it("prevents a second in-flight submit",async()=>{
  mocks.rpc.mockImplementation((name:string)=>name==="get_accessible_payment_methods"
   ? Promise.resolve({data:[],error:null}) : new Promise(()=>{}));
  render(<PaymentDialog open bill={bill} onOpenChange={()=>{}} onPaid={()=>{}}/>);
  await ready();
  const button=screen.getByRole("button",{name:"Registrar pagamento"});
  fireEvent.click(button);fireEvent.click(button);
  expect(mocks.rpc.mock.calls.filter(c=>c[0]==="record_transaction_payment")).toHaveLength(1);
 });
 it("does not replace an uncertain request with edited values",async()=>{
  mocks.rpc.mockImplementation((name:string)=>name==="get_accessible_payment_methods"
   ? Promise.resolve({data:[],error:null}) : Promise.reject(new Error("Connection lost")));
  render(<PaymentDialog open bill={bill} onOpenChange={()=>{}} onPaid={()=>{}}/>);
  await ready();fireEvent.click(screen.getByRole("button",{name:"Registrar pagamento"}));
  await waitFor(()=>expect(mocks.error).toHaveBeenCalled());
  const before=localStorage.getItem("f02-payment:actor:bill");
  fireEvent.change(screen.getByLabelText("Valor do pagamento"),{target:{value:"5000"}});
  fireEvent.click(screen.getByRole("button",{name:"Registrar pagamento"}));
  expect(mocks.rpc.mock.calls.filter(c=>c[0]==="record_transaction_payment")).toHaveLength(1);
  expect(localStorage.getItem("f02-payment:actor:bill")).toEqual(before);
 });
});
