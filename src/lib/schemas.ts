import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().email('Введите корректный email'),
  password: z.string().min(1, 'Введите пароль'),
})

export const registerSchema = z.object({
  name: z.string().min(1, 'Имя обязательно').max(100, 'Максимум 100 символов'),
  email: z.string().email('Введите корректный email'),
  password: z
    .string()
    .min(8, 'Минимум 8 символов')
    .regex(/[A-ZА-Я]/, 'Хотя бы одна заглавная буква')
    .regex(/[0-9]/, 'Хотя бы одна цифра'),
})

export const newTicketSchema = z.object({
  title: z.string().min(5, 'Минимум 5 символов').max(200, 'Максимум 200 символов'),
  description: z.string().min(10, 'Минимум 10 символов'),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  category: z.string().min(1, 'Выберите категорию'),
})

export type LoginFormData = z.infer<typeof loginSchema>
export type RegisterFormData = z.infer<typeof registerSchema>
export type NewTicketFormData = z.infer<typeof newTicketSchema>
