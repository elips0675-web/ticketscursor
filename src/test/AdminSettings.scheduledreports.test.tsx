import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { AllTheProviders } from './test-utils'
import AdminSettings from '@/pages/AdminSettings'
import { api, API_URL } from '@/lib/api'
import { server } from './setup'

// Этап 66 (подфича 4): ScheduledReportsSection в AdminSettings под флагом scheduled_reports.
// В тестовой среде t() возвращает ключ, MSW отдаёт один отчёт (id=1, recipients ops@test.com).
function featuresHandler() {
  return HttpResponse.json({
    success: true,
    data: [{ key: 'scheduled_reports', enabled: true, description: 'Scheduled reports', rollout_percent: 100 }],
  })
}

describe('AdminSettings — Scheduled reports (Этап 66, подфича 4)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    server.use(http.get(`${API_URL}/admin/features`, featuresHandler))
  })

  it('секция рендерится и показывает отчёты из API', async () => {
    render(<AdminSettings />, { wrapper: AllTheProviders })
    await waitFor(() => {
      expect(screen.getByText('admin.scheduledReports')).toBeTruthy()
    })
    await waitFor(() => {
      expect(screen.getByDisplayValue('Ежедневная сводка')).toBeTruthy()
    })
  })

  it('добавление отчёта → POST /admin/scheduled-reports', async () => {
    const postSpy = vi
      .spyOn(api, 'post')
      .mockResolvedValue({ id: 99, name: 'new', report_type: 'tickets_summary', recipients: ['a@b.ru'], enabled: true })
    const user = userEvent.setup()
    render(<AdminSettings />, { wrapper: AllTheProviders })
    await waitFor(() => {
      expect(screen.getByDisplayValue('Ежедневная сводка')).toBeTruthy()
    })
    await user.click(screen.getByText('admin.scheduledReportsAdd'))
    await user.type(screen.getByTestId('scheduled-report-name-new'), 'new')
    await user.type(screen.getByTestId('scheduled-report-recipients-new'), 'a@b.ru')
    await user.click(screen.getByTestId('scheduled-report-save-new'))
    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith(
        '/admin/scheduled-reports',
        expect.objectContaining({ name: 'new', recipients: ['a@b.ru'] }),
      )
    })
  }, 15000)

  it('удаление отчёта → DELETE /admin/scheduled-reports/:id', async () => {
    const delSpy = vi.spyOn(api, 'delete').mockResolvedValue({ deleted: true })
    const user = userEvent.setup()
    render(<AdminSettings />, { wrapper: AllTheProviders })
    await waitFor(() => {
      expect(screen.getByDisplayValue('Ежедневная сводка')).toBeTruthy()
    })
    await user.click(screen.getByTestId('scheduled-report-delete-1'))
    await waitFor(() => {
      expect(delSpy).toHaveBeenCalledWith('/admin/scheduled-reports/1')
    })
  }, 15000)

  it('запуск отчёта → POST /admin/scheduled-reports/:id/run', async () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue({ recipients: 1 })
    const user = userEvent.setup()
    render(<AdminSettings />, { wrapper: AllTheProviders })
    await waitFor(() => {
      expect(screen.getByDisplayValue('Ежедневная сводка')).toBeTruthy()
    })
    await user.click(screen.getByTestId('scheduled-report-run-1'))
    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith('/admin/scheduled-reports/1/run', {})
    })
  }, 15000)
})
