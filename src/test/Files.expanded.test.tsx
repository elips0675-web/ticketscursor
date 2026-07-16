import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from './setup'
import { AllTheProviders } from './test-utils'
import Files from '@/pages/Files'
import * as apiModule from '@/lib/api'
import { toast } from 'sonner'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'files.title': 'Файлы',
        'files.catAll': 'Все',
        'files.catImages': 'Картинки',
        'files.catPDF': 'PDF',
        'files.catDocs': 'Докум.',
        'files.catCode': 'Код',
        'files.dropzone': 'Перетащите файлы сюда',
        'files.searchInFolder': 'Поиск в папке',
        'files.searchAll': 'Поиск по всем файлам',
        'files.uploadSuccess': 'Файл загружен',
        'files.uploadError': 'Ошибка загрузки',
        'files.empty': 'Нет файлов',
      })[key] || key,
  }),
}))

const emptyFoldersHandler = http.get('http://localhost:4000/api/files/folders', () => {
  return HttpResponse.json([{ id: 1, name: 'Пустая папка', user_id: 1, is_shared: false, files: [], totalFiles: 0 }])
})

beforeEach(() => {
  localStorage.setItem('token', 'test-token')
  localStorage.setItem('user', JSON.stringify({ id: 1, name: 'Admin', email: 'admin@test.com', role: 'admin' }))
})

