import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import prisma from '../prisma.js'
import { app } from '../app.js'
import { JWT_SECRET } from '../middleware.js'
import { invalidateCache } from '../cache.js'

// Этап 66 (подфича 3) — Ticket forms (флаг ticket_forms):
//  - GET  /api/tickets/categories — включённые категории с JSON-схемой (для формы создания тикета);
//  - POST /api/tickets с formData — валидация по схеме + сохранение в tickets.form_data;
//  - admin CRUD /api/admin/ticket-categories (GET/POST/PUT/DELETE, 409 на дубликат, 400 на пустое имя);
//  - изоляция: выделенные id 608 (admin-categories) / 609 (agent-categories).
const PASSWORD_HASH = '$2a$10$nC7/hzotFOk5Qn8OLCoErut65ybvbbovuxrTRr9MG7EGWs8Tindgy' // bcrypt('123456')

const adminToken = jwt.sign({ userId: 608, role: 'admin', name: 'Forms Admin' }, JWT_SECRET, { expiresIn: '1h' })
const agentToken = jwt.sign({ userId: 609, role: 'agent', name: 'Forms Agent' }, JWT_SECRET, { expiresIn: '1h' })

const createdTicketIds = []
const createdCategoryIds = []

async function cleanupEmployeeDeps(id) {
  await prisma.notifications.deleteMany({ where: { user_id: id } })
  await prisma.audit_log.deleteMany({ where: { user_id: id } })
  await prisma.refresh_tokens.deleteMany({ where: { user_id: id } })
  await prisma.notification_preferences.deleteMany({ where: { user_id: id } }).catch(() => {})
  await prisma.user_totp.deleteMany({ where: { user_id: id } }).catch(() => {})
  await prisma.push_subscriptions.deleteMany({ where: { user_id: id } }).catch(() => {})
  await prisma.ticket_timers.deleteMany({ where: { user_id: id } }).catch(() => {})
  await prisma.time_entries.deleteMany({ where: { user_id: id } }).catch(() => {})
}

async function seedEmployee(id, email, role, name) {
  await cleanupEmployeeDeps(id)
  await prisma.employees.deleteMany({ where: { id } })
  await prisma.employees.create({ data: { id, name, email, password_hash: PASSWORD_HASH, role, is_active: true } })
}

async function createCategory(payload) {
  const res = await request(app)
    .post('/api/admin/ticket-categories')
    .set('Authorization', `Bearer ${adminToken}`)
    .send(payload)
  createdCategoryIds.push(res.body.data?.id)
  return res
}

function clearTicketsCache() {
  return invalidateCache('cache:*:/api/tickets*')
}

beforeAll(async () => {
  await seedEmployee(608, 'forms-admin@example.com', 'admin', 'Forms Admin')
  await seedEmployee(609, 'forms-agent@example.com', 'agent', 'Forms Agent')
})

afterAll(async () => {
  if (createdTicketIds.length) {
    await prisma.ticket_messages.deleteMany({ where: { ticket_id: { in: createdTicketIds } } })
    await prisma.audit_log.deleteMany({ where: { entity_type: 'ticket', entity_id: { in: createdTicketIds } } })
    await prisma.tickets.deleteMany({ where: { id: { in: createdTicketIds } } })
  }
  if (createdCategoryIds.length) {
    await prisma.ticket_categories.deleteMany({ where: { id: { in: createdCategoryIds } } })
  }
  await prisma.audit_log.deleteMany({ where: { user_id: { in: [608, 609] } } })
  await prisma.notifications.deleteMany({ where: { user_id: { in: [608, 609] } } })
  await prisma.refresh_tokens.deleteMany({ where: { user_id: { in: [608, 609] } } })
  await prisma.employees.deleteMany({ where: { id: { in: [608, 609] } } })
})

describe('GET /api/tickets/categories (публичный список для формы)', () => {
  it('401 без токена', async () => {
    await request(app).get('/api/tickets/categories').expect(401)
  })

  it('200 с пустым списком, когда категорий нет', async () => {
    const res = await request(app)
      .get('/api/tickets/categories')
      .set('Authorization', `Bearer ${agentToken}`)
      .expect(200)
    expect(res.body.success).toBe(true)
    expect(Array.isArray(res.body.data)).toBe(true)
  })

  it('возвращает только включённые категории с нормализованной схемой', async () => {
    const created = await createCategory({
      name: 'incident',
      description: 'Инциденты',
      enabled: true,
      sortOrder: 0,
      schema: [
        { name: 'location', label: 'Локация', type: 'select', required: true, options: ['Москва', 'СПб'] },
        { name: 'impact', label: 'Влияние', type: 'text', required: false, options: [] },
      ],
    })
    expect(created.status).toBe(201)
    await createCategory({ name: 'hidden', description: 'Скрытая', enabled: false, schema: [] })

    await clearTicketsCache()
    const res = await request(app)
      .get('/api/tickets/categories')
      .set('Authorization', `Bearer ${agentToken}`)
      .expect(200)
    const names = res.body.data.map((c) => c.name)
    expect(names).toContain('incident')
    expect(names).not.toContain('hidden')
    const incident = res.body.data.find((c) => c.name === 'incident')
    expect(incident.schema).toHaveLength(2)
  })
})

