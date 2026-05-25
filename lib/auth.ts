import { adminAuth } from './firebase-admin'
import type { NextRequest } from 'next/server'

export async function verifyAuth(request: NextRequest) {
  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) return null
  const token = authorization.split('Bearer ')[1]
  try {
    return await adminAuth.verifyIdToken(token)
  } catch {
    return null
  }
}
