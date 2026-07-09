import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import fs from 'fs'
import path from 'path'
import logger from './logger.js'

const S3_ENABLED = !!(process.env.S3_ENDPOINT && process.env.S3_BUCKET)
const S3_REGION = process.env.S3_REGION || 'us-east-1'

let s3Client = null
if (S3_ENABLED) {
  s3Client = new S3Client({
    region: S3_REGION,
    endpoint: process.env.S3_ENDPOINT,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY || 'minioadmin',
      secretAccessKey: process.env.S3_SECRET_KEY || 'minioadmin',
    },
  })
}

const LOCAL_UPLOADS_DIR = process.env.UPLOADS_DIR
  || path.join(import.meta.dirname, '..', 'uploads')

function getLocalPath(subfolder, filename) {
  const dir = path.join(LOCAL_UPLOADS_DIR, subfolder)
  fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, filename)
}

export async function saveFile(subfolder, filename, buffer) {
  if (S3_ENABLED) {
    const key = `${subfolder}/${filename}`
    await s3Client.send(new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: key,
      Body: buffer,
    }))
    return { url: key, storage: 's3' }
  }
  const filePath = getLocalPath(subfolder, filename)
  fs.writeFileSync(filePath, buffer)
  return { url: `/uploads/${subfolder}/${filename}`, storage: 'local' }
}

export async function getFileUrl(subfolder, filename) {
  if (S3_ENABLED) {
    const key = `${subfolder}/${filename}`
    return getSignedUrl(s3Client, new GetObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: key,
    }), { expiresIn: 3600 })
  }
  return `/uploads/${subfolder}/${filename}`
}

export async function deleteFile(subfolder, filename) {
  if (S3_ENABLED) {
    const key = `${subfolder}/${filename}`
    await s3Client.send(new DeleteObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: key,
    }))
    return
  }
  const filePath = getLocalPath(subfolder, filename)
  try { fs.unlinkSync(filePath) } catch { /* ignore */ }
}

export { S3_ENABLED }
