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

  // ── Tickets ──
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
        time_spent_minutes: 60,
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

  http.get(`${API}/tickets/:id/history`, () => {
    return HttpResponse.json({
      success: true,
      data: [
        {
          id: 11,
          user_id: 2,
          user_name: 'Иван Иванов',
          action: 'created',
          details: { title: 'Проблема с доступом', dueAt: null },
          created_at: '2026-07-01T10:00:00Z',
        },
        {
          id: 12,
          user_id: 2,
          user_name: 'Иван Иванов',
          action: 'status_changed',
          details: { from: 'open', to: 'in_progress' },
          created_at: '2026-07-01T11:00:00Z',
        },
        {
          id: 13,
          user_id: 1,
          user_name: 'Admin',
          action: 'priority_changed',
          details: { from: 'medium', to: 'high' },
          created_at: '2026-07-01T12:00:00Z',
        },
        {
          id: 14,
          user_id: 1,
          user_name: 'Admin',
          action: 'assigned',
          details: { assignedTo: 2, assignedName: 'Иван Иванов' },
          created_at: '2026-07-01T13:00:00Z',
        },
      ],
    })
  }),

  // ── Ticket time tracking ──
  http.get(`${API}/tickets/:id/time`, () => {
    return HttpResponse.json({
      success: true,
      data: {
        entries: [
          {
            id: 1,
            ticket_id: 1,
            user_id: 1,
            minutes: 60,
            description: 'Диагностика',
            entry_date: '2026-09-18T09:00:00Z',
            created_at: '2026-09-18T09:00:00Z',
            user: { id: 1, name: 'Admin User', avatar: '' },
          },
        ],
        totalMinutes: 60,
        totalEntries: 1,
        activeTimer: null,
      },
    })
  }),

  http.post(`${API}/tickets/:id/time`, async ({ request }) => {
    const body = (await request.json()) as { minutes: number; description?: string }
    return HttpResponse.json(
      {
        success: true,
        data: {
          id: 2,
          ticket_id: Number(request.url.split('/')[4]),
          user_id: 1,
          minutes: body.minutes,
          description: body.description || '',
          entry_date: '2026-09-18T10:00:00Z',
          created_at: '2026-09-18T10:00:00Z',
          user: { id: 1, name: 'Admin User', avatar: '' },
        },
      },
      { status: 201 },
    )
  }),

  http.delete(`${API}/tickets/:id/time/:entryId`, () => {
    return HttpResponse.json({ success: true, data: { entryId: 1 } })
  }),

  http.get(`${API}/tickets/:id/time/timer`, () => {
    return HttpResponse.json({ success: true, data: null })
  }),

  http.post(`${API}/tickets/:id/time/timer/start`, () => {
    return HttpResponse.json(
      { success: true, data: { id: 1, ticket_id: 1, user_id: 1, started_at: new Date().toISOString() } },
      { status: 201 },
    )
  }),

  http.post(`${API}/tickets/:id/time/timer/stop`, () => {
    return HttpResponse.json({
      success: true,
      data: { timer: null, minutes: 5, entry: { id: 99, ticket_id: 1, user_id: 1, minutes: 5, description: '' } },
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

  http.put(`${API}/chats/:id/read`, () => {
    return HttpResponse.json({ success: true })
  }),

  http.post(`${API}/chats/:id/messages`, () => {
    return HttpResponse.json({ success: true })
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

  http.get(`${API}/notifications/preferences`, () => {
    const events = [
      'ticket_created',
      'ticket_status',
      'ticket_priority',
      'ticket_assigned',
      'ticket_message',
      'ticket_mention',
      'ticket_sla_overdue',
      'ticket_sla_escalated',
    ]
    const channels = ['email', 'push', 'in_app']
    const prefs: Record<string, Record<string, boolean>> = {}
    for (const ev of events) prefs[ev] = Object.fromEntries(channels.map((ch) => [ch, true]))
    return HttpResponse.json({ success: true, data: { prefs, events, channels } })
  }),

  http.put(`${API}/notifications/preferences`, () => {
    return HttpResponse.json({ success: true, data: { prefs: {} } })
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

  // ── Auth: 2FA ──
  http.get(`${API}/auth/2fa/status`, () => {
    return HttpResponse.json({ success: true, data: { enabled: false, secretSet: false, required: true } })
  }),
  http.post(`${API}/auth/2fa/setup`, () => {
    return HttpResponse.json({
      success: true,
      data: {
        secret: 'JBSWY3DPEHPK3PXP',
        otpauthUrl: 'otpauth://totp/Service%20Desk:admin%40test.com?secret=JBSWY3DPEHPK3PXP&issuer=Service%20Desk',
      },
    })
  }),
  http.post(`${API}/auth/2fa/enable`, async ({ request }) => {
    const body = await request.json()
    if (body?.code !== '123456') {
      return HttpResponse.json({ success: false, message: 'Invalid 2FA code', code: 'INVALID_2FA' }, { status: 401 })
    }
    return HttpResponse.json({ success: true, data: { enabled: true } })
  }),
  http.post(`${API}/auth/2fa/disable`, async ({ request }) => {
    const body = await request.json()
    if (body?.code !== '123456') {
      return HttpResponse.json({ success: false, message: 'Invalid 2FA code', code: 'INVALID_2FA' }, { status: 401 })
    }
    return HttpResponse.json({ success: true, data: { enabled: false } })
  }),

  // ── Auth: active sessions (Этап 63, подфича 2) ──
  http.get(`${API}/auth/sessions`, () => {
    return HttpResponse.json({
      success: true,
      data: {
        sessions: [
          {
            id: 11,
            device: 'Chrome · Windows',
            ip: '192.168.1.10',
            createdAt: '2026-09-25T08:00:00Z',
            lastSeenAt: '2026-09-25T09:30:00Z',
            current: true,
          },
          {
            id: 12,
            device: 'Firefox · macOS',
            ip: '192.168.1.20',
            createdAt: '2026-09-24T14:00:00Z',
            lastSeenAt: '2026-09-24T18:00:00Z',
            current: false,
          },
        ],
      },
    })
  }),
  http.post(`${API}/auth/sessions/:id/revoke`, ({ params }) => {
    return HttpResponse.json({ success: true, data: { revoked: true, id: Number(params.id) } })
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

  http.post(`${API}/tickets/:id/assistant`, () => {
    return HttpResponse.json({
      success: true,
      data: {
        keywords: ['vpn', 'доступ'],
        answer: 'Проверьте подключение к VPN-клиенту и перезапустите его. Инструкция доступна в базе знаний.',
        usedLlm: false,
        sources: [{ id: 1, title: 'Как настроить VPN', category: 'Инструкции' }],
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
        { key: 'new_ticket_form', enabled: true, description: 'New ticket form', rollout_percent: 100 },
        { key: 'kanban_view', enabled: false, description: 'Kanban view', rollout_percent: 40 },
        { key: 'ticket_history', enabled: true, description: 'Ticket history tab', rollout_percent: 100 },
        { key: 'two_fa', enabled: true, description: '2FA/TOTP for admins', rollout_percent: 100 },
        { key: 'user_sessions', enabled: false, description: 'Active user sessions (Profile)', rollout_percent: 100 },
        {
          key: 'notification_prefs',
          enabled: false,
          description: 'Notification preferences (Profile)',
          rollout_percent: 100,
        },
        {
          key: 'dark_theme',
          enabled: true,
          description: 'Dark theme',
          rollout_percent: 100,
          schedule: { from: '09:00', to: '18:00' },
        },
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

  // ── Admin: Health ──
  http.get(`${API}/admin/health`, () => {
    return HttpResponse.json({
      success: true,
      data: {
        checks: [
          { name: 'db', label: 'MySQL', ok: true, latency: 12 },
          { name: 'redis', label: 'Redis', ok: true, latency: 3 },
          { name: 'meili', label: 'Meilisearch', ok: false, latency: 0, message: 'MEILI_URL not configured' },
        ],
        queue: { mode: 'bullmq', queues: [{ name: 'email' }, { name: 'sla' }], note: 'BullMQ active' },
        updatedAt: '2026-07-11T12:00:00Z',
      },
    })
  }),

  // ── Admin: Queues ──
  http.get(`${API}/admin/queues`, () => {
    return HttpResponse.json({
      success: true,
      data: {
        mode: 'bullmq',
        queues: [
          { name: 'email', waiting: 2, active: 1, completed: 10, failed: 0, delayed: 0 },
          { name: 'sla', waiting: 0, active: 0, completed: 4, failed: 1, delayed: 2 },
        ],
        note: 'BullMQ active',
      },
    })
  }),

  // ── Admin: Migrations ──
  http.get(`${API}/admin/migrations`, () => {
    return HttpResponse.json({
      success: true,
      data: {
        applied: [
          { name: '001_init.js', batch: 1, time: '2026-01-01T00:00:00Z' },
          { name: '002_users.js', batch: 1, time: '2026-01-01T00:00:00Z' },
        ],
        pending: ['003_feature_flags.js'],
        appliedCount: 2,
        pendingCount: 1,
      },
    })
  }),

  // ── Admin: RBAC ──
  http.get(`${API}/admin/rbac`, () => {
    return HttpResponse.json({
      success: true,
      data: {
        roles: ['agent', 'senior_agent', 'admin', 'super_admin'],
        permissions: [
          {
            key: 'ticket.create',
            label: 'Создание тикетов',
            roles: { agent: true, senior_agent: true, admin: true, super_admin: true },
          },
          {
            key: 'ticket.assign',
            label: 'Назначение тикетов',
            roles: { agent: false, senior_agent: true, admin: true, super_admin: true },
          },
          {
            key: 'admin.access',
            label: 'Доступ к админке',
            roles: { agent: false, senior_agent: false, admin: true, super_admin: true },
          },
        ],
      },
    })
  }),

  // ── Admin: Operations ──
  http.post(`${API}/admin/search/reindex`, () => {
    return HttpResponse.json({ success: true, data: { reindexed: true } })
  }),
  http.post(`${API}/admin/sessions/revoke-all`, () => {
    return HttpResponse.json({ success: true, data: { revoked: 3 } })
  }),
  http.post(`${API}/admin/sessions/revoke/:userId`, () => {
    return HttpResponse.json({ success: true, data: { revoked: true } })
  }),
  http.post(`${API}/admin/settings/restore`, () => {
    return HttpResponse.json({ success: true, data: { restored: true } })
  }),
  http.get(`${API}/admin/email/preview`, () => {
    return HttpResponse.json({
      success: true,
      data: { preview: 'Тикет #42 создан: Тестовая заявка' },
    })
  }),
  http.put(`${API}/admin/settings/rate-limits`, () => {
    return HttpResponse.json({ success: true, data: { updated: true } })
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
