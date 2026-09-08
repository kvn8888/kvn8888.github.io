import { NextResponse } from 'next/server'
import { getJobsIdentity } from './jobsRequestAuth'
import { getJobsDb } from './jobsDb'
import { ensureCollectionSchema } from './jobCollectionSchema'
import { CollectionError, decodeCollection, uuidPattern } from './jobCollection'

export async function collectionContext(request: Request) {
  const actor = await getJobsIdentity(request)
  if (!actor) throw new CollectionError('Unauthorized', 401)
  const db = await getJobsDb()
  await ensureCollectionSchema(db)
  return { db, actor }
}
export function collectionId(id: string) {
  if (!uuidPattern.test(id)) throw new CollectionError('Collection id must be a UUID')
  return id
}
export function collectionVersion(request: Request) {
  const header = request.headers.get('if-match')
  if (!header) throw new CollectionError('If-Match header with the current version is required', 428)
  const match = /^"([1-9]\d*)"$/.exec(header)
  if (!match || !Number.isSafeInteger(Number(match[1]))) throw new CollectionError('If-Match must be a quoted version number, for example "1"')
  return Number(match[1])
}
export function collectionResponse(row: Record<string,string|number|null>, status = 200, extra: Record<string,unknown> = {}) {
  return NextResponse.json({ job: decodeCollection(row), ...extra }, { status, headers: { ETag: `"${row.version}"`, 'Cache-Control': 'no-store' } })
}
export function collectionFailure(error: unknown) {
  if (error instanceof CollectionError) return NextResponse.json({ error: error.message, ...(error.details ? { details: error.details } : {}) }, { status: error.status })
  console.error('Collection API failed', error)
  return NextResponse.json({ error: 'Collection request failed' }, { status: 500 })
}
