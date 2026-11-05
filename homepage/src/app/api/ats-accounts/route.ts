import { NextResponse } from 'next/server'
import { getJobsIdentity } from '@/lib/jobsRequestAuth'
import { getJobsDb } from '@/lib/jobsDb'
import { AtsAccountsError, listAtsAccounts, readAtsAccountBody, upsertAtsAccount } from '@/lib/atsAccounts'

function failure(error: unknown) {
  return NextResponse.json({ error: error instanceof AtsAccountsError ? error.message : 'Account request failed' }, {
    status: error instanceof AtsAccountsError ? error.status : 500,
  })
}

export async function GET(request: Request) {
  try {
    const actor = await getJobsIdentity(request)
    if (!actor) throw new AtsAccountsError('Unauthorized', 401)
    const query = new URL(request.url).searchParams
    const items = await listAtsAccounts(await getJobsDb(), {
      provider: query.get('provider') ?? undefined,
      tenant: query.get('tenant') ?? undefined,
      status: query.get('status') ?? undefined,
    })
    return NextResponse.json({ items }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return failure(error) }
}

export async function POST(request: Request) {
  try {
    const actor = await getJobsIdentity(request)
    if (!actor) throw new AtsAccountsError('Unauthorized', 401)
    const body = await readAtsAccountBody(request)
    if (actor === 'tracker-reader') throw new AtsAccountsError('Read-only access', 403)
    const { row, created } = await upsertAtsAccount(await getJobsDb(), body)
    return NextResponse.json(row, { status: created ? 201 : 200, headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return failure(error) }
}
