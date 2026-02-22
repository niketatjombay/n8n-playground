'use client';

interface LogStep {
  type: string;
  slug: string;
  status: 'success' | 'error' | 'skipped';
  action?: string;
  id?: string;
  error?: string;
  reason?: string;
}

interface OperationLogProps {
  steps: LogStep[];
}

function StatusIcon({ status }: { status: LogStep['status'] }) {
  switch (status) {
    case 'success':
      return <span className="text-emerald-500 font-bold">&#10003;</span>;
    case 'error':
      return <span className="text-red-500 font-bold">&#10007;</span>;
    case 'skipped':
      return <span className="text-zinc-500 font-bold">&#8212;</span>;
  }
}

export default function OperationLog({ steps }: OperationLogProps) {
  if (!steps || steps.length === 0) return null;

  return (
    <div className="mt-6 bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-800">
        <h3 className="text-sm font-medium text-zinc-300">Operation Log</h3>
      </div>
      <div className="divide-y divide-zinc-800/50">
        {steps.map((step, i) => (
          <div
            key={i}
            className="px-4 py-2.5 flex items-start gap-3 text-sm font-mono"
          >
            <span className="mt-0.5 w-4 text-center flex-shrink-0">
              <StatusIcon status={step.status} />
            </span>
            <span className="text-zinc-500 w-28 flex-shrink-0">
              {step.type}
            </span>
            <span className="text-zinc-200 flex-shrink-0">{step.slug}</span>
            <span className="text-zinc-500 ml-auto text-right">
              {step.status === 'success' && (
                <>
                  {step.action && (
                    <span className="text-emerald-400">{step.action}</span>
                  )}
                  {step.id && (
                    <span className="text-zinc-400 ml-2">id: {step.id}</span>
                  )}
                </>
              )}
              {step.status === 'error' && step.error && (
                <span className="text-red-400">{step.error}</span>
              )}
              {step.status === 'skipped' && step.reason && (
                <span className="text-zinc-500">{step.reason}</span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
