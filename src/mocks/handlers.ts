import { http, HttpResponse } from 'msw'

const API = 'http://localhost:4000/api'

export const handlers = [
  // ── Polls ──
  http.get(`${API}/polls`, () => {
    return HttpResponse.json({
      data: [
        {
          id: 1,
          title: 'Тестовый опрос',
          description: '',
          multiple_choice: 0,
          options: [
            { id: 1, pollId: 1, text: 'Вариант А', votesCount: 1, voted: true },
            { id: 2, pollId: 1, text: 'Вариант Б', votesCount: 0, voted: false },
          ],
          myVotes: [1],
          totalVotes: 1,
          multipleChoice: false,
        },
      ],
      total: 1,
    })
  }),

  http.post(`${API}/polls`, () => {
    return HttpResponse.json({ id: 2, title: 'Новый опрос', multiple_choice: 0 })
  }),

  http.post(`${API}/polls/:id/vote`, () => {
    return HttpResponse.json({ id: 1, title: 'Тестовый опрос', options: [], totalVotes: 2, multipleChoice: false })
  }),

  // ── Tickets ──
  http.get(`${API}/tickets`, () => {
    return HttpResponse.json({
      data: [
        {
          id: 1,
          title: 'Проблема с доступом',
          description: 'Не могу войти в систему',
          status: 'open',
          priority: 'high',
          category: 'incident',
          tags: ['vpn'],
          created_by: 1,
          assigned_to: 2,
          created_at: '2026-07-01T10:00:00Z',
          updated_at: '2026-07-01T10:00:00Z',
          assigned_name: 'Иван Иванов',
          assigned_email: 'ivan@example.com',
          assigned_avatar: '',
          messages: [],
        },
        {
          id: 2,
          title: 'Ошибка в отчёте',
          description: 'Некорректные данные',
          status: 'in_progress',
          priority: 'medium',
          category: 'bug',
          created_by: 2,
          assigned_to: null,
          created_at: '2026-07-02T08:00:00Z',
          updated_at: '2026-07-02T08:00:00Z',
          assigned_name: null,
          assigned_email: null,
          assigned_avatar: null,
          messages: [],
        },
      ],
      total: 2,
    })
  }),

  http.get(`${API}/tickets/:id`, ({ params }) => {
    return HttpResponse.json({
      data: {
        id: Number(params.id),
        title: 'Проблема с доступом',
        description: 'Не могу войти в систему',
        status: 'open',
        priority: 'high',
        category: 'incident',
        tags: ['vpn'],
        created_by: 1,
        assigned_to: 2,
        computer_name: 'PC-001',
        user_account: 'domain\\user',
        created_at: '2026-07-01T10:00:00Z',
        updated_at: '2026-07-01T10:00:00Z',
        assigned_name: 'Иван Иванов',
        assigned_email: 'ivan@example.com',
        assigned_avatar: '',
        messages: [
          {
            id: 1,
            ticket_id: 1,
            sender_id: 1,
            sender_name: 'Admin',
            text: 'Описание проблемы',
            created_at: '2026-07-01T10:00:00Z',
          },
          {
            id: 2,
            ticket_id: 1,
            sender_id: 2,
            sender_name: 'Иван Иванов',
            text: 'Ответ для @Пётр Петров и @Admin',
            mentions: [1, 3],
            created_at: '2026-07-01T11:00:00Z',
          },
        ],
      },
    })
  }),

  // ── Employees ──
  http.get(`${API}/employees`, () => {
    return HttpResponse.json([
      {
        id: 1,
        name: 'Admin User',
        email: 'admin@test.com',
        role: 'admin',
        department: 'IT',
        avatar: '',
        online: true,
        activeTickets: 2,
        resolvedToday: 1,
        phone: '',
      },
      {
        id: 2,
        name: 'Иван Иванов',
        email: 'ivan@example.com',
        role: 'senior_agent',
        department: 'Support',
        avatar: '',
        online: true,
        activeTickets: 3,
        resolvedToday: 0,
        phone: '',
      },
      {
        id: 3,
        name: 'Пётр Петров',
        email: 'petr@example.com',
        role: 'agent',
        department: 'Support',
        avatar: '',
        online: false,
        activeTickets: 1,
        resolvedToday: 0,
        phone: '',
      },
    ])
  }),

  http.get(`${API}/employees/stats`, () => {
    return HttpResponse.json({ total: 10, open: 4, inProgress: 3, resolved: 2, critical: 1 })
  }),

  // ── Wiki ──
  http.get(`${API}/wiki`, () => {
    return HttpResponse.json({
      data: [
        {
          id: 1,
          title: 'Как настроить VPN',
          content: 'Инструкция по настройке VPN-клиента',
          category: 'Инструкции',
          tags: ['vpn', 'network'],
          author_id: 1,
          author_name: 'Admin',
          created_at: '2026-07-01T10:00:00Z',
          updated_at: '2026-07-01T10:00:00Z',
        },
        {
          id: 2,
          title: 'Политика безопасности',
          content: 'Правила использования корпоративных систем',
          category: 'Документы',
          tags: ['security'],
          author_id: 1,
          author_name: 'Admin',
          created_at: '2026-07-01T09:00:00Z',
          updated_at: '2026-07-01T09:00:00Z',
        },
      ],
      total: 2,
    })
  }),

  http.post(`${API}/wiki`, () => {
    return HttpResponse.json({
      id: 3,
      title: 'Новая статья',
      content: 'Содержание',
      category: 'Другое',
      tags: [],
      author_id: 1,
      author_name: 'Admin',
      created_at: '2026-07-09T10:00:00Z',
      updated_at: '2026-07-09T10:00:00Z',
    })
  }),

  // ── News ──
  http.get(`${API}/news`, () => {
    return HttpResponse.json({
      data: [
        {
          id: 1,
          title: 'Обновление системы',
          content: 'Вышло обновление корпоративной системы',
          important: true,
          author_id: 1,
          author_name: 'Admin',
          created_at: '2026-07-01T10:00:00Z',
        },
        {
          id: 2,
          title: 'Плановые работы',
          content: 'В пятницу с 20:00 будут проводиться работы',
          important: false,
          author_id: 1,
          author_name: 'Admin',
          created_at: '2026-07-02T08:00:00Z',
        },
      ],
      total: 2,
    })
  }),

  http.post(`${API}/news`, () => {
    return HttpResponse.json({
      id: 3,
      title: 'Новость',
      content: 'Текст новости',
      important: false,
      author_id: 1,
      author_name: 'Admin',
      created_at: '2026-07-09T10:00:00Z',
    })
  }),

  // ── Calendar ──
  http.get(`${API}/calendar`, () => {
    return HttpResponse.json([
      {
        id: 1,
        title: 'Встреча по проекту',
        date: '2026-07-15',
        time: '14:00',
        description: 'Обсуждение текущих задач',
        creatorId: 1,
        createdAt: '2026-07-01T10:00:00Z',
      },
      {
        id: 2,
        title: 'Дедлайн отчёта',
        date: '2026-07-20',
        time: null,
        description: 'Сдать квартальный отчёт',
        creatorId: 2,
        createdAt: '2026-07-02T08:00:00Z',
      },
    ])
  }),

  http.post(`${API}/calendar`, () => {
    return HttpResponse.json({
      id: 3,
      title: 'Новое событие',
      date: '2026-07-25',
      time: '10:00',
      description: '',
      creatorId: 1,
      createdAt: '2026-07-09T10:00:00Z',
    })
  }),

  http.delete(`${API}/calendar/:id`, () => {
    return HttpResponse.json({ ok: true })
  }),

  // ── Chats ──
  http.get(`${API}/chats`, () => {
    return HttpResponse.json([
      {
        id: 1,
        name: 'Общий чат',
        type: 'group',
        last_message: 'Привет всем!',
        last_time: '2026-07-09T09:00:00Z',
        unread: 0,
        created_at: '2026-07-01T10:00:00Z',
      },
      {
        id: 2,
        name: 'Техподдержка',
        type: 'group',
        last_message: 'Нужна помощь',
        last_time: '2026-07-08T15:00:00Z',
        unread: 2,
        created_at: '2026-07-01T10:00:00Z',
      },
    ])
  }),

  http.get(`${API}/chats/:id`, ({ params }) => {
    return HttpResponse.json({
      id: Number(params.id),
      name: 'Общий чат',
      type: 'group',
      unread: 0,
      created_at: '2026-07-01T10:00:00Z',
      readers: [{ userId: 2, lastReadMessageId: 2, lastReadAt: '2026-07-09T09:02:00Z' }],
      messages: [
        {
          id: 1,
          chat_id: 1,
          sender_id: 1,
          sender_name: 'Admin',
          text: 'Привет всем!',
          created_at: '2026-07-09T09:00:00Z',
        },
        { id: 2, chat_id: 1, sender_id: 2, sender_name: 'Иван', text: 'Привет!', created_at: '2026-07-09T09:01:00Z' },
      ],
    })
  }),

  // ── Search ──
  http.get(`${API}/search`, () => {
    return HttpResponse.json({
      tickets: [
        { id: 1, title: 'Проблема с доступом', status: 'open', priority: 'high', created_at: '2026-07-01T10:00:00Z' },
      ],
      employees: [{ id: 1, name: 'Admin User', email: 'admin@test.com', department: 'IT', avatar: '' }],
      wiki: [{ id: 1, title: 'Как настроить VPN', category: 'Инструкции', created_at: '2026-07-01T10:00:00Z' }],
      news: [{ id: 1, title: 'Обновление системы', created_at: '2026-07-01T10:00:00Z' }],
      chats: [{ id: 1, name: 'Общий чат', type: 'group' }],
      files: [{ id: 1, name: 'report.pdf', size: '1.2 MB', type: 'pdf', created_at: '2026-07-01T10:00:00Z' }],
    })
  }),

  // ── Notifications ──
  http.get(`${API}/notifications`, () => {
    return HttpResponse.json([
      {
        id: 1,
        user_id: 1,
        type: 'ticket_created',
        title: 'Тикет создан',
        body: 'Проблема с доступом',
        link: '/tickets/1',
        is_read: 0,
        created_at: '2026-07-09T08:00:00Z',
      },
      {
        id: 2,
        user_id: 1,
        type: 'ticket_assigned',
        title: 'Назначен тикет',
        body: 'Ошибка в отчёте',
        link: '/tickets/2',
        is_read: 0,
        created_at: '2026-07-09T07:00:00Z',
      },
    ])
  }),

  http.put(`${API}/notifications/:id/read`, () => {
    return HttpResponse.json({ success: true })
  }),

  http.put(`${API}/notifications/read-all`, () => {
    return HttpResponse.json({ success: true })
  }),

  http.delete(`${API}/notifications/clear-all`, () => {
    return HttpResponse.json({ success: true })
  }),

  // ── Files ──
  http.get(`${API}/files/folders`, () => {
    return HttpResponse.json([
      {
        id: 1,
        name: 'Документы',
        user_id: 1,
        is_shared: true,
        files: [
          {
            id: 1,
            name: 'report.pdf',
            size: '1.2 MB',
            type: 'pdf',
            folderId: 1,
            path: '/uploads/files/report.pdf',
            createdAt: '2026-07-01T10:00:00Z',
          },
          {
            id: 2,
            name: 'image.png',
            size: '256 KB',
            type: 'img',
            folderId: 1,
            path: '/uploads/files/image.png',
            createdAt: '2026-07-02T08:00:00Z',
          },
        ],
        totalFiles: 2,
      },
      { id: 2, name: 'Проекты', user_id: 1, is_shared: false, files: [], totalFiles: 0 },
    ])
  }),

  http.post(`${API}/files/upload`, () => {
    return HttpResponse.json({
      id: 3,
      name: 'new-file.pdf',
      size: '500 KB',
      type: 'pdf',
      folderId: 1,
      path: '/uploads/files/new-file.pdf',
      createdAt: '2026-07-09T10:00:00Z',
    })
  }),

  // ── Auth ──
  http.post(`${API}/auth/dev-login`, () => {
    return HttpResponse.json({
      token: 'dev-token-123',
      employee: { id: 1, name: 'Admin User', email: 'admin@test.com', role: 'admin' },
    })
  }),

  // ── Tickets mutations ──
  http.put(`${API}/tickets/:id/status`, ({ params }) => {
    return HttpResponse.json({ success: true, data: { id: Number(params.id), status: 'resolved' } })
  }),

  http.put(`${API}/tickets/:id/priority`, ({ params }) => {
    return HttpResponse.json({ success: true, data: { id: Number(params.id), priority: 'high' } })
  }),

  http.put(`${API}/tickets/:id/assign`, () => {
    return HttpResponse.json({ success: true })
  }),

  http.put(`${API}/tickets/:id/tags`, ({ params, request }) => {
    return request.json().then((body: { tags?: string[] }) => {
      return HttpResponse.json({ success: true, data: { id: Number(params.id), tags: body.tags || [] } })
    })
  }),

  http.post(`${API}/tickets/bulk`, ({ request }) => {
    return request.json().then((body: { ids?: number[]; action?: string }) => {
      return HttpResponse.json({
        success: true,
        data: { updated: body.ids?.length || 0, skipped: 0, results: (body.ids || []).map((id) => ({ id })) },
      })
    })
  }),

  http.post(`${API}/tickets/:id/messages`, () => {
    return HttpResponse.json({
      data: {
        id: 10,
        ticket_id: 1,
        sender_id: 1,
        sender_name: 'Admin',
        text: 'Новое сообщение',
        created_at: '2026-07-09T12:00:00Z',
        is_internal: 0,
      },
    })
  }),

  http.post(`${API}/tickets`, () => {
    return HttpResponse.json({
      data: {
        id: 3,
        title: 'Новый тикет',
        description: 'Описание',
        status: 'open',
        priority: 'medium',
        category: 'support',
        created_by: 1,
        created_by_name: 'Admin',
        created_at: '2026-07-09T12:00:00Z',
        updated_at: '2026-07-09T12:00:00Z',
        messages: [],
        messages_count: 0,
        assigned_to: null,
        assigned_name: null,
        assigned_email: null,
        assigned_avatar: null,
      },
    })
  }),

  // ── Admin ──
  http.get(`${API}/admin/stats`, () => {
    return HttpResponse.json({
      totalUsers: 5,
      totalTickets: 20,
      openTickets: 8,
      resolvedToday: 3,
      slaCompliance: 85,
    })
  }),

  // ── Feature Flags ──
  http.get(`${API}/admin/features`, () => {
    return HttpResponse.json({
      success: true,
      data: [
        { key: 'new_ticket_form', enabled: true, description: 'New ticket form' },
        { key: 'kanban_view', enabled: false, description: 'Kanban view' },
        { key: 'dark_theme', enabled: true, description: 'Dark theme' },
      ],
    })
  }),
  http.put(`${API}/admin/features`, async ({ request }) => {
    const body = await request.json()
    return HttpResponse.json({ success: true, data: { updated: true } })
  }),

  http.get(`${API}/admin/users`, () => {
    return HttpResponse.json([
      { id: 1, name: 'Admin', email: 'admin@test.com', role: 'admin', isBlocked: false, createdAt: '2026-01-01' },
      { id: 2, name: 'User', email: 'user@test.com', role: 'agent', isBlocked: false, createdAt: '2026-01-02' },
    ])
  }),

  http.get(`${API}/tickets/sla/stats`, () => {
    return HttpResponse.json({
      onTime: 15,
      overdue: 3,
      noSla: 2,
      complianceRate: 83.3,
    })
  }),

  // ── Register ──
  http.post(`${API}/auth/register`, () => {
    return HttpResponse.json({
      token: 'new-token-456',
      employee: { id: 4, name: 'New User', email: 'new@test.com', role: 'agent' },
    })
  }),

  // ── Files upload ──
  http.post(`${API}/files/folders`, () => {
    return HttpResponse.json({ id: 3, name: 'Новая папка', user_id: 1, is_shared: false, files: [], totalFiles: 0 })
  }),
]
