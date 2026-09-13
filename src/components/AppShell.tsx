"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { apiPost } from "@/lib/api-client";
import { ROLE_LABELS, type UserRole } from "@/lib/domain";

interface Props {
  user: { name: string; role: UserRole };
  children: React.ReactNode;
}

const NAV = [
  { href: "/dashboard", label: "Feed" },
  { href: "/capture", label: "Nova pauta" },
  { href: "/admin", label: "Admin", roles: ["admin", "manager"] as UserRole[] },
];

export function AppShell({ user, children }: Props) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await apiPost("/api/auth/logout");
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="text-lg font-bold tracking-tight">
              Jorn<span className="text-brand-600">IA</span>
            </Link>
            <nav className="flex items-center gap-1">
              {NAV.filter(
                (item) => !item.roles || item.roles.includes(user.role),
              ).map((item) => {
                const active = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                      active
                        ? "bg-brand-50 text-brand-700"
                        : "text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right leading-tight">
              <div className="text-sm font-medium">{user.name}</div>
              <div className="text-xs text-gray-500">
                {ROLE_LABELS[user.role]}
              </div>
            </div>
            <button onClick={logout} className="btn-ghost text-xs">
              Sair
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
