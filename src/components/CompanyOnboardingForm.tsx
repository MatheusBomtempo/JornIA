"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/api-client";
import { useLocale } from "./LocaleProvider";

const MAX_LOGO_MB = 5;

export function CompanyOnboardingForm() {
  const router = useRouter();
  const { dict } = useLocale();
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  async function pickLogo(file: File | undefined | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError(dict.onboarding.errors.invalidLogoType);
      return;
    }
    if (file.size > MAX_LOGO_MB * 1024 * 1024) {
      setError(
        `${dict.onboarding.errors.logoTooLargePrefix} ${MAX_LOGO_MB}${dict.onboarding.errors.logoTooLargeSuffix}`,
      );
      return;
    }
    setError(null);
    setLogoUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", "overlay"); // preserva transparência/qualidade — sem recompressão
      const { url } = await apiPost<{ url: string }>("/api/upload", fd);
      setLogoUrl(url);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLogoUploading(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await apiPost("/api/companies", {
        name: name.trim(),
        logoUrl: logoUrl ?? undefined,
        instagramHandle: handle.trim() || undefined,
      });
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => logoInputRef.current?.click()}
          disabled={logoUploading}
          className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-line bg-elevated text-2xl text-faint transition-colors hover:border-brand-500/60"
          title={dict.onboarding.logoPickTitle}
        >
          {logoUploading ? (
            <span className="text-xs text-muted">…</span>
          ) : logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="h-full w-full object-contain" />
          ) : (
            <span aria-hidden>🏢</span>
          )}
        </button>
        <div className="min-w-0">
          <p className="text-sm font-medium">{dict.onboarding.logoLabel}</p>
          <p className="hint mt-0">{dict.onboarding.logoHint}</p>
        </div>
        <input
          ref={logoInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => pickLogo(e.target.files?.[0])}
        />
      </div>

      <div>
        <label className="label" htmlFor="company-name">
          {dict.onboarding.nameLabel}
        </label>
        <input
          id="company-name"
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={dict.onboarding.namePlaceholder}
          required
          autoFocus
        />
      </div>

      <div>
        <label className="label" htmlFor="company-handle">
          {dict.onboarding.handleLabel}
        </label>
        <input
          id="company-handle"
          className="input"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          placeholder={dict.onboarding.handlePlaceholder}
        />
        <p className="hint">{dict.onboarding.handleHint}</p>
      </div>

      {error && <p className="alert-error">{error}</p>}

      <button type="submit" className="btn-primary w-full" disabled={saving || !name.trim()}>
        {saving ? dict.onboarding.submitting : dict.onboarding.submit}
      </button>
    </form>
  );
}
