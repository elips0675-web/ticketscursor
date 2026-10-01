import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AllTheProviders } from './test-utils'
import AdminSettings from '@/pages/AdminSettings'
import { api } from '@/lib/api'

describe('AdminSettings — SLA business hours (Этап 65, подзадача 4)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('секция рендерится с рабочими днями по умолчанию (Пн–Пт активны)', async () => {
    render(<AdminSettings />, { wrapper: AllTheProviders })
    await waitFor(() => {
      expect(screen.getByText('admin.slaMon')).toBeTruthy()
    })
    // default [1..5] → Пн активна, Сб — нет
    const mon = screen.getByText('admin.slaMon').closest('button')
    const sat = screen.getByText('admin.slaSat').closest('button')
    expect(mon?.className).toContain('bg-primary')
    expect(sat?.className).not.toContain('bg-primary')
  })

  it('сохраняет изменённые дни/часы/таймзону через PUT /admin/settings', async () => {
    const putSpy = vi.spyOn(api, 'put').mockResolvedValue({ success: true, data: {} })
    const user = userEvent.setup()
    render(<AdminSettings />, { wrapper: AllTheProviders })
    await waitFor(() => {
      expect(screen.getByText('admin.slaMon')).toBeTruthy()
    })
    // добавляем субботу
    await user.click(screen.getByText('admin.slaSat'))
    // меняем начало рабочего дня на 10:00
    await user.selectOptions(screen.getByLabelText('admin.slaStart'), '10')
    // меняем таймзону
    const tzInput = screen.getByLabelText('admin.slaTimezone') as HTMLInputElement
    await user.clear(tzInput)
    await user.type(tzInput, 'Asia/Yekaterinburg')
    await user.click(screen.getByTestId('sla-save'))
    await waitFor(() => {
      expect(putSpy).toHaveBeenCalledWith('/admin/settings', {
        BUSINESS_WORKING_DAYS: '[1,2,3,4,5,6]',
        BUSINESS_HOURS_START: '10',
        BUSINESS_HOURS_END: '18',
        TIMEZONE: 'Asia/Yekaterinburg',
      })
    })
  }, 15000)

  it('часы выбора старта/конца содержат 24 опции', { timeout: 15000 }, async () => {
    render(<AdminSettings />, { wrapper: AllTheProviders })
    await waitFor(() => {
      expect(screen.getByLabelText('admin.slaStart')).toBeTruthy()
    })
    const start = screen.getByLabelText('admin.slaStart')
    expect((start as HTMLSelectElement).options.length).toBe(24)
  })
})
