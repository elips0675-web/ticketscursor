import { PrismaClient } from '@prisma/client'

const replicaUrl = process.env.REPLICA_DATABASE_URL

const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL,
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  ...(replicaUrl
    ? {
        replicas: [{ url: replicaUrl }],
      }
    : {}),
})

export default prisma
