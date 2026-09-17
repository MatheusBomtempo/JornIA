"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/api-client";
import { useLocale } from "./LocaleProvider";

/**
 * Sugestão (não bloqueia) pra quem ainda está na senha temporária
 * "sucessoNN" trocar por uma senha própria. Some quando a troca é feita
 * (passwordResetAt zera) ou se a pessoa dispensar nesta sessão.
 */
export function ChangePasswordBanner() {
  const router = useRouter();
  const { dict } = useLocale();
  const [dismissed, setDismissed] = useState(false);
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (dismissed) return null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError(dict.changePasswordBanner.passwordsDontMatch);
      return;
    }
    setLoading(true);
    try {
      await apiPost("/api/auth/change-password", { password });
      setDismissed(true);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <div className="alert-info mb-5 flex flex-wrap items-center justify-between gap-3">
        <span>{dict.changePasswordBanner.banner}</span>
        <div className="flex shrink-0 gap-2">
          <button onClick={() => setOpen(true)} className="btn-primary btn-sm">
            {dict.changePasswordBanner.setNewPassword}
          </button>
          <button onClick={() => setDismissed(true)} className="btn-ghost btn-sm">
            {dict.changePasswordBanner.notNow}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="card mb-5 space-y-3 p-4">
      <p className="text-sm font-medium">{dict.changePasswordBanner.formTitle}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="new-password">{dict.changePasswordBanner.newPasswordLabel}</label>
          <input
            id="new-password" type="password" className="input" value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password" required minLength={8}
          />
        </div>
        <div>
          <label className="label" htmlFor="confirm-password">{dict.changePasswordBanner.confirmPasswordLabel}</label>
          <input
            id="confirm-password" type="password" className="input" value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password" required minLength={8}
          />
        </div>
      </div>

      {error && <p className="alert-error">{error}</p>}

      <div className="flex gap-2">
        <button type="submit" className="btn-primary btn-sm" disabled={loading}>
          {loading ? dict.changePasswordBanner.saving : dict.changePasswordBanner.save}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn-ghost btn-sm">
          {dict.changePasswordBanner.cancel}
        </button>
      </div>
    </form>
  );
}
