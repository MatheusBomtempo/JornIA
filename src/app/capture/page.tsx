import { getCurrentUser } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { CaptureForm } from "@/components/CaptureForm";

export const dynamic = "force-dynamic";

export default async function CapturePage() {
  const user = await getCurrentUser();
  if (!user) return null;

  return (
    <AppShell user={{ name: user.name, role: user.role }}>
      <div className="mx-auto max-w-2xl">
        <header className="mb-5">
          <h1 className="text-xl font-bold tracking-tight">Nova pauta</h1>
          <p className="mt-1 text-sm text-muted">
            Manda o que você tem. A IA escreve o post e você só ajusta a foto e aprova.
          </p>
        </header>
        <CaptureForm />
      </div>
    </AppShell>
  );
}
