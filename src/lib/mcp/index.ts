import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listCompanies from "./tools/list-companies";
import listAccounts from "./tools/list-accounts";
import listTransactions from "./tools/list-transactions";
import listColaboradores from "./tools/list-colaboradores";

// O issuer OAuth precisa ser o host direto do Supabase, montado a partir do
// project ref (inlinado pelo Vite em build time, mantendo o módulo import-safe).
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "360-food",
  title: "360°FOOD",
  version: "0.1.0",
  instructions:
    "Ferramentas do 360°FOOD (gestão financeira e de pessoas para food service). Use list_companies para descobrir as empresas do usuário, list_accounts para saldos, list_transactions para lançamentos e contas a pagar/receber, e list_colaboradores para a equipe do módulo Pessoas 360°. Todas as chamadas respeitam as permissões do usuário conectado.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listCompanies, listAccounts, listTransactions, listColaboradores],
});
