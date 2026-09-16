import { getCurrentUser } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { CaptureForm } from "@/components/CaptureForm";
import { Stepper } from "@/components/Stepper";

export const dynamic = "force-dynamic";

export default async function CapturePage() {
  const user = await getCurrentUser();
  if (!user) return null;

  return (
    <AppShell user={{ name: user.name, role: user.role, mustSetPassword: user.passwordResetAt !== null }}>
      <div className="mx-auto max-w-2xl">
        <header className="mb-4">
          <h1 className="text-xl font-bold tracking-tight">Nova pauta</h1>
          <p className="mt-1 text-sm text-muted">
            Manda o que você tem. A IA escreve o post e você só ajusta a foto e aprova.
          </p>
        </header>
        <div className="mb-5">
          <Stepper steps={["Texto", "Imagem", "Revisão"]} current={0} />
        </div>
        <CaptureForm />
      </div>
    </AppShell>
  );
}
