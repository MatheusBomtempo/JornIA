"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api-client";
import { USER_ROLES, type UserRole } from "@/lib/domain";
import { TemplateBuilder } from "./TemplateBuilder";
import { Tooltip } from "./Tooltip";
import { useLocale } from "./LocaleProvider";

type Tab = "style" | "templates" | "users" | "keys" | "settings";

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
    { id: "settings", label: dict.adminPanel.tabs.settings, show: isAdmin },
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
      {tab === "settings" && isAdmin && <SettingsSection />}
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
          className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-60 ${
            settings.reviewRequired ? "bg-emerald-500" : "bg-line"
          }`}
        >
          <span
            className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-soft transition-transform duration-200 ${
              settings.reviewRequired ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>
      {saving && <p className="hint">{t.savingLabel}</p>}
      {error && <p className="alert-error">{error}</p>}
    </div>
  );
}
