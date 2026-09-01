import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentAccount, listClientAccounts, SESSION_COOKIE } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const jar = await cookies();
  const session = getCurrentAccount(jar.get(SESSION_COOKIE)?.value);
  if (!session) redirect("/login");
  if (session.role !== "coach") redirect("/");

  const clients = await listClientAccounts();

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-lg font-semibold">Clients</h1>
      {clients.length === 0 ? (
        <p className="text-sm text-muted">
          No clients yet — add one from{" "}
          <Link href="/settings" className="text-accent underline">
            Settings
          </Link>
          .
        </p>
      ) : (
        <ul className="divide-y divide-borderc rounded-xl border border-borderc bg-surface">
          {clients.map((c) => (
            <li key={c.id}>
              <Link
                href={`/clients/${c.id}`}
                className="flex items-center justify-between px-4 py-3 text-sm hover:bg-background"
              >
                <span className="font-medium">{c.name}</span>
                <span className="text-muted">
                  Added {new Date(c.createdAt).toLocaleDateString()}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
