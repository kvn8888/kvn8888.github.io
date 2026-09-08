import { collectionContext, collectionFailure, collectionResponse, collectionId, collectionVersion } from '@/lib/jobCollectionHttp'
import { CollectionError, getCollection, patchCollection, readCollectionBody, validateCollection } from '@/lib/jobCollection'

type Context = { params: Promise<{ id: string }> }
export async function GET(request: Request, context: Context) {
  try {
    const { db } = await collectionContext(request)
    const row = await getCollection(db, collectionId((await context.params).id))
    if (!row) throw new CollectionError('Collection job not found', 404)
    return collectionResponse(row)
  } catch (error) { return collectionFailure(error) }
}
export async function PATCH(request: Request, context: Context) {
  try {
    const { db, actor } = await collectionContext(request)
    const id = collectionId((await context.params).id)
    const version = collectionVersion(request)
    const patch = validateCollection(await readCollectionBody(request), true)
    return collectionResponse(await patchCollection(db, id, patch, version, actor))
  } catch (error) { return collectionFailure(error) }
}