describe('POST /api/tickets с formData (динамические поля категории)', () => {
  it('обязательное поле пустое → 400 с сообщением', async () => {
    const res = await request(app)
      .post('/api/tickets')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({
        title: 'Форма: пустое обязательное поле',
        description: 'Описание',
        priority: 'medium',
        category: 'incident',
        formData: [{ name: 'location', value: '' }],
      })
    expect(res.status).toBe(400)
    expect(res.body.message).toContain('Локация')
  })

  it('select с недопустимым значением → 400', async () => {
    const res = await request(app)
      .post('/api/tickets')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({
        title: 'Форма: неверный select',
        description: 'Описание',
        priority: 'medium',
        category: 'incident',
        formData: [{ name: 'location', value: 'Казань' }],
      })
    expect(res.status).toBe(400)
  })

  it('валидные значения → 201 и form_data сохранён в тикете', async () => {
    const res = await request(app)
      .post('/api/tickets')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Форма: валидные значения',
        description: 'Описание',
        priority: 'medium',
        category: 'incident',
        formData: [
          { name: 'location', value: 'Москва' },
          { name: 'impact', value: 'Высокое' },
        ],
      })
    expect(res.status).toBe(201)
    createdTicketIds.push(res.body.data.id)
    const fd = res.body.data.form_data
    expect(fd).toBeTruthy()
    expect(fd.category_name).toBe('incident')
    expect(fd.fields).toEqual({ location: 'Москва', impact: 'Высокое' })

    await clearTicketsCache()
    const detail = await request(app)
      .get(`/api/tickets/${res.body.data.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
    expect(detail.body.data.form_data).toBeTruthy()
    expect(detail.body.data.form_data.fields.location).toBe('Москва')
  })

  it('неизвестная категория → formData игнорируется, тикет создаётся без form_data', async () => {
    const res = await request(app)
      .post('/api/tickets')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Форма: неизвестная категория',
        description: 'Описание',
        priority: 'medium',
        category: 'feature',
        formData: [{ name: 'x', value: 'y' }],
      })
    expect(res.status).toBe(201)
    createdTicketIds.push(res.body.data.id)
    expect(res.body.data.form_data).toBeFalsy()
  })
})

describe('Admin CRUD /api/admin/ticket-categories', () => {
  it('401 без токена на все роуты', async () => {
    await request(app).get('/api/admin/ticket-categories').expect(401)
    await request(app).post('/api/admin/ticket-categories').send({ name: 'x' }).expect(401)
  })

  it('PUT обновляет категорию, DELETE удаляет', async () => {
    const created = await createCategory({ name: 'network', description: 'Сеть', schema: [] })
    const id = created.body.data.id

    const put = await request(app)
      .put(`/api/admin/ticket-categories/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ description: 'Сеть (обновлено)', schema: [{ name: 'vlan', label: 'VLAN', type: 'text', required: false, options: [] }] })
    expect(put.status).toBe(200)
    expect(put.body.data.description).toBe('Сеть (обновлено)')

    const del = await request(app)
      .delete(`/api/admin/ticket-categories/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
    expect(del.body.data.deleted).toBe(true)
  })

  it('пустое имя → 400; дубликат → 409; невалидный тип поля нормализуется в text', async () => {
    const bad = await request(app)
      .post('/api/admin/ticket-categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: ' ' })
    expect(bad.status).toBe(400)

    await createCategory({ name: 'dup', schema: [{ name: 'f1', label: 'F1', type: 'bogus', required: false, options: [] }] })
    const dup = await request(app)
      .post('/api/admin/ticket-categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'dup', schema: [] })
    expect(dup.status).toBe(409)

    const list = await request(app)
      .get('/api/admin/ticket-categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
    const dupCat = list.body.data.find((c) => c.name === 'dup')
    expect(dupCat.schema[0].type).toBe('text')
  })

  it('404 на PUT/DELETE несуществующей категории', async () => {
    await request(app)
      .put('/api/admin/ticket-categories/999999')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ description: 'x' })
      .expect(404)
    await request(app)
      .delete('/api/admin/ticket-categories/999999')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404)
  })
})