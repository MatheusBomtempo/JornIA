"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiPost } from "@/lib/api-client";
import { useLocale } from "@/components/LocaleProvider";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { dict } = useLocale();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiPost("/api/auth/login", { email, password });
      router.push(params.get("next") || "/dashboard");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

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
          <p className="mt-2 text-sm text-muted">{dict.login.tagline}</p>
        </div>

        <form onSubmit={onSubmit} className="card space-y-4 p-6">
          <div>
            <label className="label" htmlFor="email">{dict.login.emailLabel}</label>
            <input
              id="email" type="email" className="input" value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email" required autoFocus
            />
          </div>
          <div>
            <label className="label" htmlFor="password">{dict.login.passwordLabel}</label>
            <input
              id="password" type="password" className="input" value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password" required
            />
          </div>

          {error && <p className="alert-error">{error}</p>}

          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? dict.login.submitting : dict.login.submit}
          </button>
        </form>
      </div>
    </div>
  );
}
