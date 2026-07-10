export const ROLE_HIERARCHY = ['agent', 'senior_agent', 'admin', 'super_admin']

export function hasRole(userRole, minRole) {
  const userLevel = ROLE_HIERARCHY.indexOf(userRole)
  const minLevel = ROLE_HIERARCHY.indexOf(minRole)
  if (userLevel === -1 || minLevel === -1) return false
  return userLevel >= minLevel
}
