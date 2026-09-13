"use client";

import { useEffect, useState } from "react";
import {
  apiGet,
  apiPost,
  apiPut,
  apiPatch,
  apiDelete,
} from "@/lib/api-client";
import { ROLE_LABELS, USER_ROLES, type UserRole } from "@/lib/domain";

type Tab = "style" | "templates" | "users" | "keys";

export function AdminPanel({ role }: { role: UserRole }) {
  const isAdmin = role === "admin";
  const [tab, setTab] = useState<Tab>("style");

  const tabs: { id: Tab; label: string; adminOnly?: boolean }[] = [
    { id: "style", label: "Style reference" },
    { id: "templates", label: "Templates" },
    { id: "users", label: "Usuários", adminOnly: true },
    { id: "keys", label: "API keys", adminOnly: true },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {tabs
          .filter((t) => !t.adminOnly || isAdmin)
          .map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                tab === t.id
                  ? "bg-brand-600 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-100"
              }`}
            >
              {t.label}
            </button>
          ))}
      </div>

      {tab === "style" && <StyleSection />}
      {tab === "templates" && <TemplatesSection />}
      {tab === "users" && isAdmin && <UsersSection />}
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

// ── Style reference ──────────────────────────────────────────
function StyleSection() {
  const { error, wrap } = useAsyncError();
  const [form, setForm] = useState({
    exampleTitle: "",
    exampleShortNews: "",
    exampleCaption: "",
    exampleArtText: "",
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    apiGet<{ style: typeof form | null }>("/api/style-reference").then((d) => {
      if (d.style) setForm({ ...form, ...d.style });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = () =>
    wrap(async () => {
      await apiPut("/api/style-reference", form);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });

  return (
    <div className="card max-w-2xl space-y-4 p-6">
      <p className="text-sm text-gray-500">
        Um único exemplo de referência que a IA imita (tom, não conteúdo).
      </p>
      {(
        [
          ["exampleTitle", "Título de exemplo"],
          ["exampleShortNews", "Notícia curta de exemplo"],
          ["exampleCaption", "Legenda de exemplo"],
          ["exampleArtText", "Texto de arte de exemplo"],
        ] as const
      ).map(([key, label]) => (
        <div key={key}>
          <label className="label">{label}</label>
          <textarea
            className="input"
            rows={2}
            value={form[key]}
            onChange={(e) => setForm({ ...form, [key]: e.target.value })}
          />
        </div>
      ))}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button className="btn-primary" onClick={save}>
        {saved ? "Salvo ✓" : "Salvar"}
      </button>
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
  const { error, wrap } = useAsyncError();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [overlayUrl, setOverlayUrl] = useState("");
  const [name, setName] = useState("");
  const [size, setSize] = useState({ w: 1080, h: 1080 });
  const [photoSlot, setPhotoSlot] = useState({ x: 0, y: 0, width: 1080, height: 720 });
  const [textSlot, setTextSlot] = useState({
    x: 60,
    y: 780,
    width: 960,
    height: 240,
    fontSize: 64,
    color: "#ffffff",
    align: "left" as "left" | "center" | "right",
  });

  const load = () =>
    apiGet<{ templates: Template[] }>("/api/art-templates?all=1").then((d) =>
      setTemplates(d.templates),
    );
  useEffect(() => {
    load();
  }, []);

  const uploadOverlay = (file: File) =>
    wrap(async () => {
      const fd = new FormData();
      fd.append("file", file);
      const { url } = await apiPost<{ url: string }>("/api/upload", fd);
      setOverlayUrl(url);
    });

  const create = () =>
    wrap(async () => {
      await apiPost("/api/art-templates", {
        name,
        canvasWidth: size.w,
        canvasHeight: size.h,
        overlayAssetUrl: overlayUrl,
        photoSlot,
        textSlot,
      });
      setName("");
      setOverlayUrl("");
      await load();
    });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="card space-y-4 p-6">
        <h3 className="font-semibold">Novo template</h3>
        <div>
          <label className="label">Nome</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <NumField label="Largura" value={size.w} onChange={(v) => setSize({ ...size, w: v })} />
          <NumField label="Altura" value={size.h} onChange={(v) => setSize({ ...size, h: v })} />
        </div>

        <div>
          <label className="label">Overlay (PNG transparente onde a foto entra)</label>
          <input
            type="file"
            accept="image/png"
            onChange={(e) => e.target.files?.[0] && uploadOverlay(e.target.files[0])}
            className="block w-full text-sm"
          />
          {overlayUrl && <p className="mt-1 text-xs text-emerald-600">overlay enviado ✓</p>}
        </div>

        <fieldset className="rounded-lg border border-gray-200 p-3">
          <legend className="px-1 text-xs font-medium text-gray-500">Slot da foto</legend>
          <div className="grid grid-cols-4 gap-2">
            <NumField label="x" value={photoSlot.x} onChange={(v) => setPhotoSlot({ ...photoSlot, x: v })} />
            <NumField label="y" value={photoSlot.y} onChange={(v) => setPhotoSlot({ ...photoSlot, y: v })} />
            <NumField label="w" value={photoSlot.width} onChange={(v) => setPhotoSlot({ ...photoSlot, width: v })} />
            <NumField label="h" value={photoSlot.height} onChange={(v) => setPhotoSlot({ ...photoSlot, height: v })} />
          </div>
        </fieldset>

        <fieldset className="rounded-lg border border-gray-200 p-3">
          <legend className="px-1 text-xs font-medium text-gray-500">Slot do texto</legend>
          <div className="grid grid-cols-4 gap-2">
            <NumField label="x" value={textSlot.x} onChange={(v) => setTextSlot({ ...textSlot, x: v })} />
            <NumField label="y" value={textSlot.y} onChange={(v) => setTextSlot({ ...textSlot, y: v })} />
            <NumField label="w" value={textSlot.width} onChange={(v) => setTextSlot({ ...textSlot, width: v })} />
            <NumField label="fonte px" value={textSlot.fontSize} onChange={(v) => setTextSlot({ ...textSlot, fontSize: v })} />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div>
              <label className="label">Cor</label>
              <input type="color" className="h-9 w-full rounded" value={textSlot.color} onChange={(e) => setTextSlot({ ...textSlot, color: e.target.value })} />
            </div>
            <div>
              <label className="label">Alinhamento</label>
              <select className="input" value={textSlot.align} onChange={(e) => setTextSlot({ ...textSlot, align: e.target.value as "left" | "center" | "right" })}>
                <option value="left">esquerda</option>
                <option value="center">centro</option>
                <option value="right">direita</option>
              </select>
            </div>
          </div>
        </fieldset>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="btn-primary" onClick={create} disabled={!name || !overlayUrl}>
          Criar template
        </button>
      </div>

      <div className="space-y-3">
        <h3 className="font-semibold">Templates ({templates.length})</h3>
        {templates.map((t) => (
          <div key={t.id} className="card flex items-center gap-3 p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={t.overlayAssetUrl} alt="" className="h-14 w-14 rounded bg-gray-100 object-contain" />
            <div className="flex-1">
              <div className="text-sm font-medium">{t.name}</div>
              <div className="text-xs text-gray-500">
                {t.canvasWidth}×{t.canvasHeight} · {t.isActive ? "ativo" : "inativo"}
              </div>
            </div>
          </div>
        ))}
        {templates.length === 0 && (
          <p className="text-sm text-gray-500">Nenhum template ainda.</p>
        )}
      </div>
    </div>
  );
}

// ── Users ────────────────────────────────────────────────────
interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
}

function UsersSection() {
  const { error, wrap } = useAsyncError();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "staff" as UserRole,
  });

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

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="card space-y-3 p-6">
        <h3 className="font-semibold">Novo usuário</h3>
        <input className="input" placeholder="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className="input" placeholder="E-mail" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input className="input" placeholder="Senha (mín. 8)" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}>
          {USER_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="btn-primary" onClick={create}>
          Criar usuário
        </button>
      </div>

      <div className="space-y-2">
        <h3 className="font-semibold">Usuários ({users.length})</h3>
        {users.map((u) => (
          <div key={u.id} className="card flex items-center gap-3 p-3">
            <div className="flex-1">
              <div className="text-sm font-medium">{u.name}</div>
              <div className="text-xs text-gray-500">{u.email}</div>
            </div>
            <select
              className="input w-auto text-xs"
              value={u.role}
              onChange={(e) => update(u.id, { role: e.target.value as UserRole })}
            >
              {USER_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
            <button
              className={u.active ? "btn-ghost text-xs" : "btn-success text-xs"}
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
      const { key } = await apiPost<{ key: { secret: string } }>("/api/api-keys", {
        name,
      });
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
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="card space-y-3 p-6">
        <h3 className="font-semibold">Nova API key</h3>
        <input className="input" placeholder="Nome da chave" value={name} onChange={(e) => setName(e.target.value)} />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="btn-primary" onClick={create} disabled={!name}>
          Gerar chave
        </button>
        {secret && (
          <div className="rounded-lg bg-amber-50 p-3 text-sm">
            <p className="font-medium text-amber-800">
              Copie agora — não será exibida novamente:
            </p>
            <code className="mt-1 block break-all rounded bg-white p-2 text-xs">
              {secret}
            </code>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="font-semibold">Chaves ({keys.length})</h3>
        {keys.map((k) => (
          <div key={k.id} className="card flex items-center gap-3 p-3">
            <div className="flex-1">
              <div className="text-sm font-medium">{k.name}</div>
              <div className="text-xs text-gray-500">
                {k.revokedAt ? "revogada" : "ativa"} · criada em{" "}
                {new Date(k.createdAt).toLocaleDateString("pt-BR")}
              </div>
            </div>
            {!k.revokedAt && (
              <button className="btn-danger text-xs" onClick={() => revoke(k.id)}>
                Revogar
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── util ─────────────────────────────────────────────────────
function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <input
        type="number"
        className="input"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}
