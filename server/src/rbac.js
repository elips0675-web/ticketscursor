// Единый источник правды для UI «RBAC-матрица» (Этап 58).
// Фактическое принуждение прав остаётся в middleware requireRole и проверках роутов.
// Таблица описывает, какие действия доступны каждой роли по текущей реализации.

export const RBAC_ROLES = ['agent', 'senior_agent', 'admin', 'super_admin']

export const RBAC_PERMISSIONS = [
  { key: 'tickets.create', label: 'Создавать тикеты', defaultRoles: ['agent', 'senior_agent', 'admin', 'super_admin'] },
  { key: 'tickets.view', label: 'Просматривать тикеты', defaultRoles: ['agent', 'senior_agent', 'admin', 'super_admin'] },
  { key: 'tickets.comment', label: 'Комментировать тикеты', defaultRoles: ['agent', 'senior_agent', 'admin', 'super_admin'] },
  { key: 'tickets.manage_status', label: 'Менять статус тикета', defaultRoles: ['senior_agent', 'admin', 'super_admin'] },
  { key: 'tickets.assign', label: 'Назначать исполнителя', defaultRoles: ['senior_agent', 'admin', 'super_admin'] },
  { key: 'tickets.manage_priority', label: 'Менять приоритет', defaultRoles: ['senior_agent', 'admin', 'super_admin'] },
  { key: 'tickets.delete', label: 'Удалять тикеты', defaultRoles: ['admin', 'super_admin'] },
  { key: 'chats.send', label: 'Отправлять сообщения в чатах', defaultRoles: ['agent', 'senior_agent', 'admin', 'super_admin'] },
  { key: 'chats.delete_message', label: 'Удалять сообщения в чатах', defaultRoles: ['senior_agent', 'admin', 'super_admin'] },
  { key: 'push.send', label: 'Отправлять push-уведомления', defaultRoles: ['senior_agent', 'admin', 'super_admin'] },
  { key: 'files.delete', label: 'Удалять файлы', defaultRoles: ['senior_agent', 'admin', 'super_admin'] },
  { key: 'employees.manage', label: 'Управлять сотрудниками', defaultRoles: ['admin', 'super_admin'] },
  { key: 'users.manage', label: 'Управлять пользователями', defaultRoles: ['admin', 'super_admin'] },
  { key: 'settings.manage', label: 'Управлять настройками', defaultRoles: ['admin', 'super_admin'] },
  { key: 'audit.view', label: 'Просматривать журнал аудита', defaultRoles: ['admin', 'super_admin'] },
  { key: 'custom_fields.manage', label: 'Настраивать кастомные поля', defaultRoles: ['admin', 'super_admin'] },
  { key: 'rules.manage', label: 'Настраивать правила автоматизации', defaultRoles: ['admin', 'super_admin'] },
  { key: 'super.admin', label: 'Неограниченный доступ', defaultRoles: ['super_admin'] },
]

export function getRbacMatrix() {
  return {
    roles: [...RBAC_ROLES],
    permissions: RBAC_PERMISSIONS.map((p) => ({
      key: p.key,
      label: p.label,
      roles: Object.fromEntries(RBAC_ROLES.map((r) => [r, p.defaultRoles.includes(r)])),
    })),
  }
}