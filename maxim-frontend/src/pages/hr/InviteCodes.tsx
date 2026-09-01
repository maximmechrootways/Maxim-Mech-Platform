import { useEffect, useState, useCallback } from 'react'
import { api } from '@/api'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'

interface InviteCode {
    id: string
    code: string
    status: 'pending' | 'used' | 'expired'
    createdAt: string
    expiresAt: string
    usedAt: string | null
    usedById: string | null
    createdBy: { firstName: string; lastName: string; email: string }
}

export function InviteCodes() {
    const [codes, setCodes] = useState<InviteCode[]>([])
    const [loading, setLoading] = useState(true)
    const [generating, setGenerating] = useState(false)
    const [copiedId, setCopiedId] = useState<string | null>(null)

    const loadCodes = useCallback(async () => {
        try {
            const { data } = await api.get('/invite/list')
            setCodes(data)
        } catch (err) {
            console.error('Failed to load invite codes:', err)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        loadCodes()
    }, [loadCodes])

    const generateCode = async () => {
        setGenerating(true)
        try {
            const { data } = await api.post('/invite/generate')
            setCodes((prev) => [{ ...data, status: 'pending' }, ...prev])
        } catch (err) {
            console.error('Failed to generate invite code:', err)
        } finally {
            setGenerating(false)
        }
    }

    const copyCode = (code: string, id: string) => {
        navigator.clipboard.writeText(code)
        setCopiedId(id)
        setTimeout(() => setCopiedId(null), 2000)
    }

    const statusBadge = (status: string) => {
        switch (status) {
            case 'pending':
                return <Badge variant="info">Pending</Badge>
            case 'used':
                return <Badge variant="success">Used</Badge>
            case 'expired':
                return <Badge variant="danger">Expired</Badge>
            default:
                return <Badge>{status}</Badge>
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">Invite Codes</h1>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">Generate and manage invite codes for new users</p>
                </div>
                <Button onClick={generateCode} disabled={generating}>
                    {generating ? 'Generating…' : '+ Generate Code'}
                </Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
                <Card padding="md">
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 uppercase tracking-wider font-medium">Pending</p>
                    <p className="text-2xl font-bold text-brand-600 dark:text-brand-400 mt-1">{codes.filter((c) => c.status === 'pending').length}</p>
                </Card>
                <Card padding="md">
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 uppercase tracking-wider font-medium">Used</p>
                    <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{codes.filter((c) => c.status === 'used').length}</p>
                </Card>
                <Card padding="md">
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 uppercase tracking-wider font-medium">Expired</p>
                    <p className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">{codes.filter((c) => c.status === 'expired').length}</p>
                </Card>
            </div>

            {/* Table */}
            <Card padding="none">
                {loading ? (
                    <div className="p-8 text-center text-neutral-400 dark:text-neutral-500">Loading…</div>
                ) : codes.length === 0 ? (
                    <div className="p-8 text-center text-neutral-400 dark:text-neutral-500">No invite codes yet. Generate one to get started.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-neutral-200 dark:border-neutral-700">
                                    <th className="text-left p-3 font-medium text-neutral-500 dark:text-neutral-400">Code</th>
                                    <th className="text-left p-3 font-medium text-neutral-500 dark:text-neutral-400">Status</th>
                                    <th className="text-left p-3 font-medium text-neutral-500 dark:text-neutral-400">Created</th>
                                    <th className="text-left p-3 font-medium text-neutral-500 dark:text-neutral-400">Expires</th>
                                    <th className="text-left p-3 font-medium text-neutral-500 dark:text-neutral-400">Created By</th>
                                    <th className="text-left p-3 font-medium text-neutral-500 dark:text-neutral-400">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {codes.map((code) => (
                                    <tr key={code.id} className="border-b border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors">
                                        <td className="p-3">
                                            <code className="text-sm font-mono bg-neutral-100 dark:bg-neutral-800 px-2 py-1 rounded">{code.code}</code>
                                        </td>
                                        <td className="p-3">{statusBadge(code.status)}</td>
                                        <td className="p-3 text-neutral-600 dark:text-neutral-400">{new Date(code.createdAt).toLocaleDateString()}</td>
                                        <td className="p-3 text-neutral-600 dark:text-neutral-400">{new Date(code.expiresAt).toLocaleDateString()}</td>
                                        <td className="p-3 text-neutral-600 dark:text-neutral-400">{code.createdBy.firstName} {code.createdBy.lastName}</td>
                                        <td className="p-3">
                                            {code.status === 'pending' && (
                                                <button
                                                    onClick={() => copyCode(code.code, code.id)}
                                                    className="text-xs text-brand-600 dark:text-brand-400 hover:underline font-medium"
                                                >
                                                    {copiedId === code.id ? 'Copied!' : 'Copy'}
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>
        </div>
    )
}
