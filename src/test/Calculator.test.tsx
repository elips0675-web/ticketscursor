import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CalculatorPage from '@/pages/Calculator'
import { AllTheProviders } from './test-utils'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

describe('Calculator', () => {
  const setup = () => render(<CalculatorPage />, { wrapper: AllTheProviders })

  it('renders calculator title', () => {
    setup()
    expect(screen.getByText('Калькулятор отпуска')).toBeInTheDocument()
  })

  it('has two tabs: Дни → Дата and Дата → Дни', () => {
    setup()
    expect(screen.getByText('Дни → Дата')).toBeInTheDocument()
    expect(screen.getByText('Дата → Дни')).toBeInTheDocument()
  })

  it('shows holiday info', () => {
    setup()
    expect(screen.getByText(/Праздники/)).toBeInTheDocument()
  })

  it('calculates end date from working days', async () => {
    setup()
    const user = userEvent.setup()

    const startInput = screen.getByLabelText('Дата начала')
    const daysInput = screen.getByLabelText('Рабочих дней')

    await user.clear(startInput)
    await user.type(startInput, '2026-07-09')

    await user.clear(daysInput)
    await user.type(daysInput, '3')

    await user.click(screen.getByText('Рассчитать'))

    expect(screen.getByText(/Дата окончания/)).toBeInTheDocument()
  })

  it('calculates working days between dates', async () => {
    setup()
    const user = userEvent.setup()

    await user.click(screen.getByText('Дата → Дни'))

    const startInput = screen.getByLabelText('Дата начала')
    const endInput = screen.getByLabelText('Дата окончания')

    await user.clear(startInput)
    await user.type(startInput, '2026-07-09')

    await user.clear(endInput)
    await user.type(endInput, '2026-07-20')

    await user.click(screen.getByText('Рассчитать'))

    expect(screen.getByText(/Рабочих дней/)).toBeInTheDocument()
  })

  it('shows result card after date calculation with different values', async () => {
    setup()
    const user = userEvent.setup()

    const startInput = screen.getByLabelText('Дата начала')
    const daysInput = screen.getByLabelText('Рабочих дней')

    await user.clear(startInput)
    await user.type(startInput, '2026-07-01')

    await user.clear(daysInput)
    await user.type(daysInput, '10')

    await user.click(screen.getByText('Рассчитать'))

    expect(screen.getByText(/Дата окончания/)).toBeInTheDocument()
    expect(screen.getByText(/Календарных дней/)).toBeInTheDocument()
  })

  it('shows result card after business days calculation with different dates', async () => {
    setup()
    const user = userEvent.setup()

    await user.click(screen.getByText('Дата → Дни'))

    const startInput = screen.getByLabelText('Дата начала')
    const endInput = screen.getByLabelText('Дата окончания')

    await user.clear(startInput)
    await user.type(startInput, '2026-07-01')

    await user.clear(endInput)
    await user.type(endInput, '2026-07-15')

    await user.click(screen.getByText('Рассчитать'))

    expect(screen.getByText(/Рабочих дней/)).toBeInTheDocument()
    expect(screen.getByText(/Календарных дней/)).toBeInTheDocument()
  })
})
