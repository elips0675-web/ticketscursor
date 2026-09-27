// Этап 65 (подзадача 1): версионирование Wiki — таблица wiki_revisions (diff + rollback),
// флаг «wiki_versioning» (дефолт — OFF, правило «фича = флаг»).
// Idempotent: таблица и флаг создаются только если их ещё нет.
export async function up(knex) {
  const exists = await knex.schema.hasTable('wiki_revisions')
  if (!exists) {
    // MySQL FK требует совпадения знака id: новая тестовая БД — unsigned, legacy dev-БД — signed.
    let referencedUnsigned = true
    try {
      const rows = await knex('information_schema.columns')
        .where({
          table_schema: knex.client.config.connection.database,
          table_name: 'wiki_articles',
          column_name: 'id',
        })
        .select('column_type as ct')
      referencedUnsigned = rows[0] ? String(rows[0].ct).includes('unsigned') : true
    } catch {
      /* keep default unsigned */
    }
    await knex.schema.createTable('wiki_revisions', (table) => {
      table.increments('id')
      if (referencedUnsigned) {
        table.integer('article_id').unsigned().notNullable()
      } else {
        table.integer('article_id').notNullable()
      }
      table.integer('revision').notNullable()
      table.string('title', 300).notNullable()
      table.text('content').notNullable()
      table.string('category', 100).defaultTo('Другое')
      table.json('tags')
      table.integer('author_id').unsigned()
      table.string('author_name', 255)
      table.timestamp('created_at').defaultTo(knex.fn.now())
      table.foreign('article_id').references('wiki_articles.id').onDelete('CASCADE')
      table.unique(['article_id', 'revision'])
    })
  }
  const ff = await knex.schema.hasTable('feature_flags')
  if (ff) {
    const row = await knex('feature_flags').where({ key: 'wiki_versioning' }).first()
    if (!row) {
      await knex('feature_flags').insert({
        key: 'wiki_versioning',
        enabled: false,
        description: 'Версионирование Wiki: история правок, diff и откат к ревизии',
      })
    }
  }
}

export async function down(knex) {
  await knex('feature_flags').where({ key: 'wiki_versioning' }).del()
  await knex.schema.dropTableIfExists('wiki_revisions')
}