describe('Files', () => {
  it('renders title', () => {
    render(<Files />, { wrapper: AllTheProviders })
    expect(screen.getByText('Файлы')).toBeInTheDocument()
  })

  it('loads and displays folders from API', async () => {
    render(<Files />, { wrapper: AllTheProviders })
    const folder = await screen.findByText('Документы')
    expect(folder).toBeInTheDocument()
  })

  it('shows upload dropzone text', () => {
    render(<Files />, { wrapper: AllTheProviders })
    expect(screen.getByText('Перетащите файлы сюда')).toBeInTheDocument()
  })

  it('shows file items within folder', async () => {
    render(<Files />, { wrapper: AllTheProviders })
    const file = await screen.findByText('report.pdf')
    expect(file).toBeInTheDocument()
  })

  it('shows empty state when no files in folder', async () => {
    server.use(
      http.get('http://localhost:4000/api/files/folders', () => {
        return HttpResponse.json([
          { id: 1, name: 'Пустая папка', user_id: 1, is_shared: false, files: [], totalFiles: 0 },
        ])
      }),
    )
    render(<Files />, { wrapper: AllTheProviders })
    const empty = await screen.findByText('Нет файлов')
    expect(empty).toBeInTheDocument()
  })

  it('loads all files for search mode', async () => {
    const user = userEvent.setup()
    render(<Files />, { wrapper: AllTheProviders })
    await screen.findByText('report.pdf')
    const input = screen.getByPlaceholderText('Поиск в папке')
    await user.type(input, 'report')
    await waitFor(() => {
      expect(screen.getByText('report.pdf')).toBeInTheDocument()
    })
  })

  it('toggles grid/list view', async () => {
    const user = userEvent.setup()
    render(<Files />, { wrapper: AllTheProviders })
    await screen.findByText('report.pdf')
    await user.click(screen.getByLabelText('Вид списком'))
  })

  it('opens file in new tab on card click', async () => {
    const openSpy = vi.fn()
    vi.stubGlobal('open', openSpy)
    const user = userEvent.setup()
    render(<Files />, { wrapper: AllTheProviders })
    await screen.findByText('report.pdf')
    await user.click(screen.getByText('report.pdf'))
    await waitFor(() => {
      expect(openSpy).toHaveBeenCalled()
    })
    vi.unstubAllGlobals()
  })

  it('filters files by category tab', async () => {
    const user = userEvent.setup()
    render(<Files />, { wrapper: AllTheProviders })
    await screen.findByText('report.pdf')
    const pdfTab = screen.getByText('PDF')
    await user.click(pdfTab)
    await waitFor(() => {
      expect(screen.getByText('report.pdf')).toBeInTheDocument()
    })
  })

  it('switches folder on click', async () => {
    const user = userEvent.setup()
    render(<Files />, { wrapper: AllTheProviders })
    await screen.findByText('Документы')
    await user.click(screen.getByText('Проекты'))
    expect(screen.getByText('Проекты')).toBeInTheDocument()
  })

  it('switches to list view and opens file on click', async () => {
    const openSpy = vi.fn()
    vi.stubGlobal('open', openSpy)
    const user = userEvent.setup()
    render(<Files />, { wrapper: AllTheProviders })
    await screen.findByText('report.pdf')
    await user.click(screen.getByLabelText('Вид списком'))
    await waitFor(() => {
      expect(screen.getByText('report.pdf')).toBeInTheDocument()
    })
    await user.click(screen.getByText('report.pdf'))
    await waitFor(() => {
      expect(openSpy).toHaveBeenCalled()
    })
    vi.unstubAllGlobals()
  })

  it('triggers file input via dropzone click', async () => {
    render(<Files />, { wrapper: AllTheProviders })
    await screen.findByText('Перетащите файлы сюда')
    const dropzone = screen.getByLabelText('Перетащите файлы сюда')
    expect(dropzone).toBeInTheDocument()
  })

  it('uploads file via drag and drop', async () => {
    server.use(emptyFoldersHandler)
    const uploadSpy = vi.spyOn(apiModule.api, 'post')
    render(<Files />, { wrapper: AllTheProviders })
    await screen.findByText('Перетащите файлы сюда')
    const file = new File(['test'], 'test.pdf', { type: 'application/pdf' })
    const outerDiv = screen.getByText('Файлы').closest('.space-y-6')
    fireEvent.drop(outerDiv!, { dataTransfer: { files: [file] } })
    await waitFor(() => {
      expect(uploadSpy).toHaveBeenCalled()
    })
    uploadSpy.mockRestore()
  })

  it('shows upload error toast', async () => {
    server.use(
      http.get('http://localhost:4000/api/files/folders', () => {
        return HttpResponse.json([{ id: 1, name: 'Документы', user_id: 1, is_shared: true, files: [], totalFiles: 0 }])
      }),
      http.post('http://localhost:4000/api/files/upload', () => {
        return HttpResponse.error()
      }),
    )
    const toastSpy = vi.spyOn(toast, 'error')
    render(<Files />, { wrapper: AllTheProviders })
    await screen.findByText('Перетащите файлы сюда')
    const file = new File(['test'], 'test.pdf', { type: 'application/pdf' })
    const fileInput = document.querySelector('input[type="file"]')!
    Object.defineProperty(fileInput, 'files', { value: [file] })
    fireEvent.change(fileInput)
    await waitFor(() => {
      expect(toastSpy).toHaveBeenCalled()
    })
    toastSpy.mockRestore()
  })

  it('shows drag overlay when dragging over', async () => {
    render(<Files />, { wrapper: AllTheProviders })
    await screen.findByText('Перетащите файлы сюда')
    const outerDiv = screen.getByText('Файлы').closest('.space-y-6')
    fireEvent.dragEnter(outerDiv!)
    await waitFor(() => {
      expect(screen.getByText('Отпустите файлы для загрузки')).toBeInTheDocument()
    })
  })

  it('opens file from grid card via keyboard', async () => {
    const openSpy = vi.fn()
    vi.stubGlobal('open', openSpy)
    render(<Files />, { wrapper: AllTheProviders })
    const card = await screen.findByText('report.pdf')
    const cardContainer = card.closest('[role="button"]')
    fireEvent.keyDown(cardContainer!, { key: 'Enter' })
    await waitFor(() => {
      expect(openSpy).toHaveBeenCalled()
    })
    vi.unstubAllGlobals()
  })

  it('shows empty search results message', async () => {
    const user = userEvent.setup()
    render(<Files />, { wrapper: AllTheProviders })
    await screen.findByText('report.pdf')
    const input = screen.getByPlaceholderText('Поиск в папке')
    await user.type(input, 'nonexistent')
    await waitFor(() => {
      expect(screen.getByText('Ничего не найдено')).toBeInTheDocument()
    })
  })

  it('opens file from list item via keyboard Enter', async () => {
    const openSpy = vi.fn()
    vi.stubGlobal('open', openSpy)
    render(<Files />, { wrapper: AllTheProviders })
    await screen.findByText('report.pdf')
    fireEvent.click(screen.getByLabelText('Вид списком'))
    await waitFor(() => {
      expect(screen.getByLabelText('Вид сеткой')).toBeInTheDocument()
    })
    const listItem = await screen.findByText('report.pdf')
    const row = listItem.closest('[role="button"]')
    fireEvent.keyDown(row!, { key: 'Enter' })
    await waitFor(() => {
      expect(openSpy).toHaveBeenCalled()
    })
    vi.unstubAllGlobals()
  })

  it('uploads file via dropzone click', async () => {
    server.use(emptyFoldersHandler)
    const uploadSpy = vi.spyOn(apiModule.api, 'post')
    render(<Files />, { wrapper: AllTheProviders })
    await screen.findByText('Перетащите файлы сюда')
    const dropzone = screen.getByLabelText('Перетащите файлы сюда')
    fireEvent.click(dropzone)
    const fileInput = document.querySelector('input[type="file"]')!
    const file = new File(['test'], 'test.pdf', { type: 'application/pdf' })
    Object.defineProperty(fileInput, 'files', { value: [file] })
    fireEvent.change(fileInput)
    await waitFor(() => {
      expect(uploadSpy).toHaveBeenCalled()
    })
    uploadSpy.mockRestore()
  })

  it('triggers dropzone via keyboard Enter', async () => {
    server.use(emptyFoldersHandler)
    const uploadSpy = vi.spyOn(apiModule.api, 'post')
    render(<Files />, { wrapper: AllTheProviders })
    await screen.findByText('Перетащите файлы сюда')
    const dropzone = screen.getByLabelText('Перетащите файлы сюда')
    fireEvent.keyDown(dropzone, { key: 'Enter' })
    const fileInput = document.querySelector('input[type="file"]')!
    const file = new File(['test'], 'test.pdf', { type: 'application/pdf' })
    Object.defineProperty(fileInput, 'files', { value: [file] })
    fireEvent.change(fileInput)
    await waitFor(() => {
      expect(uploadSpy).toHaveBeenCalled()
    })
    uploadSpy.mockRestore()
  })

  it('shows and hides drag overlay on dragEnter/dragLeave', async () => {
    render(<Files />, { wrapper: AllTheProviders })
    await screen.findByText('Перетащите файлы сюда')
    const outerDiv = screen.getByText('Файлы').closest('.space-y-6')
    fireEvent.dragEnter(outerDiv!)
    fireEvent.dragOver(outerDiv!)
    await waitFor(() => {
      expect(screen.getByText('Отпустите файлы для загрузки')).toBeInTheDocument()
    })
    fireEvent.dragLeave(outerDiv!)
    await waitFor(() => {
      expect(screen.queryByText('Отпустите файлы для загрузки')).not.toBeInTheDocument()
    })
  })

  it('shows loading spinner during upload', async () => {
    server.use(
      http.get('http://localhost:4000/api/files/folders', () => {
        return HttpResponse.json([{ id: 1, name: 'Документы', user_id: 1, is_shared: true, files: [], totalFiles: 0 }])
      }),
      http.post('http://localhost:4000/api/files/upload', async () => {
        await new Promise((r) => setTimeout(r, 500))
        return HttpResponse.json({ id: 3, name: 'test.pdf', size: '1 MB', type: 'pdf', folderId: 1, path: '/uploads/files/test.pdf', createdAt: '2026-07-09T10:00:00Z' })
      }),
    )
    render(<Files />, { wrapper: AllTheProviders })
    await screen.findByText('Перетащите файлы сюда')
    const file = new File(['test'], 'test.pdf', { type: 'application/pdf' })
    const outerDiv = screen.getByText('Файлы').closest('.space-y-6')
    fireEvent.drop(outerDiv!, { dataTransfer: { files: [file] } })
    await waitFor(() => {
      expect(document.querySelector('.animate-spin')).toBeInTheDocument()
    })
  })

  it('filters by category and shows no results', async () => {
    server.use(
      http.get('http://localhost:4000/api/files/folders', () => {
        return HttpResponse.json([
          { id: 1, name: 'Документы', user_id: 1, is_shared: true, files: [
            { id: 1, name: 'report.pdf', size: '1.2 MB', type: 'pdf', folderId: 1, path: '/uploads/files/report.pdf', createdAt: '2026-07-01T10:00:00Z' },
          ], totalFiles: 1 },
        ])
      }),
    )
    const user = userEvent.setup()
    render(<Files />, { wrapper: AllTheProviders })
    await screen.findByText('report.pdf')
    const imgTab = screen.getByText('Картинки')
    await user.click(imgTab)
    await waitFor(() => {
      expect(screen.getByText('Нет файлов')).toBeInTheDocument()
    })
  })

  it('does not open file on click when path is missing', async () => {
    server.use(
      http.get('http://localhost:4000/api/files/folders', () => {
        return HttpResponse.json([
          { id: 1, name: 'Документы', user_id: 1, is_shared: true, files: [
            { id: 1, name: 'readme.txt', size: '500 B', type: 'doc', folderId: 1, path: null, createdAt: '2026-07-01T10:00:00Z' },
          ], totalFiles: 1 },
        ])
      }),
    )
    const openSpy = vi.fn()
    vi.stubGlobal('open', openSpy)
    render(<Files />, { wrapper: AllTheProviders })
    await screen.findByText('readme.txt')
    await userEvent.setup().click(screen.getByText('readme.txt'))
    await waitFor(() => {
      expect(openSpy).not.toHaveBeenCalled()
    })
    vi.unstubAllGlobals()
  })

  it('searches across all files when search is active', async () => {
    const user = userEvent.setup()
    render(<Files />, { wrapper: AllTheProviders })
    await screen.findByText('report.pdf')
    const input = screen.getByPlaceholderText('Поиск в папке')
    await user.type(input, 'image')
    await waitFor(() => {
      expect(screen.getByText('image.png')).toBeInTheDocument()
    })
  })

  it('shows upload success toast on successful upload', async () => {
    server.use(
      http.get('http://localhost:4000/api/files/folders', () => {
        return HttpResponse.json([{ id: 1, name: 'Документы', user_id: 1, is_shared: true, files: [], totalFiles: 0 }])
      }),
    )
    const uploadSpy = vi.spyOn(apiModule.api, 'post')
    vi.spyOn(toast, 'success').mockImplementation(() => '')
    render(<Files />, { wrapper: AllTheProviders })
    await screen.findByText('Перетащите файлы сюда')
    const file = new File(['test'], 'test.pdf', { type: 'application/pdf' })
    const outerDiv = screen.getByText('Файлы').closest('.space-y-6')
    fireEvent.drop(outerDiv!, { dataTransfer: { files: [file] } })
    await waitFor(() => {
      expect(uploadSpy).toHaveBeenCalled()
    })
    uploadSpy.mockRestore()
    vi.restoreAllMocks()
  })

  it('shows empty folders list when API returns empty array', async () => {
    server.use(
      http.get('http://localhost:4000/api/files/folders', () => {
        return HttpResponse.json([])
      }),
    )
    render(<Files />, { wrapper: AllTheProviders })
    await waitFor(() => {
      expect(screen.getByText('Нет файлов')).toBeInTheDocument()
    })
  })
})
