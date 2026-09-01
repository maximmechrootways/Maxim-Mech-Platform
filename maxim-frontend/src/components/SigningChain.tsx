// FormSignatory import removed

export function SigningChain({ signatories }: { signatories: any[] }) {
  if (!signatories || signatories.length === 0) return null

  return (
    <div className="signing-chain mt-4 space-y-3">
      {signatories
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((sig, i) => (
          <div key={sig.id} className="flex items-center gap-3">
            <div className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
              sig.status === 'signed' ? 'bg-emerald-100 text-emerald-700' :
              sig.status === 'notified' ? 'bg-amber-100 text-amber-700' :
              'bg-neutral-100 text-neutral-500'
            }`}>
              {sig.status === 'signed' ? '✓' : i + 1}
            </div>
            <div className="flex-1 flex justify-between items-center">
              <div>
                <span className="font-medium text-sm text-neutral-900 dark:text-white">
                  {sig.user?.firstName} {sig.user?.lastName}
                </span>
                <span className="ml-2 text-xs text-neutral-500">{sig.user?.role}</span>
              </div>
              <div className="text-xs text-neutral-500">
                {sig.status === 'signed' && sig.signedAt && (
                  <span>Signed {new Date(sig.signedAt).toLocaleDateString('en-CA')}</span>
                )}
                {sig.status === 'notified' && <span className="text-amber-600 font-medium">Awaiting signature</span>}
                {sig.status === 'pending' && <span>Not yet reached</span>}
              </div>
            </div>
          </div>
        ))}
    </div>
  )
}
