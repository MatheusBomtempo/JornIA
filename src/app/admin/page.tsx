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
      <h1 className="mb-6 text-xl font-semibold">Administração</h1>
      {isStaff ? (
        <div className="card p-8 text-center text-gray-500">
          Área restrita a editores/gerentes e administradores.
        </div>
      ) : (
        <AdminPanel role={user.role} />
      )}
    </AppShell>
  );
}
