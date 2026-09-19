import '@testing-library/jest-dom'
import { setupServer } from 'msw/node'
import { handlers } from '@/mocks/handlers'

export const server = setupServer(...handlers)

const storage = new Map<string, string>()
const localStoragePolyfill = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => {
    storage.set(key, value)
  },
  removeItem: (key: string) => {
    storage.delete(key)
  },
  clear: () => {
    storage.clear()
  },
  get length() {
    return storage.size
  },
  key: (index: number) => [...storage.keys()][index] ?? null,
}

function installLocalStorage(target: Record<string, unknown>) {
  Object.defineProperty(target, 'localStorage', {
    value: localStoragePolyfill,
    writable: true,
    configurable: true,
  })
}

installLocalStorage(globalThis)
try {
  installLocalStorage(window as unknown as Record<string, unknown>)
} catch {
  /* jsdom */
}

Element.prototype.scrollIntoView = () => {}

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
