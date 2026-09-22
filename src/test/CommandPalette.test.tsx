import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { CommandPalette } from '@/components/CommandPalette'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string) => k,
    i18n: { language: 'ru', changeLanguage: vi.fn() },
  }),
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => ({
  ...(await vi.importActual('react-router-dom')),
  useNavigate: () => mockNavigate,
}))

describe('CommandPalette', () => {
  beforeEach(() => {
    mockNavigate.mockClear()
  })

  function renderPalette() {
    return render(
      <MemoryRouter>
        <CommandPalette />
      </MemoryRouter>
    )
  }

  it('opens on Ctrl+K and shows input', async () => {
    renderPalette()
    expect(screen.queryByPlaceholderText('commandPalette.placeholder')).not.toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true })
    await waitFor(() => {
      expect(screen.getByPlaceholderText('commandPalette.placeholder')).toBeInTheDocument()
    })
  })

  it('lists navigation and actions sections', async () => {
    renderPalette()
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true })
    await waitFor(() => {
      expect(screen.getByText('commandPalette.navigation')).toBeInTheDocument()
      expect(screen.getByText('commandPalette.actions')).toBeInTheDocument()
    })
  })

  it('filters items by query', async () => {
    renderPalette()
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true })
    const input = await screen.findByPlaceholderText('commandPalette.placeholder')
    fireEvent.change(input, { target: { value: 'тикеты' } })
    await waitFor(() => {
      expect(screen.getByText('nav.tickets')).toBeInTheDocument()
      expect(screen.queryByText('nav.calendar')).not.toBeInTheDocument()
    })
  })

  it('navigates on Enter with selected item', async () => {
    renderPalette()
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true })
    const input = await screen.findByPlaceholderText('commandPalette.placeholder')
    fireEvent.change(input, { target: { value: 'тикеты' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(mockNavigate).toHaveBeenCalledWith('/tickets')
  })

  it('navigates by clicking an item', async () => {
    renderPalette()
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true })
    const button = await screen.findByRole('button', { name: /nav.dashboard/ })
    fireEvent.click(button)
    expect(mockNavigate).toHaveBeenCalledWith('/')
  })

  it('moves selection with ArrowDown and executes ArrowUp/Enter', async () => {
    renderPalette()
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true })
    const input = await screen.findByPlaceholderText('commandPalette.placeholder')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(mockNavigate).toHaveBeenCalled()
  })

  it('closes on Escape', async () => {
    renderPalette()
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true })
    const input = await screen.findByPlaceholderText('commandPalette.placeholder')
    fireEvent.keyDown(input, { key: 'Escape' })
    await waitFor(() => {
      expect(screen.queryByPlaceholderText('commandPalette.placeholder')).not.toBeInTheDocument()
    })
  })

  it('shows no results state for unknown query', async () => {
    renderPalette()
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true })
    const input = await screen.findByPlaceholderText('commandPalette.placeholder')
    fireEvent.change(input, { target: { value: 'zzzz-nonexistent' } })
    await waitFor(() => {
      expect(screen.getByText('commandPalette.noResults')).toBeInTheDocument()
    })
  })

  it('toggles closed with second Ctrl+K', async () => {
    renderPalette()
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true })
    await screen.findByPlaceholderText('commandPalette.placeholder')
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true })
    await waitFor(() => {
      expect(screen.queryByPlaceholderText('commandPalette.placeholder')).not.toBeInTheDocument()
    })
  })

  it('navigates to global search action', async () => {
    renderPalette()
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true })
    const input = await screen.findByPlaceholderText('commandPalette.placeholder')
    fireEvent.change(input, { target: { value: 'поиск' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(mockNavigate).toHaveBeenCalledWith('/search')
  })
})