"use client";

import { useEffect, useRef, useState } from "react";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api-client";
import { USER_ROLES, type UserRole } from "@/lib/domain";
import { TemplateBuilder } from "./TemplateBuilder";
import { Tooltip } from "./Tooltip";
import { useLocale } from "./LocaleProvider";
import { FALLBACK_BRAND_DARK, FALLBACK_BRAND_LIGHT } from "@/lib/render/video-layout";

type Tab = "style" | "templates" | "users" | "keys" | "settings" | "company" | "balance";

export function AdminPanel({ role }: { role: UserRole }) {
  const { dict } = useLocale();
  const isAdmin = role === "admin";
  const canManageUsers = role === "admin" || role === "manager";
  const [tab, setTab] = useState<Tab>("style");

  const tabs: { id: Tab; label: string; show: boolean }[] = [
    { id: "style", label: dict.adminPanel.tabs.style, show: true },
    { id: "templates", label: dict.adminPanel.tabs.templates, show: true },
    { id: "users", label: dict.adminPanel.tabs.users, show: canManageUsers },
    { id: "keys", label: dict.adminPanel.tabs.apiKeys, show: isAdmin },
    { id: "company", label: dict.adminPanel.tabs.company, show: isAdmin },
    { id: "settings", label: dict.adminPanel.tabs.settings, show: isAdmin },
    { id: "balance", label: dict.adminPanel.tabs.balance, show: isAdmin },
  ];

  return (
    <div className="space-y-5">
      <div className="-mx-4 overflow-x-auto px-4">
        <div className="flex w-max gap-2">
          {tabs
            .filter((t) => t.show)
            .map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-medium transition-colors ${
                  tab === t.id
                    ? "bg-brand-500 text-white"
                    : "bg-elevated text-muted hover:text-ink"
                }`}
              >
                {t.label}
              </button>
            ))}
        </div>
      </div>

      {tab === "style" && <StyleSection />}
      {tab === "templates" && <TemplatesSection />}
      {tab === "users" && canManageUsers && <UsersSection canPromoteAdmin={isAdmin} />}
      {tab === "keys" && isAdmin && <KeysSection />}
      {tab === "company" && isAdmin && <CompanySection />}
      {tab === "settings" && isAdmin && <SettingsSection />}
      {tab === "balance" && isAdmin && <BalanceSection />}
    </div>
  );
}

function useAsyncError() {
  const [error, setError] = useState<string | null>(null);
  const wrap = async (fn: () => Promise<void>) => {
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return { error, wrap };
}

// ── Estilo do jornal (exemplos reais) ────────────────────────
const TITLE_MAX = 69;
const SUBTITLE_MAX = 149;

interface StyleExample {
  id: string;
  title: string | null;
  subtitle: string | null;
  caption: string | null;
}

const EMPTY_FORM = { title: "", subtitle: "", caption: "" };

function StyleSection() {
  const { dict } = useLocale();
  const { error, wrap } = useAsyncError();
  const [examples, setExamples] = useState<StyleExample[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [adding, setAdding] = useState(false);

  const load = () =>
    apiGet<{ examples: StyleExample[] }>("/api/style-examples").then((d) =>
      setExamples(d.examples),
    );
  useEffect(() => {
    load();
  }, []);

  const add = () =>
    wrap(async () => {
      await apiPost("/api/style-examples", form);
      setForm(EMPTY_FORM);
      setAdding(false);
      await load();
    });

  const remove = (id: string) =>
    wrap(async () => {
      await apiDelete(`/api/style-examples/${id}`);
      await load();
    });

  return (
    <div className="max-w-3xl space-y-4">
      <div className="alert-info">
        {dict.adminPanel.styleSection.infoPrefix}
        <strong>{dict.adminPanel.styleSection.infoStrong1}</strong>
        {dict.adminPanel.styleSection.infoMiddle}
        <strong>{dict.adminPanel.styleSection.infoStrong2}</strong>
        {dict.adminPanel.styleSection.infoSuffix}
      </div>

      {/* Exemplos cadastrados */}
      {examples.map((ex, i) => (
        <article key={ex.id} className="card p-4">
          <header className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">
              {dict.adminPanel.styleSection.exampleTitle} {i + 1}
            </h3>
            <button className="btn-danger btn-sm" onClick={() => remove(ex.id)}>
              {dict.common.remove}
            </button>
          </header>
          <dl className="space-y-2.5 text-sm">
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wider text-faint">
                {dict.adminPanel.styleSection.titleLabel}
              </dt>
              <dd className="font-art text-ink">{ex.title || "—"}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wider text-faint">
                {dict.adminPanel.styleSection.subtitleLabel}
              </dt>
              <dd className="font-art text-ink">{ex.subtitle || "—"}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wider text-faint">
                {dict.adminPanel.styleSection.captionDisplayLabel}
              </dt>
              <dd className="whitespace-pre-wrap text-muted">{ex.caption || "—"}</dd>
            </div>
          </dl>
        </article>
      ))}

      {/* Novo exemplo */}
      {adding ? (
        <div className="card space-y-4 p-4">
          <h3 className="text-sm font-semibold">{dict.adminPanel.styleSection.newExampleTitle}</h3>

          <Counted
            id="ex-title" label={dict.adminPanel.styleSection.titleLabel} max={TITLE_MAX}
            value={form.title} onChange={(v) => setForm({ ...form, title: v })}
            placeholder={dict.adminPanel.styleSection.titlePlaceholder}
            tip={dict.adminPanel.styleSection.titleTip}
            where={dict.adminPanel.styleSection.titleWhere}
          />

          <Counted
            id="ex-sub" label={dict.adminPanel.styleSection.subtitleLabel} max={SUBTITLE_MAX} rows={2}
            value={form.subtitle} onChange={(v) => setForm({ ...form, subtitle: v })}
            placeholder={dict.adminPanel.styleSection.subtitlePlaceholder}
            tip={dict.adminPanel.styleSection.subtitleTip}
            where={dict.adminPanel.styleSection.subtitleWhere}
          />

          <div>
            <label className="label" htmlFor="ex-caption">
              {dict.adminPanel.styleSection.captionFieldLabel}
              <Tooltip
                text={dict.adminPanel.styleSection.captionTooltip}
                where={dict.adminPanel.styleSection.captionWhere}
              />
            </label>
            <textarea
              id="ex-caption" className="input min-h-[10rem] resize-y"
              value={form.caption}
              onChange={(e) => setForm({ ...form, caption: e.target.value })}
              placeholder={dict.adminPanel.styleSection.captionPlaceholder}
            />
          </div>

          {error && <p className="alert-error">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" onClick={add}>{dict.adminPanel.styleSection.saveExample}</button>
            <button className="btn-subtle" onClick={() => setAdding(false)}>{dict.common.cancel}</button>
          </div>
        </div>
      ) : (
        <button className="btn-ghost w-full" onClick={() => setAdding(true)}>
          {dict.adminPanel.styleSection.addExample}
        </button>
      )}

      {error && !adding && <p className="alert-error">{error}</p>}
    </div>
  );
}

function Counted({
  id, label, value, onChange, max, rows = 1, placeholder, tip, where,
}: {
  id: string; label: string; value: string;
  onChange: (v: string) => void; max: number;
  rows?: number; placeholder?: string; tip: string; where?: string;
}) {
  const over = value.length > max;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label className="label" htmlFor={id}>
          {label}
          <Tooltip text={tip} where={where} />
        </label>
        <span className={`text-xs tabular-nums ${over ? "text-red-400" : "text-faint"}`}>
          {value.length}/{max}
        </span>
      </div>
      <textarea
        id={id} className="input resize-y font-art" rows={rows}
        value={value} maxLength={max} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

// ── Templates ────────────────────────────────────────────────
interface Template {
  id: string;
  name: string;
  canvasWidth: number;
  canvasHeight: number;
  overlayAssetUrl: string;
  isActive: boolean;
}

function TemplatesSection() {
  const { dict } = useLocale();
  const [templates, setTemplates] = useState<Template[]>([]);

  const load = () =>
    apiGet<{ templates: Template[] }>("/api/art-templates?all=1").then((d) =>
      setTemplates(d.templates),
    );
  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div className="card p-4 sm:p-5">
        <TemplateBuilder onCreated={load} />
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold">
          {dict.adminPanel.templatesSection.registeredTitle} ({templates.length})
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => (
            <div key={t.id} className="card flex items-center gap-3 p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={t.overlayAssetUrl}
                alt=""
                className="h-14 w-14 shrink-0 rounded-lg bg-black object-contain"
              />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{t.name}</div>
                <div className="text-xs text-muted">
                  {t.canvasWidth}×{t.canvasHeight} ·{" "}
                  {t.isActive ? dict.adminPanel.templatesSection.active : dict.adminPanel.templatesSection.inactive}
                </div>
              </div>
            </div>
          ))}
          {templates.length === 0 && (
            <p className="text-sm text-muted">{dict.adminPanel.templatesSection.empty}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Usuários ─────────────────────────────────────────────────
interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
  passwordResetAt: string | null;
}

function UsersSection({ canPromoteAdmin }: { canPromoteAdmin: boolean }) {
  const { dict, locale } = useLocale();
  const dateLocale = locale === "pt" ? "pt-BR" : "en-US";
  const { error, wrap } = useAsyncError();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [form, setForm] = useState({ name: "", email: "", role: "staff" as UserRole });
  const [resetting, setResetting] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState<string | null>(null);
  const assignableRoles = canPromoteAdmin
    ? USER_ROLES
    : USER_ROLES.filter((r) => r !== "admin");

  const load = () =>
    apiGet<{ users: AdminUser[] }>("/api/users").then((d) => setUsers(d.users));
  useEffect(() => {
    load();
  }, []);

  const create = () =>
    wrap(async () => {
      setResetError(null);
      setResetSuccess(null);
      const { user, emailSent, emailError } = await apiPost<{
        user: AdminUser;
        emailSent: boolean;
        emailError?: string;
      }>("/api/users", form);
      setForm({ name: "", email: "", role: "staff" });
      if (emailSent) {
        setResetSuccess(
          `${dict.adminPanel.users.createdSuccessPrefix}${user.email}${dict.adminPanel.users.createdSuccessSuffix}`,
        );
      } else {
        setResetError(
          `${dict.adminPanel.users.createdErrorPrefix}${emailError}${dict.adminPanel.users.createdErrorSuffix}`,
        );
      }
      await load();
    });

  const update = (id: string, patch: Partial<AdminUser>) =>
    wrap(async () => {
      await apiPatch(`/api/users/${id}`, patch);
      await load();
    });

  const resetPassword = async (u: AdminUser) => {
    if (
      !confirm(
        `${dict.adminPanel.users.resetConfirmPrefix}${u.name}${dict.adminPanel.users.resetConfirmMiddle}${u.email}${dict.adminPanel.users.resetConfirmSuffix}`,
      )
    ) {
      return;
    }
    setResetError(null);
    setResetSuccess(null);
    setResetting(u.id);
    try {
      await apiPost(`/api/users/${u.id}/reset-password`);
      setResetSuccess(
        `${dict.adminPanel.users.resetSuccessPrefix}${u.email}${dict.adminPanel.users.resetSuccessSuffix}`,
      );
      await load();
    } catch (err) {
      setResetError((err as Error).message);
    } finally {
      setResetting(null);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="card space-y-3 p-4">
        <h3 className="text-sm font-semibold">{dict.adminPanel.users.newUserTitle}</h3>
        <input className="input" placeholder={dict.adminPanel.users.namePlaceholder} value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className="input" placeholder={dict.adminPanel.users.emailPlaceholder} type="email" value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <select className="input" value={form.role}
          onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}>
          {assignableRoles.map((r) => (
            <option key={r} value={r}>{dict.common.role[r]}</option>
          ))}
        </select>
        {!canPromoteAdmin && (
          <p className="hint">{dict.adminPanel.users.managerHint}</p>
        )}
        {error && <p className="alert-error">{error}</p>}
        <button className="btn-primary" onClick={create}>{dict.adminPanel.users.createButton}</button>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">{dict.adminPanel.users.listTitle} ({users.length})</h3>
        {resetError && <p className="alert-error">{resetError}</p>}
        {resetSuccess && <p className="alert-success">✅ {resetSuccess}</p>}
        {users.map((u) => (
          <div key={u.id} className="card flex flex-wrap items-center gap-2 p-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{u.name}</div>
              <div className="truncate text-xs text-muted">{u.email}</div>
              {u.passwordResetAt && (
                <div className="text-[11px] text-faint">
                  {dict.adminPanel.users.passwordResetAtPrefix}{" "}
                  {new Date(u.passwordResetAt).toLocaleString(dateLocale, {
                    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
                  })}
                </div>
              )}
            </div>
            <select
              className="input w-auto py-1.5 text-xs"
              value={u.role}
              disabled={!canPromoteAdmin && u.role === "admin"}
              onChange={(e) => update(u.id, { role: e.target.value as UserRole })}
            >
              {(canPromoteAdmin || u.role === "admin" ? USER_ROLES : assignableRoles).map(
                (r) => (
                  <option key={r} value={r}>{dict.common.role[r]}</option>
                ),
              )}
            </select>
            <button
              className="btn-subtle btn-sm"
              onClick={() => resetPassword(u)}
              disabled={resetting === u.id}
              title={dict.adminPanel.users.resendLoginTitle}
            >
              {resetting === u.id ? dict.adminPanel.users.sendingButton : dict.adminPanel.users.resendLoginButton}
            </button>
            <button
              className={u.active ? "btn-ghost btn-sm" : "btn-success btn-sm"}
              onClick={() => update(u.id, { active: !u.active })}
            >
              {u.active ? dict.adminPanel.users.deactivateButton : dict.adminPanel.users.activateButton}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── API keys ─────────────────────────────────────────────────
interface ApiKeyRow {
  id: string;
  name: string;
  scopes: string[];
  revokedAt: string | null;
  createdAt: string;
}

function KeysSection() {
  const { dict, locale } = useLocale();
  const dateLocale = locale === "pt" ? "pt-BR" : "en-US";
  const { error, wrap } = useAsyncError();
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [name, setName] = useState("");
  const [secret, setSecret] = useState<string | null>(null);

  const load = () =>
    apiGet<{ keys: ApiKeyRow[] }>("/api/api-keys").then((d) => setKeys(d.keys));
  useEffect(() => {
    load();
  }, []);

  const create = () =>
    wrap(async () => {
      const { key } = await apiPost<{ key: { secret: string } }>("/api/api-keys", { name });
      setSecret(key.secret);
      setName("");
      await load();
    });

  const revoke = (id: string) =>
    wrap(async () => {
      await apiDelete(`/api/api-keys/${id}`);
      await load();
    });

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="card space-y-3 p-4">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          {dict.adminPanel.apiKeys.newKeyTitle}
          <Tooltip text={dict.adminPanel.apiKeys.newKeyTooltip} />
        </h3>
        <input className="input" placeholder={dict.adminPanel.apiKeys.namePlaceholder} value={name}
          onChange={(e) => setName(e.target.value)} />
        {error && <p className="alert-error">{error}</p>}
        <button className="btn-primary" onClick={create} disabled={!name}>
          {dict.adminPanel.apiKeys.createButton}
        </button>
        {secret && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
            <p className="text-sm font-medium text-amber-300">
              {dict.adminPanel.apiKeys.secretWarning}
            </p>
            <code className="mt-1.5 block break-all rounded-lg bg-bg p-2 text-xs">
              {secret}
            </code>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">{dict.adminPanel.apiKeys.listTitle} ({keys.length})</h3>
        {keys.map((k) => (
          <div key={k.id} className="card flex items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{k.name}</div>
              <div className="text-xs text-muted">
                {k.revokedAt ? dict.adminPanel.apiKeys.revoked : dict.adminPanel.apiKeys.active} ·{" "}
                {new Date(k.createdAt).toLocaleDateString(dateLocale)}
              </div>
            </div>
            {!k.revokedAt && (
              <button className="btn-danger btn-sm" onClick={() => revoke(k.id)}>
                {dict.adminPanel.apiKeys.revokeButton}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Empresa (nome, logo, @, cores) ────────────────────────────
interface CompanyInfo {
  name: string;
  logoUrl: string | null;
  instagramHandle: string | null;
  brandColorDark: string | null;
  brandColorLight: string | null;
  brandColorAccent: string | null;
}

const MAX_LOGO_MB = 5;

/**
 * A logo entra na prévia do Instagram e é gravada no rodapé do vídeo
 * renderizado — é o mesmo campo definido no onboarding, editável aqui depois.
 * As cores da marca alimentam os templates de vídeo (ver
 * buildVideoCardStyles em lib/render/video-layout) — <input type="color">
 * sempre precisa de um hex válido, então os campos começam com o fallback
 * que os templates já usam quando a empresa ainda não escolheu as próprias.
 */
function CompanySection() {
  const { dict } = useLocale();
  const t = dict.adminPanel.companySection;
  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [brandColorDark, setBrandColorDark] = useState(FALLBACK_BRAND_DARK);
  const [brandColorLight, setBrandColorLight] = useState(FALLBACK_BRAND_LIGHT);
  const [brandColorAccent, setBrandColorAccent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    apiGet<{ company: CompanyInfo | null }>("/api/companies").then((d) => {
      if (!d.company) return;
      setCompany(d.company);
      setName(d.company.name);
      setHandle(d.company.instagramHandle ?? "");
      setLogoUrl(d.company.logoUrl);
      setBrandColorDark(d.company.brandColorDark ?? FALLBACK_BRAND_DARK);
      setBrandColorLight(d.company.brandColorLight ?? FALLBACK_BRAND_LIGHT);
      setBrandColorAccent(d.company.brandColorAccent);
    });
  }, []);

  async function pickLogo(file: File | undefined | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError(t.invalidLogoType);
      return;
    }
    if (file.size > MAX_LOGO_MB * 1024 * 1024) {
      setError(`${t.logoTooLargePrefix} ${MAX_LOGO_MB}MB.`);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", "overlay"); // preserva transparência — sem recompressão
      const { url } = await apiPost<{ url: string }>("/api/upload", fd);
      setLogoUrl(url);
      setSaved(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const { company: updated } = await apiPatch<{ company: CompanyInfo }>("/api/companies", {
        name: name.trim(),
        logoUrl,
        instagramHandle: handle.trim() || null,
        brandColorDark,
        brandColorLight,
        brandColorAccent,
      });
      setCompany(updated);
      setHandle(updated.instagramHandle ?? "");
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!company) return null;

  return (
    <div className="max-w-xl space-y-4">
      <div className="card space-y-4 p-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => logoInputRef.current?.click()}
            disabled={busy}
            className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-line bg-elevated text-2xl text-faint transition-colors hover:border-brand-500/60"
            title={t.logoPickTitle}
          >
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="h-full w-full object-contain" />
            ) : (
              <span aria-hidden>🏢</span>
            )}
          </button>
          <div className="min-w-0">
            <p className="text-sm font-medium">{t.logoLabel}</p>
            <p className="hint mt-0">{t.logoHint}</p>
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
          <label className="label" htmlFor="company-name-admin">{t.nameLabel}</label>
          <input
            id="company-name-admin"
            className="input"
            value={name}
            onChange={(e) => { setName(e.target.value); setSaved(false); }}
          />
        </div>

        <div>
          <label className="label" htmlFor="company-handle-admin">{t.handleLabel}</label>
          <input
            id="company-handle-admin"
            className="input"
            value={handle}
            placeholder="@seujornal"
            onChange={(e) => { setHandle(e.target.value); setSaved(false); }}
          />
        </div>

        <div className="space-y-3 border-t border-lineSoft pt-4">
          <div>
            <p className="text-sm font-medium">{t.colorsTitle}</p>
            <p className="hint mt-0">{t.colorsHint}</p>
          </div>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <ColorField
              label={t.darkColorLabel}
              value={brandColorDark}
              onChange={(v) => { setBrandColorDark(v); setSaved(false); }}
            />
            <ColorField
              label={t.lightColorLabel}
              value={brandColorLight}
              onChange={(v) => { setBrandColorLight(v); setSaved(false); }}
            />
            <ColorField
              label={t.accentColorLabel}
              value={brandColorAccent ?? "#94a3b8"}
              onChange={(v) => { setBrandColorAccent(v); setSaved(false); }}
              onClear={() => { setBrandColorAccent(null); setSaved(false); }}
              clearable={brandColorAccent !== null}
            />
          </div>
        </div>

        {error && <p className="alert-error">{error}</p>}
        {saved && <p className="alert-success">✅ {t.saved}</p>}

        <button className="btn-primary" onClick={save} disabled={busy || !name.trim()}>
          {busy ? dict.common.saving : dict.common.save}
        </button>
      </div>
    </div>
  );
}

/** Um seletor de cor nativo + hex ao lado — usado pelas 3 cores da marca. */
function ColorField({
  label,
  value,
  onChange,
  onClear,
  clearable,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onClear?: () => void;
  clearable?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-line bg-elevated px-3 py-2.5">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-line bg-transparent p-0"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-muted">{label}</p>
        <p className="truncate text-xs uppercase tabular-nums text-faint">{value}</p>
      </div>
      {clearable && onClear && (
        <button
          type="button"
          onClick={onClear}
          className="shrink-0 text-xs text-faint hover:text-ink"
          title="Limpar"
        >
          ✕
        </button>
      )}
    </div>
  );
}

// ── Configurações gerais ─────────────────────────────────────
interface AppSettings {
  reviewRequired: boolean;
}

function SettingsSection() {
  const { dict } = useLocale();
  const t = dict.adminPanel.settingsSection;
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ settings: AppSettings }>("/api/settings").then((d) => setSettings(d.settings));
  }, []);

  async function toggleReview() {
    if (!settings || saving) return;
    const prev = settings;
    setSettings({ reviewRequired: !prev.reviewRequired });
    setSaving(true);
    setError(null);
    try {
      const { settings: saved } = await apiPatch<{ settings: AppSettings }>("/api/settings", {
        reviewRequired: !prev.reviewRequired,
      });
      setSettings(saved);
    } catch (err) {
      setSettings(prev);
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (!settings) return null;

  return (
    <div className="max-w-2xl space-y-3">
      <div className="card flex items-start justify-between gap-4 p-4">
        <div>
          <h3 className="text-sm font-semibold">{t.reviewToggleTitle}</h3>
          <p className="hint mb-0 mt-1">
            {settings.reviewRequired ? t.reviewToggleOnDesc : t.reviewToggleOffDesc}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={settings.reviewRequired}
          aria-label={t.reviewToggleTitle}
          onClick={toggleReview}
          disabled={saving}
          className={`inline-flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-60 ${
            settings.reviewRequired ? "bg-emerald-500" : "bg-line"
          }`}
        >
          <span
            className={`inline-block h-5 w-5 rounded-full bg-white shadow-soft transition-transform duration-200 ${
              settings.reviewRequired ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>
      {saving && <p className="hint">{t.savingLabel}</p>}
      {error && <p className="alert-error">{error}</p>}
    </div>
  );
}

// ── Saldo de IA (créditos no OpenRouter) ─────────────────────
interface AiBalance {
  provider: "openrouter";
  totalCredits: number;
  totalUsage: number;
  remaining: number;
  key: {
    label: string;
    usage: number;
    usageDaily: number;
    usageWeekly: number;
    usageMonthly: number;
    limit: number | null;
    limitRemaining: number | null;
    isFreeTier: boolean;
    freeModelDailyRequests: { used: number; limit: number; remaining: number } | null;
  };
  fetchedAt: string;
}

type AiBalanceResult =
  | { supported: true; balance: AiBalance; cached: boolean }
  | { supported: false; provider: string };

const OPENROUTER_CREDITS_URL = "https://openrouter.ai/settings/credits";
// Abaixo disso o painel avisa — um post custa centavos, mas quem recarrega
// é o admin e ele não olha aqui todo dia.
const LOW_BALANCE_RATIO = 0.2;
const LOW_BALANCE_USD = 1;

/**
 * Lê o saldo direto na API do OpenRouter (ver services/ai-balance.ts). A
 * chave é global da instalação, então o saldo é o mesmo pra toda empresa.
 */
function BalanceSection() {
  const { dict, locale } = useLocale();
  const t = dict.adminPanel.balanceSection;
  const intlLocale = locale === "pt" ? "pt-BR" : "en-US";
  const [result, setResult] = useState<AiBalanceResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async (fresh = false) => {
    setLoading(true);
    setError(null);
    try {
      setResult(await apiGet<AiBalanceResult>(`/api/ai-balance${fresh ? "?fresh=1" : ""}`));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  // USD com precisão que acompanha o valor: $4.90 no saldo, mas $0.0011 no
  // gasto de hoje — com 2 casas o consumo diário apareceria como "$0.00".
  const usd = (v: number) =>
    new Intl.NumberFormat(intlLocale, {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: v !== 0 && Math.abs(v) < 0.01 ? 4 : 2,
    }).format(v);
  const pct = (v: number) =>
    new Intl.NumberFormat(intlLocale, { style: "percent", maximumFractionDigits: 0 }).format(v);

  if (!result && loading) return <p className="text-sm text-muted">{t.loading}</p>;
  if (error && !result) return <p className="alert-error">{error}</p>;
  if (!result) return null;

  if (!result.supported) {
    return (
      <div className="max-w-2xl">
        <div className="alert-info">
          {t.unsupportedPrefix}
          <code className="rounded bg-bg px-1.5 py-0.5 text-xs">{result.provider}</code>
          {t.unsupportedSuffix}
        </div>
      </div>
    );
  }

  const { balance: b, cached } = result;
  const usedRatio = b.totalCredits > 0 ? Math.min(1, b.totalUsage / b.totalCredits) : 1;
  const remainingRatio = 1 - usedRatio;
  const empty = b.remaining <= 0;
  const low = !empty && (remainingRatio < LOW_BALANCE_RATIO || b.remaining < LOW_BALANCE_USD);
  // O preenchimento do medidor carrega a severidade; a trilha é um degrau
  // mais claro da mesma cor, pra barra inteira ler o estado.
  const meter = empty
    ? { fill: "bg-red-500", track: "bg-red-500/15", text: "text-red-300" }
    : low
      ? { fill: "bg-amber-500", track: "bg-amber-500/15", text: "text-amber-300" }
      : { fill: "bg-emerald-500", track: "bg-emerald-500/15", text: "text-emerald-300" };
  const fetchedAt = new Date(b.fetchedAt).toLocaleTimeString(intlLocale, {
    hour: "2-digit",
    minute: "2-digit",
  });

  const tiles = [
    { label: t.today, value: b.key.usageDaily },
    { label: t.week, value: b.key.usageWeekly },
    { label: t.month, value: b.key.usageMonthly },
    { label: t.total, value: b.key.usage },
  ];

  return (
    <div className="max-w-2xl space-y-4">
      {empty && <p className="alert-error">{t.emptyBalanceWarning}</p>}
      {low && (
        <p className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-3.5 py-2.5 text-sm text-amber-300">
          {t.lowBalanceWarning}
        </p>
      )}

      {/* Número-herói: o saldo que sobra */}
      <div className="card space-y-4 p-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-faint">
            {t.heroLabel}
          </p>
          <p className={`mt-1 text-5xl font-semibold leading-none tracking-tight ${meter.text}`}>
            {usd(b.remaining)}
          </p>
          <p className="mt-2 text-sm text-muted">
            {t.ofPurchasedPrefix}
            <span className="text-ink">{usd(b.totalCredits)}</span>
            {t.ofPurchasedSuffix} · {t.usedPrefix}
            <span className="text-ink">{usd(b.totalUsage)}</span>
            {t.usedSuffix}
          </p>
        </div>

        <div>
          <div className="mb-1.5 flex items-baseline justify-between text-xs">
            <span className="text-faint">{t.meterLabel}</span>
            <span className="tabular-nums text-muted">{pct(usedRatio)}</span>
          </div>
          <div
            role="meter"
            aria-label={t.meterLabel}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(usedRatio * 100)}
            className={`h-2.5 w-full overflow-hidden rounded-full ${meter.track}`}
          >
            <div
              className={`h-full rounded-full transition-[width] duration-500 ${meter.fill}`}
              style={{ width: `${Math.max(usedRatio > 0 ? 1 : 0, usedRatio * 100)}%` }}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-lineSoft pt-3">
          <p className="text-xs text-faint">
            {t.updatedAtPrefix}
            {fetchedAt}
            {cached ? t.cachedSuffix : ""}
          </p>
          <div className="flex gap-2">
            <button className="btn-subtle btn-sm" onClick={() => load(true)} disabled={loading}>
              {loading ? t.refreshing : t.refresh}
            </button>
            <a
              className="btn-ghost btn-sm"
              href={OPENROUTER_CREDITS_URL}
              target="_blank"
              rel="noreferrer noopener"
            >
              {t.addCredits} ↗
            </a>
          </div>
        </div>
      </div>

      {/* Consumo desta chave (só o JornAI) */}
      <div className="card space-y-3 p-4">
        <div>
          <h3 className="text-sm font-semibold">{t.keyTitle}</h3>
          <p className="hint mb-0">{t.keyHint}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {tiles.map((tile) => (
            <div key={tile.label} className="card-soft p-3">
              <p className="text-[11px] text-faint">{tile.label}</p>
              <p className="mt-0.5 text-lg font-semibold text-ink">{usd(tile.value)}</p>
            </div>
          ))}
        </div>
        {b.key.limit !== null && (
          <p className="text-xs text-muted">
            {t.keyLimitPrefix}
            <span className="text-ink">{usd(b.key.limit)}</span>
            {b.key.limitRemaining !== null && (
              <>
                {t.keyLimitRemainingPrefix}
                <span className="text-ink">{usd(b.key.limitRemaining)}</span>
              </>
            )}
          </p>
        )}
      </div>

      {/* Cota diária dos modelos gratuitos (3º elo da corrente) */}
      {b.key.freeModelDailyRequests && (
        <div className="card flex items-center justify-between gap-4 p-4">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">{t.freeRequestsTitle}</h3>
            <p className="hint mb-0">{t.freeRequestsHint}</p>
          </div>
          <p className="shrink-0 text-lg font-semibold tabular-nums text-ink">
            {b.key.freeModelDailyRequests.used}
            <span className="text-sm font-normal text-faint">
              {" / "}
              {b.key.freeModelDailyRequests.limit}
            </span>
          </p>
        </div>
      )}

      {error && <p className="alert-error">{error}</p>}
    </div>
  );
}
