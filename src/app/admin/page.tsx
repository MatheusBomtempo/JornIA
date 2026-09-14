import { getCurrentUser } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { AdminPanel } from "@/components/AdminPanel";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const isStaff = user.role === "staff";

  return (
    <AppShell user={{ name: user.name, role: user.role }}>
      <header className="mb-5">
        <h1 className="text-xl font-bold tracking-tight">Administração</h1>
        <p className="mt-1 text-sm text-muted">
          Configure o estilo do jornal, o template da arte e quem tem acesso.
        </p>
      </header>

      {isStaff ? (
        <div className="card px-6 py-12 text-center text-muted">
          Área restrita a editores/gerentes e administradores.
        </div>
      ) : (
        <AdminPanel role={user.role} />
      )}
    </AppShell>
  );
}
