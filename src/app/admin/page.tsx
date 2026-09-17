import { getCurrentUser } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { AdminPanel } from "@/components/AdminPanel";
import { getServerDictionary } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

// Todo papel entra aqui — AdminPanel decide as abas visíveis por role
// (estilo/templates: todo mundo; usuários: manager+admin; API keys: só admin).
export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const { dict } = await getServerDictionary();

  return (
    <AppShell user={{ name: user.name, role: user.role, mustSetPassword: user.passwordResetAt !== null }}>
      <header className="mb-5">
        <h1 className="text-xl font-bold tracking-tight">{dict.adminPage.title}</h1>
        <p className="mt-1 text-sm text-muted">{dict.adminPage.subtitle}</p>
      </header>

      <AdminPanel role={user.role} />
    </AppShell>
  );
}
