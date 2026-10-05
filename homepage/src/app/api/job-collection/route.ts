import { observeJobRequest } from '@/lib/jobObservability'
import { NextResponse } from 'next/server'
import { collectionContext, collectionFailure, collectionResponse } from '@/lib/jobCollectionHttp'
import { createCollection, listCollection, readCollectionBody, validateCollection } from '@/lib/jobCollection'

export async function GET(request: Request) {
  try {
    const { db } = await collectionContext(request)
    return NextResponse.json(await listCollection(db, new URL(request.url).searchParams), { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return collectionFailure(error) }
}
async function post(request: Request) {
  try {
    const { db, actor } = await collectionContext(request)
    const input = validateCollection(await readCollectionBody(request))
    const { row, created } = await createCollection(db, input, actor)
    return collectionResponse(row, created ? 201 : 200, { created, existing: !created })
  } catch (error) { return collectionFailure(error) }
}

export const POST=(request:Request)=>observeJobRequest(request,()=>post(request))
