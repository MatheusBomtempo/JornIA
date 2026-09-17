import { getCurrentUser } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { CaptureForm } from "@/components/CaptureForm";
import { Stepper } from "@/components/Stepper";
import { getServerDictionary } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function CapturePage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const { dict } = await getServerDictionary();

  return (
    <AppShell user={{ name: user.name, role: user.role, mustSetPassword: user.passwordResetAt !== null }}>
      <div className="mx-auto max-w-2xl">
        <header className="mb-4">
          <h1 className="text-xl font-bold tracking-tight">{dict.capturePage.title}</h1>
          <p className="mt-1 text-sm text-muted">{dict.capturePage.subtitle}</p>
        </header>
        <div className="mb-5">
          <Stepper steps={dict.capturePage.steps} current={0} />
        </div>
        <CaptureForm />
      </div>
    </AppShell>
  );
}
