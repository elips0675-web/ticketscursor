// Custom roles (Этап 66.5): роль = базовый уровень (agent/senior_agent) плюс
// набор permissions из RBAC_PERMISSIONS. Нужно, чтобы выдать агенту одно
// право (например tickets.delete), не поднимая его до admin: раньше выбор был
// только между фиксированными ролями иерархии.
//
// Миграция идемпотентна: таблицы, колонка и внешний ключ создаются только при
// отсутствии, флаг вставляется только если ключа ещё нет.
const FK_NAME = 'fk_employees_custom_role'

async function hasForeignKey(knex, table, column) {
  const [rows] = await knex.raw(
    `SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
       AND REFERENCED_TABLE_NAME IS NOT NULL`,
    [table, column],
  )
  return rows.length > 0
}

export async function up(knex) {
  if (!(await knex.schema.hasTable('custom_roles'))) {
    await knex.schema.createTable('custom_roles', (t) => {
      t.increments('id').primary()
      t.string('name', 100).notNullable().unique()
      t.string('description', 500).notNullable().defaultTo('')
      t.string('base_role', 20).notNullable().defaultTo('agent')
      t.timestamp('created_at').defaultTo(knex.fn.now())
      t.timestamp('updated_at').defaultTo(knex.fn.now())
    })
  }

  if (!(await knex.schema.hasTable('custom_role_permissions'))) {
    await knex.schema.createTable('custom_role_permissions', (t) => {
      t.increments('id').primary()
      t.integer('role_id').unsigned().notNullable()
      t.string('permission', 100).notNullable()
      t.unique(['role_id', 'permission'], { indexName: 'uq_custom_role_permission' })
      t.foreign('role_id', 'fk_custom_role_permissions_role')
        .references('id')
        .inTable('custom_roles')
        .onDelete('CASCADE')
    })
  }

  if (await knex.schema.hasTable('employees')) {
    if (!(await knex.schema.hasColumn('employees', 'custom_role_id'))) {
      await knex.schema.alterTable('employees', (t) => {
        t.integer('custom_role_id').unsigned().nullable()
      })
    }
    if (!(await hasForeignKey(knex, 'employees', 'custom_role_id'))) {
      await knex.schema.alterTable('employees', (t) => {
        t.foreign('custom_role_id', FK_NAME).references('id').inTable('custom_roles').onDelete('SET NULL')
      })
    }
  }

  if (await knex.schema.hasTable('feature_flags')) {
    const flag = await knex('feature_flags').where({ key: 'custom_roles' }).first()
    if (!flag) {
      await knex('feature_flags').insert({
        key: 'custom_roles',
        enabled: false,
        description: 'Custom roles: конструктор ролей из набора permissions',
      })
    }
  }
}

export async function down(knex) {
  if (await knex.schema.hasTable('employees')) {
    if (await hasForeignKey(knex, 'employees', 'custom_role_id')) {
      await knex.schema.alterTable('employees', (t) => {
        t.dropForeign('custom_role_id', FK_NAME)
      })
    }
    if (await knex.schema.hasColumn('employees', 'custom_role_id')) {
      await knex.schema.alterTable('employees', (t) => {
        t.dropColumn('custom_role_id')
      })
    }
  }

  if (await knex.schema.hasTable('custom_role_permissions')) {
    await knex.schema.dropTable('custom_role_permissions')
  }
  if (await knex.schema.hasTable('custom_roles')) {
    await knex.schema.dropTable('custom_roles')
  }
  if (await knex.schema.hasTable('feature_flags')) {
    await knex('feature_flags').where({ key: 'custom_roles' }).del()
  }
}
