// Этап 68: a11y — честные проверки через axe-core (jsdom).
// Правила без color-contrast (в jsdom стили не вычисляются). Фиксируем:
// - icon-only кнопки имеют имена (button-name) — AdminCannedResponses/AdminCustomFields/KeyboardShortcuts;
// - select'ы имеют aria-label (select-name);
// - корректные aria-атрибуты и роли.
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { http, HttpResponse } from 'msw'
import { server } from './setup'
import { AllTheProviders } from './test-utils'
import Login from '@/pages/Login'
import AdminCannedResponses from '@/pages/AdminCannedResponses'
import AdminCustomFields from '@/pages/AdminCustomFields'
import { KeyboardShortcuts } from '@/components/KeyboardShortcuts'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))

const API = 'http://localhost:4000/api'

const A11Y_RULES = [
  'button-name',
  'image-alt',
  'link-name',
  'select-name',
  'aria-allowed-attr',
  'aria-valid-attr',
  'aria-roles',
  'aria-required-children',
  'aria-required-parent',
  'heading-order',
]

async function expectNoA11yViolations() {
  const results = await axe.run(document.body, { runOnly: { type: 'rule', values: A11Y_RULES } })
  const violations = results.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`)
  expect(violations).toEqual([])
}

describe('a11y — axe-core, ключевые страницы (Этап 68)', () => {
  it('Login: нет критичных/серьёзных нарушений', async () => {
    render(<Login />, { wrapper: AllTheProviders })
    await screen.findByText('Service Desk')
    await expectNoA11yViolations()
  })

  it('AdminCannedResponses: icon-only кнопки имеют доступные имена', async () => {
    server.use(
      http.get(`${API}/canned-responses`, () =>
        HttpResponse.json({
          success: true,
          data: [
            {
              id: 1,
              title: 'Приветствие',
              text: 'Здравствуйте!',
              category: 'greetings',
              created_by: 1,
              created_at: '2026-07-01T00:00:00.000Z',
              updated_at: '2026-07-01T00:00:00.000Z',
            },
          ],
        }),
      ),
    )
    render(<AdminCannedResponses />, { wrapper: AllTheProviders })
    await screen.findByText('Приветствие')
    await expectNoA11yViolations()
  })

  it('AdminCustomFields: select-элементы имеют aria-label', async () => {
    server.use(http.get(`${API}/admin/custom-fields`, () => HttpResponse.json({ success: true, data: [] })))
    render(<AdminCustomFields />, { wrapper: AllTheProviders })
    await screen.findByText(/No custom fields defined/)
    await expectNoA11yViolations()
  })

  it('KeyboardShortcuts: диалог с горячими клавишами без нарушений', async () => {
    const user = userEvent.setup()
    render(<KeyboardShortcuts />)
    await user.click(screen.getByLabelText('Горячие клавиши'))
    await screen.findByRole('heading', { name: 'Горячие клавиши' })
    await expectNoA11yViolations()
  })
})
