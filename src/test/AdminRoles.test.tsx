import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AllTheProviders } from './test-utils'
import AdminRoles from '@/pages/AdminRoles'
import { api } from '@/lib/api'

const ROLES = [
  {
    id: 1,
    name: 'Auditor',
    description: 'Только чтение журнала',
    base_role: 'agent',
    permissions: ['audit.view'],
  },
]

const CATALOG = [
  { key: 'tickets.create', label: 'Создавать тикеты', defaultRoles: ['agent', 'senior_agent', 'admin'] },
  { key: 'tickets.view', label: 'Просматривать тикеты', defaultRoles: ['agent', 'senior_agent', 'admin'] },
  { key: 'settings.manage', label: 'Управлять настройками', defaultRoles: ['admin'] },
  { key: 'audit.view', label: 'Просматривать журнал аудита', defaultRoles: ['admin'] },
]

function mockGet(roles = ROLES) {
  return vi.spyOn(api, 'get').mockImplementation((path: string) => {
    if (path === '/admin/roles') return Promise.resolve(roles as never)
    if (path === '/admin/permissions') return Promise.resolve(CATALOG as never)
    return Promise.resolve(null)
  })
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('AdminRoles', () => {
  it('рисует список ролей из API', async () => {
    mockGet()
    render(<AdminRoles />, { wrapper: AllTheProviders })
    await waitFor(() => expect(screen.getByTestId('roles-list')).toBeTruthy())
    expect(screen.getByText('Auditor')).toBeTruthy()
    expect(screen.getByText('Только чтение журнала')).toBeTruthy()
  })

  it('показывает пустое состояние без ролей', async () => {
    mockGet([])
    render(<AdminRoles />, { wrapper: AllTheProviders })
    await waitFor(() => expect(screen.getByText('admin.rolesEmpty')).toBeTruthy())
  })

  it('открывает конструктор и заполняет права шаблона agent', async () => {
    mockGet()
    const user = userEvent.setup()
    render(<AdminRoles />, { wrapper: AllTheProviders })
    await waitFor(() => expect(screen.getByTestId('role-create')).toBeTruthy())

    await user.click(screen.getByTestId('role-create'))
    expect(screen.getByTestId('role-form')).toBeTruthy()
    expect((screen.getByTestId('perm-check-tickets.create') as HTMLInputElement).checked).toBe(true)
    expect((screen.getByTestId('perm-check-settings.manage') as HTMLInputElement).checked).toBe(false)
  })

  it('не отправляет форму без названия', async () => {
    mockGet()
    const post = vi.spyOn(api, 'post').mockResolvedValue({} as never)
    const user = userEvent.setup()
    render(<AdminRoles />, { wrapper: AllTheProviders })
    await waitFor(() => expect(screen.getByTestId('role-create')).toBeTruthy())

    await user.click(screen.getByTestId('role-create'))
    await user.click(screen.getByTestId('role-save'))
    expect(post).not.toHaveBeenCalled()
  })

  it('создаёт роль через POST с выбранными правами', async () => {
    mockGet()
    const post = vi.spyOn(api, 'post').mockResolvedValue({} as never)
    const user = userEvent.setup()
    render(<AdminRoles />, { wrapper: AllTheProviders })
    await waitFor(() => expect(screen.getByTestId('role-create')).toBeTruthy())

    await user.click(screen.getByTestId('role-create'))
    await user.type(screen.getByLabelText('admin.rolesName'), 'Support L2')
    await user.click(screen.getByTestId('perm-check-settings.manage'))
    await user.click(screen.getByTestId('role-save'))

    await waitFor(() => expect(post).toHaveBeenCalled())
    expect(post).toHaveBeenCalledWith(
      '/admin/roles',
      expect.objectContaining({
        name: 'Support L2',
        base_role: 'agent',
        permissions: expect.arrayContaining(['settings.manage', 'tickets.create']),
      }),
    )
    await waitFor(() => expect(screen.queryByTestId('role-form')).toBeNull())
  })

  it('применяет шаблон admin к чекбоксам', async () => {
    mockGet()
    const user = userEvent.setup()
    render(<AdminRoles />, { wrapper: AllTheProviders })
    await waitFor(() => expect(screen.getByTestId('role-create')).toBeTruthy())

    await user.click(screen.getByTestId('role-create'))
    await user.selectOptions(screen.getByLabelText('admin.rolesBase'), 'admin')
    await user.click(screen.getByTestId('role-apply-template'))

    expect((screen.getByTestId('perm-check-settings.manage') as HTMLInputElement).checked).toBe(true)
    expect((screen.getByTestId('perm-check-tickets.view') as HTMLInputElement).checked).toBe(true)
  })

  it('редактирует существующую роль через PUT', async () => {
    mockGet()
    const put = vi.spyOn(api, 'put').mockResolvedValue({} as never)
    const user = userEvent.setup()
    render(<AdminRoles />, { wrapper: AllTheProviders })
    await waitFor(() => expect(screen.getByTestId('role-edit-1')).toBeTruthy())

    await user.click(screen.getByTestId('role-edit-1'))
    const nameInput = screen.getByLabelText('admin.rolesName') as HTMLInputElement
    expect(nameInput.value).toBe('Auditor')
    await user.clear(nameInput)
    await user.type(nameInput, 'Auditor v2')
    await user.click(screen.getByTestId('role-save'))

    await waitFor(() => expect(put).toHaveBeenCalled())
    expect(put).toHaveBeenCalledWith(
      '/admin/roles/1',
      expect.objectContaining({ name: 'Auditor v2', permissions: ['audit.view'] }),
    )
  })

  it('удаляет роль после подтверждения', async () => {
    mockGet()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const del = vi.spyOn(api, 'delete').mockResolvedValue({} as never)
    const user = userEvent.setup()
    render(<AdminRoles />, { wrapper: AllTheProviders })
    await waitFor(() => expect(screen.getByTestId('role-delete-1')).toBeTruthy())

    await user.click(screen.getByTestId('role-delete-1'))
    expect(del).toHaveBeenCalledWith('/admin/roles/1')
  })

  it('не удаляет роль при отказе от подтверждения', async () => {
    mockGet()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const del = vi.spyOn(api, 'delete').mockResolvedValue({} as never)
    const user = userEvent.setup()
    render(<AdminRoles />, { wrapper: AllTheProviders })
    await waitFor(() => expect(screen.getByTestId('role-delete-1')).toBeTruthy())

    await user.click(screen.getByTestId('role-delete-1'))
    expect(del).not.toHaveBeenCalled()
  })
})
