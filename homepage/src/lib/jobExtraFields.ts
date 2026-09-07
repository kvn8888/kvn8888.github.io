/** Optional agent-result fields. Names are fixed here, never taken from request SQL. */
export const jobExtraTextLimits = {
  status: 2000,
  application_url: 2000,
  external_id: 2000,
  agent_model: 2000,
  started_at: 2000,
  completed_at: 2000,
  submitted_at: 2000,
  blocker: 50000,
  evidence_refs: 50000,
  other_details: 1000000,
} as const
export const jobExtraTextFields = Object.keys(jobExtraTextLimits) as (keyof typeof jobExtraTextLimits)[]
export const jobExtraFields = [...jobExtraTextFields, 'duration_seconds'] as const
export const jobSummaryExtraFields = jobExtraFields.filter(field => !['other_details', 'evidence_refs'].includes(field))
