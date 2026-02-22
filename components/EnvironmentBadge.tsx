interface EnvironmentBadgeProps {
  env: string;
  active?: boolean;
}

const envColors: Record<string, { bg: string; text: string }> = {
  development: { bg: 'bg-blue-500/15', text: 'text-blue-400' },
  staging: { bg: 'bg-amber-500/15', text: 'text-amber-400' },
  production: { bg: 'bg-emerald-500/15', text: 'text-emerald-400' },
};

export default function EnvironmentBadge({ env, active }: EnvironmentBadgeProps) {
  const colors = envColors[env] || { bg: 'bg-zinc-500/15', text: 'text-zinc-400' };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}
    >
      {active && (
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
      )}
      {env}
    </span>
  );
}
