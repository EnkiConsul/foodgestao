import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import Dashboard from "./pages/Dashboard";
import Lancamentos from "./pages/Lancamentos";
import Contas from "./pages/Contas";
import FluxoCaixa from "./pages/FluxoCaixa";
import Orcamento from "./pages/Orcamento";
import Relatorios from "./pages/Relatorios";
import Contatos from "./pages/Contatos";
import Categorias from "./pages/Categorias";
import Configuracoes from "./pages/Configuracoes";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/lancamentos" element={<Lancamentos />} />
            <Route path="/contas" element={<Contas />} />
            <Route path="/fluxo-caixa" element={<FluxoCaixa />} />
            <Route path="/orcamento" element={<Orcamento />} />
            <Route path="/relatorios" element={<Relatorios />} />
            <Route path="/contatos" element={<Contatos />} />
            <Route path="/categorias" element={<Categorias />} />
            <Route path="/configuracoes" element={<Configuracoes />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
