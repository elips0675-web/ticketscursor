import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useTranslation } from 'react-i18next'
import { api } from '@/lib/api'
import { KeyRound, Loader2, ShieldCheck, ShieldX, Info } from 'lucide-react'

interface MatrixPermission {
  key: string
  label: string
  roles: Record<string, boolean>
}

interface RbacMatrixData {
  roles: string[]
  permissions: MatrixPermission[]
}

const ROLE_LABELS: Record<string, string> = {
  agent: 'Agent',
  senior_agent: 'Senior Agent',
  admin: 'Admin',
  super_admin: 'Super Admin',
}

export default function AdminRbac() {
  const { t } = useTranslation()
  const [matrix, setMatrix] = useState<RbacMatrixData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api
      .get('/admin/rbac')
      .then((data) => {
        if (data) setMatrix(data as RbacMatrixData)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('admin.rbac')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('admin.rbacSubtitle')}</p>
      </div>

      <div
        className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800"
        data-testid="rbac-note"
      >
        <Info className="w-4 h-4 mt-0.5 shrink-0" />
        <span>{t('admin.rbacNote')}</span>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : !matrix ? (
        <Card>
          <CardContent className="text-center py-12 text-muted-foreground">
            <KeyRound className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">{t('admin.noAudit')}</p>
          </CardContent>
        </Card>
      ) : (
        <Card data-testid="rbac-matrix">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-primary" />
              {t('admin.rbac')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 pr-3 font-semibold text-muted-foreground text-xs">
                      {t('admin.rbacPermission')}
                    </th>
                    {matrix.roles.map((role) => (
                      <th key={role} className="py-2 px-2 font-semibold text-xs text-center">
                        {ROLE_LABELS[role] || role}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrix.permissions.map((p) => (
                    <tr key={p.key} className="border-b last:border-0" data-testid={`perm-${p.key}`}>
                      <td className="py-2 pr-3">
                        <p className="font-medium text-xs">{p.label}</p>
                        <p className="text-[10px] text-muted-foreground font-mono">{p.key}</p>
                      </td>
                      {matrix.roles.map((role) => (
                        <td key={role} className="py-2 px-2 text-center">
                          {p.roles[role] ? (
                            <ShieldCheck
                              className="w-4 h-4 mx-auto text-green-600"
                              aria-label={t('admin.rbacAllowed')}
                              data-testid={`cell-${p.key}-${role}`}
                            />
                          ) : (
                            <ShieldX
                              className="w-4 h-4 mx-auto text-muted-foreground/40"
                              aria-label={t('admin.rbacDenied')}
                              data-testid={`cell-${p.key}-${role}`}
                            />
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
