import { NextResponse } from 'next/server'
import { collectionContext, collectionFailure } from '@/lib/jobCollectionHttp'
import { listCollection } from '@/lib/jobCollection'

export async function GET(request: Request) {
  try {
    const { db } = await collectionContext(request)
    return NextResponse.json(await listCollection(db, new URL(request.url).searchParams, true), { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return collectionFailure(error) }
}
