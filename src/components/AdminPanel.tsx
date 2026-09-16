"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api-client";
import { ROLE_LABELS, USER_ROLES, type UserRole } from "@/lib/domain";
import { TemplateBuilder } from "./TemplateBuilder";
import { Tooltip } from "./Tooltip";

type Tab = "style" | "templates" | "users" | "keys";

export function AdminPanel({ role }: { role: UserRole }) {
  const isAdmin = role === "admin";
  const canManageUsers = role === "admin" || role === "manager";
  const [tab, setTab] = useState<Tab>("style");

  const tabs: { id: Tab; label: string; show: boolean }[] = [
    { id: "style", label: "Estilo do jornal", show: true },
    { id: "templates", label: "Templates", show: true },
    { id: "users", label: "Usuários", show: canManageUsers },
    { id: "keys", label: "API keys", show: isAdmin },
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
        Cadastre <strong>posts reais do seu jornal</strong> como referência. A IA usa
        todos eles para aprender o <strong>tom e o formato</strong> — nunca copia o
        conteúdo. Quanto mais variados os exemplos, melhor o resultado.
      </div>

      {/* Exemplos cadastrados */}
      {examples.map((ex, i) => (
        <article key={ex.id} className="card p-4">
          <header className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Exemplo {i + 1}</h3>
            <button className="btn-danger btn-sm" onClick={() => remove(ex.id)}>
              Remover
            </button>
          </header>
          <dl className="space-y-2.5 text-sm">
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wider text-faint">
                Título na imagem
              </dt>
              <dd className="font-art text-ink">{ex.title || "—"}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wider text-faint">
                Subtítulo na imagem
              </dt>
              <dd className="font-art text-ink">{ex.subtitle || "—"}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wider text-faint">
                Legenda
              </dt>
              <dd className="whitespace-pre-wrap text-muted">{ex.caption || "—"}</dd>
            </div>
          </dl>
        </article>
      ))}

      {/* Novo exemplo */}
      {adding ? (
        <div className="card space-y-4 p-4">
          <h3 className="text-sm font-semibold">Novo exemplo</h3>

          <Counted
            id="ex-title" label="Título na imagem" max={TITLE_MAX}
            value={form.title} onChange={(v) => setForm({ ...form, title: v })}
            placeholder="Tragédia em BH: acidente entre motos deixa dois mortos"
            tip="A manchete escrita SOBRE a foto. Curta e direta, no máximo 69 caracteres."
            where="Aparece dentro da arte, na parte de cima do bloco de texto"
          />

          <Counted
            id="ex-sub" label="Subtítulo na imagem" max={SUBTITLE_MAX} rows={2}
            value={form.subtitle} onChange={(v) => setForm({ ...form, subtitle: v })}
            placeholder="Duas pessoas morreram em acidente na José Cândido da Silveira."
            tip="Uma frase logo abaixo do título, com um detalhe que o título não disse. Máximo 149 caracteres."
            where="Aparece dentro da arte, logo abaixo do título"
          />

          <div>
            <label className="label" htmlFor="ex-caption">
              Legenda do Instagram
              <Tooltip
                text="O texto completo do post, com os parágrafos, os créditos (📸 @fulano) e as hashtags no fim — exatamente como sua redação publica."
                where="Vai publicada embaixo da imagem, no Instagram"
              />
            </label>
            <textarea
              id="ex-caption" className="input min-h-[10rem] resize-y"
              value={form.caption}
              onChange={(e) => setForm({ ...form, caption: e.target.value })}
              placeholder={"Um grave acidente envolvendo duas motocicletas…\n\n📸 @fotografo\n\n#BH #Acidente"}
            />
          </div>

          {error && <p className="alert-error">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" onClick={add}>Salvar exemplo</button>
            <button className="btn-subtle" onClick={() => setAdding(false)}>Cancelar</button>
          </div>
        </div>
      ) : (
        <button className="btn-ghost w-full" onClick={() => setAdding(true)}>
          + Adicionar exemplo
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
          Templates cadastrados ({templates.length})
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
                  {t.isActive ? "ativo" : "inativo"}
                </div>
              </div>
            </div>
          ))}
          {templates.length === 0 && (
            <p className="text-sm text-muted">Nenhum template ainda.</p>
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
  const { error, wrap } = useAsyncError();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [form, setForm] = useState({
    name: "", email: "", password: "", role: "staff" as UserRole,
  });
  const [resetting, setResetting] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
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
      await apiPost("/api/users", form);
      setForm({ name: "", email: "", password: "", role: "staff" });
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
        `Gerar uma senha nova pra ${u.name} e mandar por e-mail pra ${u.email}?`,
      )
    ) {
      return;
    }
    setResetError(null);
    setResetting(u.id);
    try {
      await apiPost(`/api/users/${u.id}/reset-password`);
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
        <h3 className="text-sm font-semibold">Novo usuário</h3>
        <input className="input" placeholder="Nome" value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className="input" placeholder="E-mail" type="email" value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input className="input" placeholder="Senha (mín. 8)" type="password" value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <select className="input" value={form.role}
          onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}>
          {assignableRoles.map((r) => (
            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
          ))}
        </select>
        {!canPromoteAdmin && (
          <p className="hint">Gerente só cria contas de gerente ou jornalista.</p>
        )}
        {error && <p className="alert-error">{error}</p>}
        <button className="btn-primary" onClick={create}>Criar usuário</button>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Usuários ({users.length})</h3>
        {resetError && <p className="alert-error">{resetError}</p>}
        {users.map((u) => (
          <div key={u.id} className="card flex flex-wrap items-center gap-2 p-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{u.name}</div>
              <div className="truncate text-xs text-muted">{u.email}</div>
              {u.passwordResetAt && (
                <div className="text-[11px] text-faint">
                  login enviado em{" "}
                  {new Date(u.passwordResetAt).toLocaleString("pt-BR", {
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
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ),
              )}
            </select>
            <button
              className="btn-subtle btn-sm"
              onClick={() => resetPassword(u)}
              disabled={resetting === u.id}
              title="Gera uma senha nova e manda por e-mail"
            >
              {resetting === u.id ? "Enviando…" : "Enviar login"}
            </button>
            <button
              className={u.active ? "btn-ghost btn-sm" : "btn-success btn-sm"}
              onClick={() => update(u.id, { active: !u.active })}
            >
              {u.active ? "Desativar" : "Ativar"}
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
          Nova API key
          <Tooltip text="Para integrar outro sistema da redação com o JornIA (ex.: enviar pautas automaticamente). Não é necessária para o uso normal pelo site." />
        </h3>
        <input className="input" placeholder="Nome da chave" value={name}
          onChange={(e) => setName(e.target.value)} />
        {error && <p className="alert-error">{error}</p>}
        <button className="btn-primary" onClick={create} disabled={!name}>
          Gerar chave
        </button>
        {secret && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
            <p className="text-sm font-medium text-amber-300">
              Copie agora — não será exibida de novo:
            </p>
            <code className="mt-1.5 block break-all rounded-lg bg-bg p-2 text-xs">
              {secret}
            </code>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Chaves ({keys.length})</h3>
        {keys.map((k) => (
          <div key={k.id} className="card flex items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{k.name}</div>
              <div className="text-xs text-muted">
                {k.revokedAt ? "revogada" : "ativa"} ·{" "}
                {new Date(k.createdAt).toLocaleDateString("pt-BR")}
              </div>
            </div>
            {!k.revokedAt && (
              <button className="btn-danger btn-sm" onClick={() => revoke(k.id)}>
                Revogar
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
