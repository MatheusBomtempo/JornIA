"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { apiPost } from "@/lib/api-client";
import { ROLE_LABELS, type UserRole } from "@/lib/domain";
import { ChangePasswordBanner } from "./ChangePasswordBanner";

interface Props {
  user: { name: string; role: UserRole; mustSetPassword?: boolean };
  children: React.ReactNode;
}

const NAV = [
  { href: "/dashboard", label: "Feed", icon: FeedIcon },
  { href: "/capture", label: "Nova pauta", icon: PlusIcon },
  {
    href: "/admin",
    label: "Admin",
    icon: GearIcon,
    // Staff também entra (estilo/templates) — AdminPanel restringe o resto por role.
    roles: ["admin", "manager", "staff"] as UserRole[],
  },
];

export function AppShell({ user, children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const items = NAV.filter((i) => !i.roles || i.roles.includes(user.role));

  async function logout() {
    await apiPost("/api/auth/logout");
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-dvh">
      {/* Topo */}
      <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <Link href="/dashboard" className="text-lg font-extrabold tracking-tight">
            Jorn<span className="text-brand-400">AI</span>
          </Link>

          {/* Nav desktop */}
          <nav className="ml-4 hidden items-center gap-1 md:flex">
            {items.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    active
                      ? "bg-brand-500/15 text-brand-300"
                      : "text-muted hover:bg-elevated hover:text-ink"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right leading-tight sm:block">
              <div className="text-sm font-medium">{user.name}</div>
              <div className="text-xs text-muted">{ROLE_LABELS[user.role]}</div>
            </div>
            <button onClick={logout} className="btn-ghost btn-sm">
              Sair
            </button>
          </div>
        </div>
      </header>

      {/* Espaço extra embaixo para a barra de navegação fixa do mobile */}
      <main className="mx-auto max-w-6xl px-4 pt-5 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-10">
        {user.mustSetPassword && <ChangePasswordBanner />}
        {children}
      </main>

      {/* Nav inferior (mobile) */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
        <div className="flex">
          {items.map((item) => {
            const active = pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
                  active ? "text-brand-400" : "text-muted"
                }`}
              >
                <Icon active={active} />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function FeedIcon({ active }: { active?: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="3" y="3" width="18" height="18" rx="4"
        stroke="currentColor" strokeWidth="1.8"
        fill={active ? "currentColor" : "none"} fillOpacity={active ? 0.15 : 0}
      />
      <path d="M3 9h18" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function PlusIcon({ active }: { active?: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle
        cx="12" cy="12" r="9"
        stroke="currentColor" strokeWidth="1.8"
        fill={active ? "currentColor" : "none"} fillOpacity={active ? 0.15 : 0}
      />
      <path d="M12 8v8M8 12h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function GearIcon({ active }: { active?: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle
        cx="12" cy="12" r="3.2"
        stroke="currentColor" strokeWidth="1.8"
        fill={active ? "currentColor" : "none"} fillOpacity={active ? 0.2 : 0}
      />
      <path
        d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.9 19.3a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.7 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9.1a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.04a1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1.02Z"
        stroke="currentColor" strokeWidth="1.4"
      />
    </svg>
  );
}
