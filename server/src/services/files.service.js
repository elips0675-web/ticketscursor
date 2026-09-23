import prisma from '../prisma.js'

function mapFile(f) {
  return {
    id: f.id, name: f.name, size: f.size, type: f.type,
    folderId: f.folder_id, path: f.path, createdAt: f.created_at,
  }
}

export async function getFolders(userId, page, limit) {
  const offset = (page - 1) * limit
  const folders = await prisma.file_folders.findMany({
    where: {
      OR: [
        { user_id: userId },
        { is_shared: true },
      ],
    },
    include: {
      files: {
        where: { deleted_at: null },
        orderBy: { created_at: 'desc' }, take: limit, skip: offset,
      },
      _count: {
        select: { files: { where: { deleted_at: null } } },
      },
    },
    orderBy: { name: 'asc' },
  })
  for (const f of folders) {
    f.files = f.files.map(mapFile)
    f.totalFiles = f._count.files
  }
  return folders
}

export async function createFolder(name, userId) {
  return prisma.file_folders.create({ data: { name, user_id: userId } })
}

export async function createFile({ name, size, type, folderId, path, userId }) {
  return prisma.files.create({
    data: { name, size, type, folder_id: folderId || null, path, user_id: userId },
  })
}

export async function deleteFile(id) {
  await prisma.files.update({
    where: { id: Number(id) },
    data: { deleted_at: new Date() },
  })
}
