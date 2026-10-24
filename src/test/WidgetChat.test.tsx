import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import WidgetChat from '@/pages/WidgetChat'

vi.mock('@/components/widget/WidgetPanel', () => ({
  default: ({ websiteToken, onClose }: { websiteToken: string; onClose?: () => void }) => (
    <div>
      <span>widget:{websiteToken}</span>
      <button type="button" onClick={onClose}>
        close
      </button>
    </div>
  ),
}))

describe('WidgetChat', () => {
  it('берёт токен канала из адреса и передаёт его панели', () => {
    render(
      <MemoryRouter initialEntries={['/widget/site-token-42']}>
        <Routes>
          <Route path="/widget/:token" element={<WidgetChat />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByText('widget:site-token-42')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'close' })).toBeInTheDocument()
  })
})
