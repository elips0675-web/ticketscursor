import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Network, Loader2, ChevronDown, ChevronRight, Users } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useFeature } from '@/hooks/useFeature'
import { api } from '@/lib/api'

interface TeamMember {
  id: number
  name: string
  email: string
  role: string
  department: string
  title: string
  avatar: string
  online: boolean
  manager_id: number | null
}

interface TreeNode {
  member: TeamMember
  children: TreeNode[]
}

function buildTree(members: TeamMember[]): TreeNode[] {
  const byId = new Map<number, TeamMember>()
  for (const m of members) byId.set(m.id, m)
  const roots = members.filter((m) => !m.manager_id || !byId.has(m.manager_id))
  const childrenOf = (managerId: number) => members.filter((m) => m.manager_id === managerId)
  const build = (member: TeamMember): TreeNode => ({
    member,
    children: childrenOf(member.id).map((c) => build(c)),
  })
  return roots.map((r) => build(r))
}

function Node({ node, depth }: { node: TreeNode; depth: number }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(true)
  const { member } = node
  const initials = member.name
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()
  const roleLabels: Record<string, string> = {
    agent: t('employees.agent'),
    senior_agent: t('employees.seniorAgent'),
    admin: t('employees.admin'),
  }
  const hasChildren = node.children.length > 0

  return (
    <div style={{ marginLeft: depth * 24 }}>
      <div className={`flex items-center gap-2 py-1.5 ${depth > 0 ? 'border-l border-muted pl-2' : ''}`}>
        {hasChildren ? (
          <button
            type="button"
            aria-label={open ? 'Свернуть' : 'Развернуть'}
            className="rounded p-0.5 hover:bg-muted text-muted-foreground"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        ) : (
          <span className="w-5 shrink-0" />
        )}
        <Avatar className="w-7 h-7">
          {member.avatar ? (
            <img src={member.avatar} alt={member.name} />
          ) : (
            <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
          )}
        </Avatar>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold truncate">{member.name}</span>
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${member.online ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`}
              title={member.online ? t('admin.online') : t('admin.offline')}
            />
          </div>
          <p className="text-[11px] text-muted-foreground truncate">
            {roleLabels[member.role] || member.role}
            {member.title ? ` · ${member.title}` : ''}
            {member.department ? ` · ${member.department}` : ''}
          </p>
        </div>
      </div>
      {open &&
        hasChildren &&
        node.children.map((child) => <Node key={child.member.id} node={child} depth={depth + 1} />)}
    </div>
  )
}

export default function TeamPage() {
  const { t } = useTranslation()
  const { token } = useAuth()
  const flagOn = useFeature('org_chart')
  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = () => {
    setLoading(true)
    return api
      .get<TeamMember[]>('/team/org-chart')
      .then((rows) => {
        setMembers(rows || [])
        setError('')
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (!flagOn) return
    let cancelled = false
    api
      .get<TeamMember[]>('/team/org-chart')
      .then((rows) => {
        if (cancelled) return
        setMembers(rows || [])
        setError('')
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [flagOn, token])

  if (!flagOn) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Network className="w-4 h-4 text-primary" />
            {t('team.title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t('team.disabled')}</p>
        </CardContent>
      </Card>
    )
  }

  const tree = buildTree(members)

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="text-sm flex items-center gap-2">
                <Network className="w-4 h-4 text-primary" />
                {t('team.title')}
              </CardTitle>
              <CardDescription className="text-xs mt-1">{t('team.subtitle')}</CardDescription>
            </div>
            <Button variant="outline" size="sm" disabled={loading} onClick={load}>
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              {t('admin.refresh')}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          {!loading && !error && members.length === 0 && (
            <div className="text-center py-6 text-muted-foreground">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">{t('team.empty')}</p>
            </div>
          )}
          {!loading && tree.length > 0 && (
            <div className="rounded-lg border p-3 overflow-x-auto">
              {tree.map((root) => (
                <Node key={root.member.id} node={root} depth={0} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
