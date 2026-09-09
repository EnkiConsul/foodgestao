import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminOnlineUsers } from "@/components/admin/AdminOnlineUsers";

export default function AdminConectados() {
  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Usuários Conectados"
        description="Quem está usando a plataforma agora, em tempo real"
      />
      <AdminOnlineUsers />
    </div>
  );
}
