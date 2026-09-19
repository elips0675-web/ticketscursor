import swaggerJsdoc from 'swagger-jsdoc'

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Service Desk API',
      version: '1.0.0',
      description: 'API for corporate Service Desk system — tickets, chats, wiki, news, polls, files, calendar, employees, auth, admin',
    },
    servers: [
      { url: 'http://localhost:4000', description: 'Local dev' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        Ticket: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            title: { type: 'string' },
            description: { type: 'string' },
            status: { type: 'string', enum: ['open', 'in_progress', 'resolved', 'closed'] },
            priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
            category: { type: 'string' },
            created_by: { type: 'integer' },
            assigned_to: { type: 'integer' },
            computer_name: { type: 'string' },
            user_account: { type: 'string' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },
        Employee: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            name: { type: 'string' },
            email: { type: 'string' },
            role: { type: 'string', enum: ['admin', 'senior_agent', 'agent'] },
            department: { type: 'string' },
            avatar: { type: 'string' },
            online: { type: 'boolean' },
          },
        },
        Error: {
          type: 'object',
          properties: {
            message: { type: 'string' },
          },
        },
      },
    },
    paths: {
      '/api/auth/login': {
        post: {
          tags: ['Auth'],
          summary: 'Login',
          requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { email: { type: 'string' }, password: { type: 'string' } }, required: ['email', 'password'] } } } },
          responses: { '200': { description: 'JWT token' }, '401': { description: 'Invalid credentials' } },
        },
      },
      '/api/auth/register': {
        post: {
          tags: ['Auth'],
          summary: 'Register (admin only)',
          security: [{ bearerAuth: [] }],
          requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { email: { type: 'string' }, password: { type: 'string' }, name: { type: 'string' }, role: { type: 'string', enum: ['agent', 'senior_agent'] } }, required: ['email', 'password', 'name'] } } } },
          responses: { '201': { description: 'User created' }, '403': { description: 'Forbidden' } },
        },
      },
      '/api/tickets': {
        get: {
          tags: ['Tickets'],
          summary: 'List all tickets',
          security: [{ bearerAuth: [] }],
          responses: { '200': { description: 'Array of tickets', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Ticket' } } } } } },
        },
        post: {
          tags: ['Tickets'],
          summary: 'Create a ticket',
          security: [{ bearerAuth: [] }],
          requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { title: { type: 'string' }, description: { type: 'string' }, priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] }, category: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } }, computerName: { type: 'string' }, userAccount: { type: 'string' } }, required: ['title', 'description', 'priority', 'category'] } } } },
          responses: { '201': { description: 'Created ticket' } },
        },
      },
      '/api/tickets/{id}/status': {
        put: {
          tags: ['Tickets'],
          summary: 'Update ticket status (senior_agent+)',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { status: { type: 'string', enum: ['open', 'in_progress', 'resolved', 'closed'] } }, required: ['status'] } } } },
          responses: { '200': { description: 'Updated' }, '403': { description: 'Forbidden' } },
        },
      },
      '/api/tickets/{id}/priority': {
        put: {
          tags: ['Tickets'],
          summary: 'Update ticket priority (senior_agent+)',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] } }, required: ['priority'] } } } },
          responses: { '200': { description: 'Updated' }, '403': { description: 'Forbidden' } },
        },
      },
      '/api/tickets/{id}/assign': {
        put: {
          tags: ['Tickets'],
          summary: 'Assign ticket to employee (senior_agent+)',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { employeeId: { type: 'integer' } }, required: ['employeeId'] } } } },
          responses: { '200': { description: 'Assigned' }, '403': { description: 'Forbidden' } },
        },
      },
      '/api/tickets/{id}/tags': {
        put: {
          tags: ['Tickets'],
          summary: 'Update ticket tags (agent+)',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { tags: { type: 'array', items: { type: 'string' } } }, required: ['tags'] } } } },
          responses: { '200': { description: 'Tags updated' }, '404': { description: 'Ticket not found' }, '403': { description: 'Forbidden' } },
        },
      },
      '/api/tickets/{id}/messages': {
        post: {
          tags: ['Tickets'],
          summary: 'Add message to ticket',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { text: { type: 'string' }, isInternal: { type: 'boolean' }, attachments: { type: 'array', items: { type: 'object' } } }, required: ['text'] } } } },
          responses: { '201': { description: 'Message created. Mentions detected via @name / @email-prefix and stored in response data.mentions.' } },
        },
      },
      '/api/tickets/{id}/assistant': {
        post: {
          tags: ['Tickets'],
          summary: 'Generate AI assistant suggestion from knowledge base (agent+)',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: {
            '200': {
              description: 'Suggestion with wiki sources',
              content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'object', properties: { keywords: { type: 'array', items: { type: 'string' } }, answer: { type: 'string' }, usedLlm: { type: 'boolean' }, sources: { type: 'array', items: { type: 'object', properties: { id: { type: 'integer' }, title: { type: 'string' }, category: { type: 'string' } } } } } } } } } },
            },
            '404': { description: 'Ticket not found' },
          },
        },
      },
      '/api/tickets/bulk': {
        post: {
          tags: ['Tickets'],
          summary: 'Bulk update tickets — status / assign / priority (agent+)',
          security: [{ bearerAuth: [] }],
          requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { ids: { type: 'array', items: { type: 'integer' }, minItems: 1 }, action: { type: 'string', enum: ['status', 'assign', 'priority'] }, status: { type: 'string', enum: ['open', 'in_progress', 'resolved', 'closed', 'reopened'] }, employeeId: { type: 'integer', nullable: true }, priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] } }, required: ['ids', 'action'] } } } },
          responses: { '200': { description: 'Bulk update result { updated, skipped, results }' }, '400': { description: 'Validation error' }, '403': { description: 'Forbidden' } },
        },
      },
      '/api/tickets/upload': {
        post: {
          tags: ['Tickets'],
          summary: 'Upload file for ticket message',
          security: [{ bearerAuth: [] }],
          requestBody: { content: { 'multipart/form-data': { schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } } } },
          responses: { '200': { description: 'File uploaded' } },
        },
      },
      '/api/employees': {
        get: {
          tags: ['Employees'],
          summary: 'List all employees',
          security: [{ bearerAuth: [] }],
          responses: { '200': { description: 'Array of employees', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Employee' } } } } } },
        },
      },
      '/api/chats': {
        get: {
          tags: ['Chats'],
          summary: 'List all chats',
          security: [{ bearerAuth: [] }],
          responses: { '200': { description: 'Array of chats' } },
        },
      },
      '/api/wiki': {
        get: {
          tags: ['Wiki'],
          summary: 'List wiki articles',
          security: [{ bearerAuth: [] }],
          responses: { '200': { description: 'Array of articles' } },
        },
        post: {
          tags: ['Wiki'],
          summary: 'Create wiki article',
          security: [{ bearerAuth: [] }],
          requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { title: { type: 'string' }, content: { type: 'string' }, category: { type: 'string' }, tags: { type: 'string' } }, required: ['title', 'content'] } } } },
          responses: { '201': { description: 'Article created' } },
        },
      },
      '/api/news': {
        get: {
          tags: ['News'],
          summary: 'List news',
          security: [{ bearerAuth: [] }],
          responses: { '200': { description: 'Array of news' } },
        },
        post: {
          tags: ['News'],
          summary: 'Create news (senior_agent+)',
          security: [{ bearerAuth: [] }],
          requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { title: { type: 'string' }, content: { type: 'string' }, important: { type: 'boolean' } }, required: ['title', 'content'] } } } },
          responses: { '201': { description: 'News created' }, '403': { description: 'Forbidden' } },
        },
      },
      '/api/polls': {
        get: {
          tags: ['Polls'],
          summary: 'List polls',
          security: [{ bearerAuth: [] }],
          responses: { '200': { description: 'Array of polls' } },
        },
        post: {
          tags: ['Polls'],
          summary: 'Create poll (senior_agent+)',
          security: [{ bearerAuth: [] }],
          requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { title: { type: 'string' }, options: { type: 'array', items: { type: 'string' } } }, required: ['title', 'options'] } } } },
          responses: { '201': { description: 'Poll created' }, '403': { description: 'Forbidden' } },
        },
      },
      '/api/polls/{id}/vote': {
        post: {
          tags: ['Polls'],
          summary: 'Vote in a poll',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { optionIndex: { type: 'integer' } }, required: ['optionIndex'] } } } },
          responses: { '200': { description: 'Vote recorded' } },
        },
      },
      '/api/calendar': {
        get: {
          tags: ['Calendar'],
          summary: 'List calendar events',
          security: [{ bearerAuth: [] }],
          responses: { '200': { description: 'Array of events' } },
        },
        post: {
          tags: ['Calendar'],
          summary: 'Create event',
          security: [{ bearerAuth: [] }],
          requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { title: { type: 'string' }, date: { type: 'string', format: 'date' }, description: { type: 'string' } }, required: ['title', 'date'] } } } },
          responses: { '201': { description: 'Event created' } },
        },
      },
      '/api/calendar/{id}': {
        delete: {
          tags: ['Calendar'],
          summary: 'Delete event (senior_agent+)',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: { '200': { description: 'Deleted' }, '403': { description: 'Forbidden' } },
        },
      },
      '/api/files/folders': {
        get: {
          tags: ['Files'],
          summary: 'List file folders',
          security: [{ bearerAuth: [] }],
          responses: { '200': { description: 'Array of folders with files' } },
        },
      },
      '/api/files/upload': {
        post: {
          tags: ['Files'],
          summary: 'Upload a file',
          security: [{ bearerAuth: [] }],
          requestBody: { content: { 'multipart/form-data': { schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' }, folderId: { type: 'integer' } } } } } },
          responses: { '201': { description: 'File uploaded' } },
        },
      },
      '/api/admin/users': {
        get: {
          tags: ['Admin'],
          summary: 'List all users (admin only)',
          security: [{ bearerAuth: [] }],
          responses: { '200': { description: 'Array of users' }, '403': { description: 'Forbidden' } },
        },
      },
      '/api/admin/users/{id}': {
        put: {
          tags: ['Admin'],
          summary: 'Update user (admin only)',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { role: { type: 'string' }, is_blocked: { type: 'boolean' } } } } } },
          responses: { '200': { description: 'Updated' }, '403': { description: 'Forbidden' } },
        },
      },
      '/api/search': {
        get: {
          tags: ['Search'],
          summary: 'Global search',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'q', in: 'query', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Grouped search results' } },
        },
      },
      '/api/notifications': {
        get: {
          tags: ['Notifications'],
          summary: 'List user notifications',
          security: [{ bearerAuth: [] }],
          responses: { '200': { description: 'Array of notifications' } },
        },
      },
      '/api/push/subscribe': {
        post: {
          tags: ['Push'],
          summary: 'Subscribe to push notifications',
          security: [{ bearerAuth: [] }],
          requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { subscription: { type: 'object' } }, required: ['subscription'] } } } },
          responses: { '200': { description: 'Subscribed' } },
        },
      },
      '/api/push/send': {
        post: {
          tags: ['Push'],
          summary: 'Send push notification (admin/senior_agent)',
          security: [{ bearerAuth: [] }],
          requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { title: { type: 'string' }, body: { type: 'string' } }, required: ['title', 'body'] } } } },
          responses: { '200': { description: 'Sent' } },
        },
      },
      '/api/health': {
        get: {
          tags: ['System'],
          summary: 'Health check',
          responses: { '200': { description: 'OK' } },
        },
      },
    },
  },
  apis: [],
}

export default swaggerJsdoc(options)
