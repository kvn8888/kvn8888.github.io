import { NextResponse } from 'next/server'
import { getJobsIdentity } from '@/lib/jobsRequestAuth'
import { getJobsDb } from '@/lib/jobsDb'
import { AtsAccountsError, deleteAtsAccount, getAtsAccount, patchAtsAccount, readAtsAccountBody } from '@/lib/atsAccounts'

type Context = { params: Promise<{ id: string }> }

function failure(error: unknown) {
  return NextResponse.json({ error: error instanceof AtsAccountsError ? error.message : 'Account request failed' }, {
    status: error instanceof AtsAccountsError ? error.status : 500,
  })
}

export async function GET(request: Request, context: Context) {
  try {
    const actor = await getJobsIdentity(request)
    if (!actor) throw new AtsAccountsError('Unauthorized', 401)
    const row = await getAtsAccount(await getJobsDb(), (await context.params).id)
    if (!row) throw new AtsAccountsError('Account not found', 404)
    return NextResponse.json(row, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return failure(error) }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const actor = await getJobsIdentity(request)
    if (!actor) throw new AtsAccountsError('Unauthorized', 401)
    const body = await readAtsAccountBody(request)
    if (actor === 'tracker-reader') throw new AtsAccountsError('Read-only access', 403)
    const row = await patchAtsAccount(await getJobsDb(), (await context.params).id, body.version, body)
    return NextResponse.json(row, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return failure(error) }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const actor = await getJobsIdentity(request)
    if (!actor) throw new AtsAccountsError('Unauthorized', 401)
    if (request.body !== null) await readAtsAccountBody(request)
    if (actor === 'tracker-reader') throw new AtsAccountsError('Read-only access', 403)
    const version = new URL(request.url).searchParams.get('version')
    if (!version || !/^[1-9]\d*$/.test(version)) throw new AtsAccountsError('A positive integer version is required')
    await deleteAtsAccount(await getJobsDb(), (await context.params).id, Number(version))
    return new NextResponse(null, { status: 204 })
  } catch (error) { return failure(error) }
}
