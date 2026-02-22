'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navLinks = [
  { href: '/', label: 'Dashboard' },
  { href: '/workflows', label: 'Workflows' },
  { href: '/deploy', label: 'Deploy' },
  { href: '/promote', label: 'Promote' },
  { href: '/backup', label: 'Backup' },
  { href: '/test', label: 'Test' },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 h-screen w-56 bg-zinc-900 border-r border-zinc-800 flex flex-col z-50">
      <div className="px-5 py-5 border-b border-zinc-800">
        <h1 className="text-lg font-semibold text-zinc-100">n8n Playground</h1>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {navLinks.map(({ href, label }) => {
          const isActive =
            href === '/' ? pathname === '/' : pathname.startsWith(href);

          return (
            <Link
              key={href}
              href={href}
              className={`block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-blue-500/10 text-blue-500'
                  : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800'
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="px-5 py-4 border-t border-zinc-800">
        <p className="text-xs text-zinc-500">n8n Workflow Manager</p>
      </div>
    </aside>
  );
}
