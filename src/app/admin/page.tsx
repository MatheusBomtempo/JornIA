import { getCurrentUser } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { AdminPanel } from "@/components/AdminPanel";

export const dynamic = "force-dynamic";

// Todo papel entra aqui — AdminPanel decide as abas visíveis por role
// (estilo/templates: todo mundo; usuários: manager+admin; API keys: só admin).
export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  return (
    <AppShell user={{ name: user.name, role: user.role }}>
      <header className="mb-5">
        <h1 className="text-xl font-bold tracking-tight">Administração</h1>
        <p className="mt-1 text-sm text-muted">
          Configure o estilo do jornal, o template da arte e quem tem acesso.
        </p>
      </header>

      <AdminPanel role={user.role} />
    </AppShell>
  );
}
