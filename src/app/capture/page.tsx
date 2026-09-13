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
        <h1 className="mb-1 text-xl font-semibold">Nova pauta</h1>
        <p className="mb-6 text-sm text-gray-500">
          Envie a fonte. A IA gera o texto e você ajusta a arte no passo seguinte.
        </p>
        <CaptureForm />
      </div>
    </AppShell>
  );
}
