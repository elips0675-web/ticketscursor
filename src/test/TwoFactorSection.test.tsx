import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AllTheProviders } from './test-utils'
import TwoFactorSection from '@/components/TwoFactorSection'

vi.mock('@/hooks/useFeature', () => ({ useFeature: () => true }))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'profile.twoFactor': 'Двухфакторная аутентификация (2FA)',
        'profile.twoFactorDesc': 'Одноразовые коды TOTP',
        'profile.twoFactorOn': '2FA включена',
        'profile.setup2fa': 'Настроить 2FA',
        'profile.enable2fa': 'Включить 2FA',
        'profile.disable2fa': 'Отключить 2FA',
        'profile.twoFactorSecret': 'Или введите секрет вручную:',
        'profile.twoFactorEnabled': '2FA включена',
        'profile.twoFactorDisabled': '2FA отключена',
        'profile.twoFactorCode': 'Код 2FA',
      })[key] || key,
  }),
}))

vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,ABC') },
}))

let statusState: { enabled: boolean; secretSet: boolean; required: boolean }

function mockApi() {
  globalThis.fetch = vi.fn((url: string, init: RequestInit) => {
    const path = String(url)
    const body = init?.body ? JSON.parse(String(init.body)) : {}
    if (path.includes('/2fa/status')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: statusState }) })
    }
    if (path.includes('/2fa/setup')) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            data: {
              secret: 'SECRET123',
              otpauthUrl: 'otpauth://totp/Service%20Desk:admin%40test.com?secret=SECRET123',
            },
          }),
      })
    }
    if (path.includes('/2fa/enable') || path.includes('/2fa/disable')) {
      if (body.code === '123456') {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({ success: true, data: { enabled: path.includes('/2fa/disable') ? false : true } }),
        })
      }
      return Promise.resolve({
        ok: false,
        json: () => Promise.resolve({ success: false, message: 'Invalid 2FA code' }),
      })
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve({ message: 'not found' }) })
  }) as unknown as typeof fetch
}

async function renderSection() {
  localStorage.setItem('user', JSON.stringify({ id: 1, name: 'Admin', email: 'admin@test.com', role: 'admin' }))
  localStorage.setItem('token', 'token-123')
  const user = userEvent.setup()
  render(<TwoFactorSection />, { wrapper: AllTheProviders })
  return user
}

beforeEach(() => {
  localStorage.clear()
  statusState = { enabled: false, secretSet: false, required: true }
  mockApi()
})

afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch
  vi.clearAllMocks()
})

describe('TwoFactorSection (Этап 63, подфича 1)', () => {
  it('рендерит секцию при включённом флаге и роли админа', async () => {
    await renderSection()
    await waitFor(() => {
      expect(screen.getByText('Двухфакторная аутентификация (2FA)')).toBeInTheDocument()
    })
  })

  it('setup: клик «Настроить 2FA» показывает QR + секрет + поле кода', async () => {
    const user = await renderSection()
    await user.click(await screen.findByText('Настроить 2FA'))

    await screen.findByText('SECRET123')
    expect(screen.getByAltText('QR')).toBeInTheDocument()
    expect(screen.getByLabelText('Код 2FA')).toBeInTheDocument()
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/2fa/setup'),
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('enable: верный код включает 2FA и показывает статус on', async () => {
    const user = await renderSection()
    await user.click(await screen.findByText('Настроить 2FA'))
    await screen.findByText('SECRET123')

    await user.type(screen.getByLabelText('Код 2FA'), '123456')
    await user.click(screen.getByText('Включить 2FA'))

    await waitFor(() => {
      expect(screen.getAllByText('2FA включена').length).toBeGreaterThanOrEqual(2)
      expect(screen.getByText('Отключить 2FA')).toBeInTheDocument()
    })
  })

  it('enable: неверный код показывает ошибку', async () => {
    const user = await renderSection()
    await user.click(await screen.findByText('Настроить 2FA'))
    await screen.findByText('SECRET123')

    await user.type(screen.getByLabelText('Код 2FA'), '000000')
    await user.click(screen.getByText('Включить 2FA'))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Invalid 2FA code')
    })
  })

  it('disable: для включённого состояния показывается кнопка отключения и отрабатывает код', async () => {
    statusState = { enabled: true, secretSet: true, required: true }
    const user = await renderSection()

    await waitFor(() => {
      expect(screen.getByText('Отключить 2FA')).toBeInTheDocument()
    })
    await user.type(screen.getByLabelText('Код 2FA'), '123456')
    await user.click(screen.getByText('Отключить 2FA'))

    await waitFor(() => {
      expect(screen.getByText('2FA отключена')).toBeInTheDocument()
    })
  })
})
