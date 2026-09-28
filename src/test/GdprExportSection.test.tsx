import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AllTheProviders } from './test-utils'
import GdprExportSection from '@/components/GdprExportSection'

let flagOn = true

vi.mock('@/hooks/useFeature', () => ({ useFeature: () => flagOn }))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'profile.gdprTitle': 'Экспорт данных (GDPR)',
        'profile.gdprDesc': 'Скачайте все свои данные в одном JSON-файле',
        'profile.gdprHint': 'Профиль, тикеты, сообщения',
        'profile.gdprDownload': 'Скачать',
        'profile.gdprDone': 'Экспорт сформирован и скачан',
      })[key] || key,
  }),
}))

function mockApi(overrides: { fail?: boolean } = {}) {
  globalThis.fetch = vi.fn((url: string, _init: RequestInit) => {
    const path = String(url)
    if (overrides.fail && path.includes('/gdpr/export')) {
      return Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ message: 'Server error' }),
      })
    }
    if (path.includes('/gdpr/export')) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            data: { user: { id: 1, name: 'Admin' }, tickets_created: [], notifications: [] },
          }),
      })
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve({ message: 'not found' }) })
  }) as unknown as typeof fetch
}

async function renderSection() {
  localStorage.setItem('user', JSON.stringify({ id: 1, name: 'Admin', email: 'admin@test.com', role: 'admin' }))
  localStorage.setItem('token', 'token-123')
  const user = userEvent.setup()
  render(<GdprExportSection />, { wrapper: AllTheProviders })
  return user
}

beforeEach(() => {
  localStorage.clear()
  flagOn = true
  mockApi()
})

afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch
  vi.clearAllMocks()
})

describe('GdprExportSection (Этап 66, подфича 1)', () => {
  it('рендерит карточку с заголовком и кнопкой «Скачать»', async () => {
    await renderSection()
    expect(screen.getByText('Экспорт данных (GDPR)')).toBeInTheDocument()
    expect(screen.getByText('Скачать')).toBeInTheDocument()
  })

  it('клик «Скачать» → fetch /gdpr/export, создан файл, показано инфо', async () => {
    const createSpy = vi.fn(() => 'blob:mock')
    const revokeSpy = vi.fn()
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    vi.stubGlobal('URL', { ...URL, createObjectURL: createSpy, revokeObjectURL: revokeSpy })

    const user = await renderSection()
    await user.click(screen.getByText('Скачать'))

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/gdpr/export'),
        expect.objectContaining({ headers: { Authorization: 'Bearer token-123' } }),
      )
    })
    await waitFor(() => {
      expect(screen.getByText('Экспорт сформирован и скачан')).toBeInTheDocument()
    })
    expect(createSpy).toHaveBeenCalled()
    expect(clickSpy).toHaveBeenCalled()
    expect(revokeSpy).toHaveBeenCalled()
    vi.unstubAllGlobals()
    clickSpy.mockRestore()
  })

  it('ошибка загрузки → текст ошибки', async () => {
    mockApi({ fail: true })
    await renderSection()
    await userEvent.setup().click(screen.getByText('Скачать'))
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Server error')
    })
  })

  it('флаг gdpr_export = off → секция не рендерится', async () => {
    flagOn = false
    await renderSection()
    await waitFor(() => {
      expect(screen.queryByText('Экспорт данных (GDPR)')).not.toBeInTheDocument()
    })
  })
})
