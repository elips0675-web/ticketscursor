import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import Csatisfaction from '@/pages/Csatisfaction'

// Страница оценки обслуживания /csat/:token — использует нативный fetch.
const survey = { ticket_id: 42, ticket: { title: 'Проблема с принтером' }, alreadyResponded: false }

function jsonRes(data: unknown) {
  return { ok: true, json: () => Promise.resolve(data) } as Response
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/csat/tok123']}>
      <Routes>
        <Route path="/csat/:token" element={<Csatisfaction />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Csatisfaction — оценка обслуживания', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    global.fetch = fetchMock as typeof fetch
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('показывает спиннер во время загрузки', () => {
    fetchMock.mockReturnValue(new Promise<Response>(() => {}))
    const { container } = renderPage()
    expect(container.querySelector('.animate-spin')).toBeTruthy()
    expect(screen.queryByText('Rate our service')).not.toBeInTheDocument()
  })

  it('без токена в URL остаётся на загрузке', () => {
    const { container } = render(
      <MemoryRouter>
        <Csatisfaction />
      </MemoryRouter>,
    )
    expect(container.querySelector('.animate-spin')).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('загружает опрос и показывает форму', async () => {
    fetchMock.mockResolvedValue(jsonRes({ success: true, data: survey }))
    renderPage()
    expect(await screen.findByText('Rate our service')).toBeInTheDocument()
    expect(screen.getByText(/Проблема с принтером/)).toBeInTheDocument()
    expect(screen.getAllByRole('button')).toHaveLength(6) // 5 звёзд + submit
    expect(screen.getByPlaceholderText('Optional comment...')).toBeInTheDocument()
  })

  it('показывает номер тикета, когда заголовок отсутствует', async () => {
    fetchMock.mockResolvedValue(jsonRes({ success: true, data: { ticket_id: 7 } }))
    renderPage()
    expect(await screen.findByText(/#7/)).toBeInTheDocument()
  })

  it('показывает благодарность, если на опрос уже отвечали', async () => {
    fetchMock.mockResolvedValue(jsonRes({ success: true, data: survey, alreadyResponded: true }))
    renderPage()
    expect(await screen.findByText('Thank you!')).toBeInTheDocument()
  })

  it('подсвечивает звёзды при наведении и снимает подсветку', async () => {
    fetchMock.mockResolvedValue(jsonRes({ success: true, data: survey }))
    renderPage()
    await screen.findByText('Rate our service')
    const btns = screen.getAllByRole('button')
    fireEvent.mouseEnter(btns[2])
    fireEvent.mouseLeave(btns[2])
    expect(screen.getAllByRole('button')).toHaveLength(6)
  })

  it('показывает реакцию на низкую, среднюю и высокую оценку', async () => {
    fetchMock.mockResolvedValue(jsonRes({ success: true, data: survey }))
    renderPage()
    await screen.findByText('Rate our service')
    const btns = screen.getAllByRole('button')
    fireEvent.click(btns[1]) // 2 звезды
    expect(screen.getByText("We're sorry to hear that")).toBeInTheDocument()
    fireEvent.click(btns[2]) // 3 звезды
    expect(screen.getByText('Thank you')).toBeInTheDocument()
    fireEvent.click(btns[4]) // 5 звёзд
    expect(screen.getByText('Great to hear!')).toBeInTheDocument()
  })

  it('отправляет оценку и показывает благодарность', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({ success: true, data: survey }))
    fetchMock.mockResolvedValueOnce(jsonRes({ success: true }))
    renderPage()
    const btns = await screen.findAllByRole('button')
    fireEvent.click(btns[4]) // 5 звёзд
    fireEvent.change(screen.getByPlaceholderText('Optional comment...'), { target: { value: 'Отлично' } })
    fireEvent.click(screen.getByText('Submit feedback'))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const [, postCall] = fetchMock.mock.calls
    expect(postCall[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ rating: 5, comment: 'Отлично' }),
    })
    expect(await screen.findByText('Thank you!')).toBeInTheDocument()
  })

  it('не отправляет без оценки', async () => {
    fetchMock.mockResolvedValue(jsonRes({ success: true, data: survey }))
    renderPage()
    await screen.findByText('Rate our service')
    fireEvent.click(screen.getByText('Submit feedback'))
    expect(fetchMock).toHaveBeenCalledTimes(1) // только GET
  })

  it('показывает ошибку, если опрос не найден', async () => {
    fetchMock.mockResolvedValue(jsonRes({ success: false, message: 'Survey not found' }))
    renderPage()
    expect(await screen.findByText('Survey not found')).toBeInTheDocument()
  })

  it('показывает ошибку при сбое сети на загрузке', async () => {
    fetchMock.mockRejectedValue(new Error('Network error'))
    renderPage()
    expect(await screen.findByText('Failed to load survey')).toBeInTheDocument()
  })

  it('показывает ошибку при неудачной отправке', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({ success: true, data: survey }))
    fetchMock.mockResolvedValueOnce(jsonRes({ success: false, message: 'Failed to submit' }))
    renderPage()
    const btns = await screen.findAllByRole('button')
    fireEvent.click(btns[4])
    fireEvent.click(screen.getByText('Submit feedback'))
    expect(await screen.findByText('Failed to submit')).toBeInTheDocument()
  })

  it('показывает ошибку при сбое сети на отправке', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({ success: true, data: survey }))
    fetchMock.mockRejectedValueOnce(new Error('Network error'))
    renderPage()
    const btns = await screen.findAllByRole('button')
    fireEvent.click(btns[4])
    fireEvent.click(screen.getByText('Submit feedback'))
    expect(await screen.findByText('Failed to submit response')).toBeInTheDocument()
  })
})
