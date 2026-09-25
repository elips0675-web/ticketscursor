import { describe, it, expect, afterAll } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import prisma from '../prisma.js'
import { app } from '../app.js'
import { JWT_SECRET } from '../middleware.js'

// Этап 62 — POST /api/admin/employees/import (админский роут импорта сотрудников).
const adminToken = jwt.sign({ userId: 1, role: 'super_admin', name: 'Алексей Петров' }, JWT_SECRET, { expiresIn: '1h' })
const agentToken = jwt.sign({ userId: 2, role: 'agent', name: 'Олег Сидоров' }, JWT_SECRET, { expiresIn: '1h' })

const domain = `imp${Date.now()}.local`
const createdEmails = []

afterAll(async () => {
  if (createdEmails.length) {
    await prisma.employees.deleteMany({ where: { email: { in: createdEmails } } })
  }
})

describe('POST /api/admin/employees/import — импорт сотрудников', () => {
  it('создаёт сотрудников из rows, возвращает created/skipped и email из транслитерации', async () => {
    const res = await request(app)
      .post('/api/admin/employees/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        rows: [{ department: 'ИТ', name: 'Тест Импорт', title: 'Инженер', phone: '1234567890' }],
        defaultPassword: '123456',
        domain,
      })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.created).toBe(1)
    expect(res.body.data.skipped).toBe(0)

    const emp = res.body.data.employees[0]
    expect(emp.email).toBe(`test.import@${domain}`)
    createdEmails.push(emp.email)
  })

  it('повторный импорт того же email → skipped с причиной', async () => {
    const first = await request(app)
      .post('/api/admin/employees/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ rows: [{ name: 'Дубликат', department: 'ИТ', title: '' }], domain })
    expect(first.status).toBe(200)
    createdEmails.push(first.body.data.employees[0].email)

    const second = await request(app)
      .post('/api/admin/employees/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ rows: [{ name: 'Дубликат', department: 'ИТ', title: '' }], domain })
    expect(second.status).toBe(200)
    expect(second.body.data.created).toBe(0)
    expect(second.body.data.skipped).toBe(1)
    expect(second.body.data.errors[0].reason).toBe('Email уже существует')
  })

  it('пустое ФИО → skipped «Пустое ФИО»', async () => {
    const res = await request(app)
      .post('/api/admin/employees/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ rows: [{ name: '', department: 'ИТ', title: 'Инженер' }], domain })
    expect(res.status).toBe(200)
    expect(res.body.data.created).toBe(0)
    expect(res.body.data.errors[0].reason).toBe('Пустое ФИО')
  })

  it('нет данных → 400', async () => {
    const res = await request(app)
      .post('/api/admin/employees/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ rows: [] })
    expect(res.status).toBe(400)
    expect(res.body.message).toContain('Нет данных для импорта')
  })

  it('RBAC: не-админ → 403', async () => {
    const res = await request(app)
      .post('/api/admin/employees/import')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ rows: [{ name: 'Тест', department: 'ИТ', title: '' }], domain })
    expect(res.status).toBe(403)
  })
})