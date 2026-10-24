// Публичная база знаний (/kb): маршруты server/src/routes/public-kb.js фильтруют
// статьи по published / deleted_at / slug и отдают поля votes, а в wiki_articles
// этих колонок не было ни в схеме prisma, ни в миграциях — на живой БД все чтения
// отдавали 500 (GET /api/kb/articles, /categories, /search, /articles/:slug).
// Голосование создавало таблицу article_votes запросом в рантайме
// (CREATE TABLE IF NOT EXISTS в обработчике) и глотало ошибку — теперь таблица
// создаётся здесь. Миграция идемпотентна: на базе, где часть колонок уже есть,
// она добавляет только недостающие.
export async function up(knex) {
  const dbName = knex.client.config.connection.database

  const hasColumn = async (table, column) => {
    const rows = await knex('information_schema.columns')
      .where({ table_schema: dbName, table_name: table, column_name: column })
      .select('column_name as cn')
    return rows.length > 0
  }

  const hasIndex = async (table, indexName) => {
    const rows = await knex('information_schema.statistics')
      .where({ table_schema: dbName, table_name: table, index_name: indexName })
      .select('index_name as ix')
    return rows.length > 0
  }

  const columns = [
    ['slug', 'ALTER TABLE `wiki_articles` ADD COLUMN `slug` VARCHAR(255) NULL'],
    ['published', 'ALTER TABLE `wiki_articles` ADD COLUMN `published` TINYINT(1) NOT NULL DEFAULT 0'],
    ['deleted_at', 'ALTER TABLE `wiki_articles` ADD COLUMN `deleted_at` DATETIME NULL'],
  ]

  for (const [column, sql] of columns) {
    if (!(await hasColumn('wiki_articles', column))) await knex.raw(sql)
  }

  if (!(await hasIndex('wiki_articles', 'uq_wiki_article_slug'))) {
    await knex.raw('ALTER TABLE `wiki_articles` ADD UNIQUE KEY `uq_wiki_article_slug` (`slug`)')
  }
  if (!(await hasIndex('wiki_articles', 'idx_wiki_published'))) {
    await knex.raw('ALTER TABLE `wiki_articles` ADD KEY `idx_wiki_published` (`published`, `deleted_at`)')
  }

  if (!(await knex.schema.hasTable('article_votes'))) {
    await knex.schema.createTable('article_votes', (table) => {
      table.increments('id')
      table.integer('article_id').unsigned().notNullable()
      table.string('vote_type', 10).notNullable()
      table.string('ip_address', 45).nullable()
      table.timestamp('created_at').defaultTo(knex.fn.now())
      table.index(['article_id'], 'idx_article_votes_article')
    })
    await knex.raw(
      'ALTER TABLE `article_votes` ADD CONSTRAINT `fk_article_votes_article` ' +
        'FOREIGN KEY (`article_id`) REFERENCES `wiki_articles`(`id`) ON DELETE CASCADE',
    )
  }
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('article_votes')
  const drop = [
    ['idx_wiki_published', 'ALTER TABLE `wiki_articles` DROP KEY `idx_wiki_published`'],
    ['uq_wiki_article_slug', 'ALTER TABLE `wiki_articles` DROP KEY `uq_wiki_article_slug`'],
    ['deleted_at', 'ALTER TABLE `wiki_articles` DROP COLUMN `deleted_at`'],
    ['published', 'ALTER TABLE `wiki_articles` DROP COLUMN `published`'],
    ['slug', 'ALTER TABLE `wiki_articles` DROP COLUMN `slug`'],
  ]
  const dbName = knex.client.config.connection.database
  for (const [name, sql] of drop) {
    const rows = await knex('information_schema.columns')
      .where({ table_schema: dbName, table_name: 'wiki_articles', column_name: name })
      .select('column_name as cn')
    const indexRows = await knex('information_schema.statistics')
      .where({ table_schema: dbName, table_name: 'wiki_articles', index_name: name })
      .select('index_name as ix')
    if (rows.length > 0 || indexRows.length > 0) await knex.raw(sql)
  }
}
