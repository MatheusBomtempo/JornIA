import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getServerDictionary } from "@/lib/i18n/server";
import { CompanyOnboardingForm } from "@/components/CompanyOnboardingForm";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.companyId) redirect("/dashboard");

  const { dict } = await getServerDictionary();

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-5 flex justify-center">
          <LanguageSwitcher />
        </div>

        <div className="mb-7 text-center">
          <div className="text-3xl font-extrabold tracking-tight">
            Jorn<span className="text-brand-400">AI</span>
          </div>
          <p className="mt-2 text-sm text-muted">{dict.onboarding.tagline}</p>
        </div>

        <div className="card space-y-4 p-6">
          <div>
            <h1 className="text-base font-semibold">{dict.onboarding.title}</h1>
            <p className="hint mt-1">{dict.onboarding.subtitle}</p>
          </div>
          <CompanyOnboardingForm />
        </div>
      </div>
    </div>
  );
}
