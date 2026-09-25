export const legacyWorkflowGuide={
 version:1,
 base_url:'https://www.kevinc.dev',
 authentication:'Authorization: Bearer <existing JOBS_API_KEY>. No Turso token is needed.',
 reads:{connection:'/api/job-workflow/connection',opportunities:'/api/job-collection?status=pending&limit=20',job_history:'/api/job-workflow/jobs/{collection_id}',capture:'/api/job-workflow/captures/{capture_id}',blockers:'/api/job-workflow/blockers?status=open&reason_code=captcha',attempts:'/api/job-workflow/attempts?collection_id={uuid}',metrics:'/api/job-workflow/metrics',application:'/api/jobs/{numeric_id}'},
 writes:{
  claim:{method:'POST',path:'/api/job-workflow/attempts',body:{id:'stable client-generated UUID',collection_id:'canonical collection UUID',version:'current job.version number',claim_token:'stable random secret string, at least 32 characters',worker_id:'your worker/run name',agent_model:'actual model, optional',parent_attempt_id:'optional finished parent attempt',manual:'true only for user-directed manual handoff'}},
  heartbeat:{method:'POST',path:'/api/job-workflow/attempts/{id}/heartbeat',body:{claim_token:'original token',stage:'filling | submit_started | receipt_seen'}},
  outcome:{method:'POST',path:'/api/job-workflow/attempts/{id}/outcome',body:{claim_token:'original token',outcome:'blocked | skipped | failed | cancelled | submission_unknown',reason_code:'captcha, mfa, unanswered_question, site_error, rate_limited, or another concise reason',notes:'required explanation',details:'optional JSON object, including unresolved questions',evidence:'optional references array',duration_seconds:'optional measured duration, null if unknown',duration_scope:'what the measured duration includes'}},
  capture:{method:'POST',path:'/api/job-workflow/captures',body:{id:'stable capture-revision UUID',capture_session_id:'stable session UUID',revision:'positive integer',collection_id:'canonical job UUID',attempt_id:'optional attempt UUID',state:'draft | finished | imported',captured_at:'ISO timestamp with timezone',document:'JSON object; pages[].fields[] should include label, exact answer, control_type, field_id and answer_state'}},
  complete:{method:'POST',path:'/api/job-workflow/attempts/{id}/complete',body:{claim_token:'original token',confirmed:true,confirmation_kind:'ats_receipt | user_confirmed',submitted_at:'actual ISO submission timestamp',capture_id:'optional saved capture UUID',resolve_blocker_ids:'optional array of blockers explicitly resolved by this submission',existing_application_id:'optional existing tracker ID to link instead of inserting',job:'optional company/role/description/type/source/location/work_mode/application_url corrections',evidence:'optional receipt references'}},
  resolve:{method:'POST',path:'/api/job-workflow/blockers/{id}/resolve',body:{version:'current blocker version',action:'retry | resolved | dismiss',notes:'required explanation',resolution:'optional JSON including answers supplied by the human'}},
  recover:{method:'POST',path:'/api/job-workflow/attempts/{id}/recover',body:{version:'current attempt version; only expired running attempts can be recovered'}}
 },
 rules:[
  'Create or find an opportunity through the existing collection API. Keep its returned canonical ID and version.',
  'Claim before acting. Renew the five-minute lease approximately every minute. Do not proceed after losing ownership.',
  'Mark submit_started immediately before an employer Submit action. A crash after this stage must be reconciled as submission_unknown, never blindly retried.',
  'Completion records a confirmed employer submission; it does not submit to the employer. Do not also POST /api/jobs for the same completion.',
  'Preserve the exact IDs, tokens, and payloads across HTTP retries. After completion GET /api/jobs/{returned application_id} and the opportunity history to verify.',
  'Completion creates/links one tracker record per opportunity by default. Intentional reapplication is not supported by this initial-cycle workflow.',
  'Past blocked attempts are retained. Resolving/retrying a blocker does not count as a submission.',
  'Save blockers/questions and capture checkpoints through the API; local SQLite-only changes do not appear in the portal.',
  'Do not store passwords, security tokens, CAPTCHA/MFA codes, or file contents in captures. Evidence paths remain local references unless uploaded separately.',
  'Legacy /api/jobs and /api/job-collection contracts remain available. Status changes on opportunities with new attempt history must use the workflow endpoints.',
  'Existing Pi history has not been bulk imported. Audit and reconcile source IDs, tracker IDs, and ambiguous duplicates before backfilling.'
 ]
}
