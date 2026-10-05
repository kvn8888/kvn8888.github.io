export interface paths {
    "/api/job-workflow/events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read technical workflow events through configured Axiom query access, or identify runtime-log fallback */
        get: operations["readWorkflowEvents"];
        put?: never;
        /** Record bounded technical client events; no page content, answers, URLs or credentials */
        post: operations["recordClientEvents"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/job-workflow/discovery": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Public workflow discovery */
        get: operations["public_discovery"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/job-workflow/openapi.json": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Public workflow openapi.json */
        get: operations["public_openapi_json"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/job-workflow/guide": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Public workflow guide */
        get: operations["public_guide"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/job-workflow/changes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Public workflow changes */
        get: operations["public_changes"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/job-workflow/releases": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Public workflow releases */
        get: operations["public_releases"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/jobs/parse": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Website-only job posting extraction */
        post: operations["parseJobPosting"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/jobs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read application summaries; site uses view=applied */
        get: operations["listApplications"];
        put?: never;
        /**
         * Compatibility insert; do not also use workflow completion for the same submission
         * @deprecated
         */
        post: operations["createLegacyApplication"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/jobs/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read full application */
        get: operations["getApplication"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Correct application metadata */
        patch: operations["updateApplication"];
        trace?: never;
    };
    "/api/jobs/stats": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Submitted application statistics for the website */
        get: operations["applicationStats"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/job-collection": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Search opportunities without deleting consumed rows */
        get: operations["listOpportunities"];
        put?: never;
        /** Create or find a canonical opportunity */
        post: operations["collectOpportunity"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/job-collection/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read full opportunity and version */
        get: operations["getOpportunity"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Version-checked enrichment; use workflow endpoints for attempted opportunities */
        patch: operations["enrichOpportunity"];
        trace?: never;
    };
    "/api/job-collection/export": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Export paginated opportunity URLs */
        get: operations["exportOpportunityUrls"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/job-workflow/connection": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Check credential access */
        get: operations["connection"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/job-workflow/contract": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Legacy machine-readable integration guide */
        get: operations["contract"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/job-workflow/metrics": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Workflow activity and confirmed submission metrics */
        get: operations["metrics"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/job-workflow/jobs/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Opportunity attempts, blockers and immutable capture revisions */
        get: operations["history"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/job-workflow/attempts/{id}/handoff": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Atomically save page packets, finish the owned agent attempt and queue a human blocker; never creates an application */
        post: operations["queueHandoff"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/job-workflow/handoffs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Human action queue without answer payloads */
        get: operations["listHandoffs"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/job-workflow/handoffs/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read a queued handoff and its page packets */
        get: operations["getHandoff"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/job-workflow/handoffs/{id}/claim": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Start a new manually controlled attempt with exclusive lease */
        post: operations["claimHandoff"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/job-workflow/jobs/{id}/availability": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Mark an expired posting with evidence; preserve prior submissions, close owned pre-submit work and prevent new claims */
        post: operations["markExpired"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/job-workflow/captures/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read exact captured answers */
        get: operations["getCapture"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/job-workflow/attempts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read attempts */
        get: operations["listAttempts"];
        put?: never;
        /** Claim an opportunity with a five-minute lease */
        post: operations["claim"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/job-workflow/blockers": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read blockers needing attention */
        get: operations["listBlockers"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/job-workflow/attempts/{id}/heartbeat": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Renew an owned lease; mark submit_started before employer submission */
        post: operations["heartbeat"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/job-workflow/attempts/{id}/recover": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Recover an expired attempt without blindly resubmitting */
        post: operations["recover"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/job-workflow/attempts/{id}/outcome": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Record a non-submitted outcome and retain history */
        post: operations["outcome"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/job-workflow/captures": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Save an immutable answer capture revision */
        post: operations["capture"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/job-workflow/attempts/{id}/complete": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Record confirmed submission and atomically create/link one application */
        post: operations["complete"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/job-workflow/blockers/{id}/resolve": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Resolve selected blockers with explicit human input */
        post: operations["resolve"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        clientEvents: {
            /** Format: uuid */
            client_id: string;
            client_version: string;
            events: {
                /** Format: uuid */
                id: string;
                /** Format: date-time */
                at: string;
                /** Format: uuid */
                trace_id: string;
                /** @enum {string} */
                name: "worker_started" | "scan_finished" | "scan_failed" | "sync_succeeded" | "sync_failed" | "site_mode" | "destination_saved";
                /** @enum {string} */
                source?: "jobright" | "handshake" | "linkedin" | "symplicity" | "other";
                /** @enum {string} */
                mode?: "auto" | "manual" | "paused";
                /** @enum {string} */
                operation?: "job" | "capture" | "application";
                found?: number;
                queued?: number;
                skipped?: number;
                queue_depth?: number;
                duration_ms?: number;
                http_status?: number;
                /** @enum {string} */
                error_code?: "unauthorized" | "forbidden" | "invalid_input" | "conflict" | "rate_limited" | "unavailable" | "network" | "timeout" | "context_invalidated" | "unknown";
            }[];
            dropped?: number;
        };
        parse: {
            text: string;
        } & {
            [key: string]: unknown;
        };
        applicationCreate: {
            company: string;
            role: string;
            description?: string | null;
            date?: string | null;
            source?: string | null;
            type?: string | null;
            cover_letter?: string | null;
            resume_type?: string | null;
            location?: string | null;
            work_mode?: string | null;
            status?: string | null;
            application_url?: string | null;
            external_id?: string | null;
            agent_model?: string | null;
            started_at?: string | null;
            completed_at?: string | null;
            submitted_at?: string | null;
            duration_seconds?: number | null;
            blocker?: string | null;
            evidence_refs?: string | null;
            other_details?: string | null;
        };
        applicationPatch: {
            company?: string;
            role?: string;
            description?: string | null;
            date?: string | null;
            source?: string | null;
            type?: string | null;
            cover_letter?: string | null;
            resume_type?: string | null;
            location?: string | null;
            work_mode?: string | null;
            status?: string | null;
            application_url?: string | null;
            external_id?: string | null;
            agent_model?: string | null;
            started_at?: string | null;
            completed_at?: string | null;
            submitted_at?: string | null;
            duration_seconds?: number | null;
            blocker?: string | null;
            evidence_refs?: string | null;
            other_details?: string | null;
            interviewed?: boolean | 0 | 1;
        };
        collectionCreate: {
            id: string;
            identity_key: string;
            company?: string | null;
            role?: string | null;
            description?: string | null;
            /** @enum {string} */
            description_status?: "missing" | "partial" | "full";
            source: string;
            source_job_id?: string | null;
            source_url: string;
            application_url?: string | null;
            canonical_url?: string | null;
            ats_provider?: string | null;
            ats_tenant?: string | null;
            ats_job_id?: string | null;
            /** @enum {string} */
            resolution_status?: "unresolved" | "resolved" | "in_board" | "unavailable";
            type?: string | null;
            employment_type?: string | null;
            location?: string | null;
            work_mode?: string | null;
            posted_at?: string | null;
            posted_at_raw?: string | null;
            /** @description ISO timestamp with a timezone; validated and normalized by the service */
            first_seen_at?: string;
            /** @description ISO timestamp with a timezone; validated and normalized by the service */
            last_seen_at?: string;
            archived_at?: string | null;
            role_tags_json?: string[] | string;
            locations_json?: {
                [key: string]: unknown;
            }[] | string;
            sources_json?: {
                [key: string]: unknown;
            }[] | string;
            metadata_json?: {
                [key: string]: unknown;
            } | string;
            application_ids_json?: number[] | string;
            status?: string;
            status_notes?: string | null;
        };
        collectionPatch: {
            company?: string | null;
            role?: string | null;
            description?: string | null;
            /** @enum {string} */
            description_status?: "missing" | "partial" | "full";
            source_job_id?: string | null;
            source_url?: string;
            application_url?: string | null;
            canonical_url?: string | null;
            ats_provider?: string | null;
            ats_tenant?: string | null;
            ats_job_id?: string | null;
            /** @enum {string} */
            resolution_status?: "unresolved" | "resolved" | "in_board" | "unavailable";
            type?: string | null;
            employment_type?: string | null;
            location?: string | null;
            work_mode?: string | null;
            posted_at?: string | null;
            posted_at_raw?: string | null;
            /** @description ISO timestamp with a timezone; validated and normalized by the service */
            last_seen_at?: string;
            archived_at?: string | null;
            role_tags_json?: string[] | string;
            locations_json?: {
                [key: string]: unknown;
            }[] | string;
            sources_json?: {
                [key: string]: unknown;
            }[] | string;
            metadata_json?: {
                [key: string]: unknown;
            } | string;
            application_ids_json?: number[] | string;
            status?: string;
            status_notes?: string | null;
        };
        claim: {
            id: string;
            collection_id: string;
            version: number;
            /** @description Original private claim token; new claims require 32+ characters */
            claim_token: string;
            worker_id?: string | null;
            agent_model?: string | null;
            /** @description Arbitrary JSON value; transport accepts JSON only */
            parent_attempt_id?: unknown;
            /** @description Arbitrary JSON value; transport accepts JSON only */
            manual?: unknown;
            handoff_id?: string | null;
        };
        heartbeat: {
            /** @description Original private claim token; new claims require 32+ characters */
            claim_token: string;
            stage?: ("filling" | "submit_started" | "receipt_seen") | "" | 0 | false | null;
        };
        recover: {
            version: number;
        };
        outcome: {
            /** @description Original private claim token; new claims require 32+ characters */
            claim_token: string;
            /** @enum {string} */
            outcome: "blocked" | "skipped" | "failed" | "cancelled" | "submission_unknown";
            reason_code?: string | null;
            notes: string;
            /** @description Arbitrary JSON value; transport accepts JSON only */
            details?: unknown;
            /** @description Arbitrary JSON value; transport accepts JSON only */
            evidence?: unknown;
            duration_seconds?: number | null;
            duration_scope?: string | null;
        };
        capture: {
            id: string;
            capture_session_id: string;
            revision: number;
            collection_id: string;
            /** @description Arbitrary JSON value; transport accepts JSON only */
            attempt_id?: unknown;
            /** @description Arbitrary JSON value; transport accepts JSON only */
            schema_version?: unknown;
            state?: ("draft" | "finished" | "imported") | "" | false | 0 | null;
            /** @description ISO timestamp with a timezone; validated and normalized by the service */
            captured_at: string;
            document: {
                [key: string]: unknown;
            };
        };
        complete: {
            /** @description Original private claim token; new claims require 32+ characters */
            claim_token: string;
            /** @constant */
            confirmed: true;
            /** @enum {string} */
            confirmation_kind: "ats_receipt" | "user_confirmed";
            /** @description ISO timestamp with a timezone; validated and normalized by the service */
            submitted_at: string;
            capture_id?: string | null;
            existing_application_id?: number | null;
            job?: {
                company?: string | null;
                role?: string | null;
                description?: string | null;
                type?: string | null;
                source?: string | null;
                location?: string | null;
                work_mode?: string | null;
                application_url?: string | null;
            };
            resolve_blocker_ids?: string[] | null;
            /** @description Arbitrary JSON value; transport accepts JSON only */
            evidence?: unknown;
        };
        handoff: {
            id: string;
            /** @description Original private claim token; new claims require 32+ characters */
            claim_token: string;
            /** @enum {string} */
            reason_code: "captcha" | "manual_review" | "login_required" | "missing_information";
            notes: string;
            /** @description Page-scoped handoff schema 1.0 packets; validated against the shared packet schema. Never flatten different Workday steps. */
            packets: components["schemas"]["handoffPacket"][];
            gaps?: string[];
            resume_instructions?: string;
        };
        handoffClaim: {
            id: string;
            version: number;
            /** @description Original private claim token; new claims require 32+ characters */
            claim_token: string;
        };
        availability: {
            version: number;
            /** @description Original private claim token; new claims require 32+ characters */
            claim_token?: string;
            notes: string;
            evidence: {
                /** Format: uri */
                url: string;
                /** @description ISO timestamp with a timezone; validated and normalized by the service */
                observed_at: string;
                /** @enum {string} */
                signal: "expired_notice" | "employer_removed";
                excerpt: string;
            };
        };
        resolve: {
            version: number;
            /** @enum {string} */
            action: "retry" | "resolved" | "dismiss";
            notes: string;
            /** @description Arbitrary JSON value; transport accepts JSON only */
            resolution?: unknown;
        };
        clientEventsResponse: {
            accepted: number;
        };
        eventQueryResponse: {
            /** @enum {string} */
            backend: "axiom" | "server_logs";
            result?: unknown;
            note?: string;
        };
        discoveryResponse: {
            name: string;
            api_version: string;
            workflow_version: number;
            contract_hash: string;
            revision: string;
            guide_hash: string;
            deployed_commit: string | null;
            supported_clients: {
                cli: {
                    min: string;
                    max_major: number;
                };
                extension: {
                    min: string;
                    max_major: number;
                };
            };
            legacy_clients_supported: boolean;
            links: {
                openapi: string;
                guide: string;
                changes: string;
                releases: string;
                docs: string;
                workspace?: string;
            };
            latest_compatible_release: {
                version: string;
                api_version: string;
                contract_hash: string;
                source_commit: string;
                build_hash: string;
                storage_schema: number;
                /** @constant */
                verified: true;
                verified_at: string;
                artifacts: {
                    /** @enum {string} */
                    kind: "cli" | "extension" | "zip";
                    name: string;
                    /** Format: uri */
                    url: string;
                    size: number;
                    sha256: string;
                }[];
            } | null;
        };
        releasesResponse: {
            releases: {
                version: string;
                api_version: string;
                contract_hash: string;
                source_commit: string;
                build_hash: string;
                storage_schema: number;
                /** @constant */
                verified: true;
                verified_at: string;
                artifacts: {
                    /** @enum {string} */
                    kind: "cli" | "extension" | "zip";
                    name: string;
                    /** Format: uri */
                    url: string;
                    size: number;
                    sha256: string;
                }[];
            }[];
        };
        changesResponse: {
            revision: string;
            changes: {
                version: string;
                client_version: string;
                date: string;
                breaking: boolean;
                summary: string;
                required_actions: string[];
                changes: string[];
            }[];
        };
        publicDocumentResponse: {
            [key: string]: unknown;
        };
        guideResponse: string;
        parsedJobResponse: {
            company: string;
            role: string;
            type: string;
            location: string;
            work_mode: string;
            description: string;
        } & {
            [key: string]: unknown;
        };
        errorResponse: {
            error: string;
            /** @description Arbitrary JSON value; transport accepts JSON only */
            details?: unknown;
        } & {
            [key: string]: unknown;
        };
        applicationListResponse: {
            jobs: ({
                company?: string;
                role?: string;
                description?: string | null;
                date?: string | null;
                source?: string | null;
                type?: string | null;
                cover_letter?: string | null;
                resume_type?: string | null;
                location?: string | null;
                work_mode?: string | null;
                status?: string | null;
                application_url?: string | null;
                external_id?: string | null;
                agent_model?: string | null;
                started_at?: string | null;
                completed_at?: string | null;
                submitted_at?: string | null;
                duration_seconds?: number | null;
                blocker?: string | null;
                evidence_refs?: string | null;
                other_details?: string | null;
                id: number;
                interviewed: boolean;
            } & {
                [key: string]: unknown;
            })[];
            total: number;
        };
        applicationResponse: {
            job: {
                company?: string;
                role?: string;
                description?: string | null;
                date?: string | null;
                source?: string | null;
                type?: string | null;
                cover_letter?: string | null;
                resume_type?: string | null;
                location?: string | null;
                work_mode?: string | null;
                status?: string | null;
                application_url?: string | null;
                external_id?: string | null;
                agent_model?: string | null;
                started_at?: string | null;
                completed_at?: string | null;
                submitted_at?: string | null;
                duration_seconds?: number | null;
                blocker?: string | null;
                evidence_refs?: string | null;
                other_details?: string | null;
                id: number;
                interviewed: boolean;
            } & {
                [key: string]: unknown;
            };
        };
        applicationCreatedResponse: {
            id: number;
            message: string;
            replayed: boolean;
        };
        applicationUpdatedResponse: {
            message: string;
        };
        collectionListResponse: {
            jobs: ({
                id: string;
                identity_key: string;
                source: string;
                source_url: string;
                version: number;
                status: string;
            } & {
                [key: string]: unknown;
            })[];
            total: number;
            next_cursor: string | null;
        };
        collectionResponse: {
            job: {
                id: string;
                identity_key: string;
                source: string;
                source_url: string;
                version: number;
                status: string;
            } & {
                [key: string]: unknown;
            };
            created?: boolean;
            existing?: boolean;
        };
        exportedResponse: {
            jobs: ({
                id: string;
                source_url: string;
                status: string;
            } & {
                [key: string]: unknown;
            })[];
            total: number;
            next_cursor: string | null;
        };
        connectionResponse: {
            /** @constant */
            ok: true;
            workflow_version: number;
            /** @enum {string} */
            access: "read" | "write";
        };
        handoffResponse: {
            handoff: {
                id: number | string;
            } & {
                [key: string]: unknown;
            };
            replayed: boolean;
        };
        handoffDetailResponse: {
            handoff: {
                id: number | string;
            } & {
                [key: string]: unknown;
            };
            job: {
                id: string;
                identity_key: string;
                source: string;
                source_url: string;
                version: number;
                status: string;
            } & {
                [key: string]: unknown;
            };
            document: {
                [key: string]: unknown;
            };
        };
        claimResponse: {
            attempt: {
                id: string;
                collection_id: string;
                /** @enum {string} */
                state: "running" | "finished";
                stage: string;
                version: number;
                lease_expires_at: string;
            } & {
                [key: string]: unknown;
            };
            replayed?: boolean;
        } & {
            [key: string]: unknown;
        };
        heartbeatResponse: {
            attempt: {
                id: string;
                collection_id: string;
                /** @enum {string} */
                state: "running" | "finished";
                stage: string;
                version: number;
                lease_expires_at: string;
            } & {
                [key: string]: unknown;
            };
            replayed?: boolean;
        } & {
            [key: string]: unknown;
        };
        recoverResponse: {
            attempt: {
                id: string;
                collection_id: string;
                /** @enum {string} */
                state: "running" | "finished";
                stage: string;
                version: number;
                lease_expires_at: string;
            } & {
                [key: string]: unknown;
            };
            replayed?: boolean;
        } & {
            [key: string]: unknown;
        };
        outcomeResponse: {
            attempt: {
                id: string;
                collection_id: string;
                /** @enum {string} */
                state: "running" | "finished";
                stage: string;
                version: number;
                lease_expires_at: string;
            } & {
                [key: string]: unknown;
            };
            replayed?: boolean;
        } & {
            [key: string]: unknown;
        };
        captureResponse: {
            capture: {
                id: number | string;
            } & {
                [key: string]: unknown;
            };
            replayed?: boolean;
        } & {
            [key: string]: unknown;
        };
        resolveResponse: {
            blocker: {
                id: number | string;
            } & {
                [key: string]: unknown;
            };
        };
        completeResponse: {
            application_id: number;
            replayed: boolean;
        } & {
            [key: string]: unknown;
        };
        historyResponse: {
            job: {
                id: string;
                identity_key: string;
                source: string;
                source_url: string;
                version: number;
                status: string;
            } & {
                [key: string]: unknown;
            };
            attempts: ({
                id: string;
                collection_id: string;
                /** @enum {string} */
                state: "running" | "finished";
                stage: string;
                version: number;
                lease_expires_at: string;
            } & {
                [key: string]: unknown;
            })[];
            blockers: ({
                id: number | string;
            } & {
                [key: string]: unknown;
            })[];
            captures: ({
                id: number | string;
            } & {
                [key: string]: unknown;
            })[];
        };
        workflowListResponse: {
            items: ({
                id: number | string;
            } & {
                [key: string]: unknown;
            })[];
            total: number;
            offset: number;
        };
        metricsResponse: {
            timezone: string;
            today: number;
            total: number;
            legacy_date_records: number;
            daily: {
                date: string;
                count: number;
            }[];
            outcomes: {
                [key: string]: unknown;
            }[];
            open_blockers: {
                [key: string]: unknown;
            }[];
        };
        statsResponse: {
            total: number;
            today: number;
            thisWeek: number;
            thisMonth: number;
        } & {
            [key: string]: unknown;
        };
        contractResponse: {
            version: number;
            base_url: string;
            authentication: string;
            reads: {
                [key: string]: string;
            };
            writes: {
                [key: string]: {
                    [key: string]: unknown;
                };
            };
            rules: string[];
        };
        /** ATS human handoff packet */
        handoffPacket: {
            /** @constant */
            schema_version: "1.0";
            id: string;
            /** Format: date-time */
            created_at: string;
            /** Format: uri */
            application_url: string;
            /** @enum {unknown} */
            status: "captcha_blocked" | "ready_for_human" | "imported" | "submitted" | "abandoned" | "expired";
            company?: string;
            role?: string;
            /** @description greenhouse, lever, ashby, workday, smartrecruiters, rippling, pinpoint, successfactors, icims, taleo, google_forms, unknown; additional provider names allowed */
            ats?: string;
            blocker?: string;
            blocker_detail?: string;
            fields?: components["schemas"]["handoffPacket"]["$defs"]["field"][];
            profile_overlay?: {
                first?: string;
                last?: string;
                full_name?: string;
                email?: string;
                phone?: string;
                phone_formatted?: string;
                address?: string;
                address_line1?: string;
                address_line2?: string;
                city?: string;
                state?: string;
                zip?: string;
                country?: string;
                website?: string;
                linkedin?: string;
                github?: string;
                school?: string;
                degree?: string;
                major?: string;
                graduation_year?: string;
                salary?: string;
                autofill_lies_to_overwrite?: string[];
            };
            files?: {
                [key: string]: {
                    label?: string;
                    suggested_filename: string;
                    box_path?: string;
                    sha256?: string;
                };
            };
            notes?: string[];
            agent?: {
                source?: string;
                box_capture?: boolean;
            };
            evidence?: {
                screenshot_box_path?: string | null;
            };
            $defs: {
                field: ({
                    name?: string;
                    label?: string;
                    placeholder?: string;
                    selectors?: string[];
                    value: string | number | boolean | null | string[];
                    /** @enum {unknown} */
                    type?: "text" | "email" | "tel" | "textarea" | "select" | "checkbox" | "radio" | "date" | "file" | "hidden" | "other";
                    option_value?: string;
                    frame_hint?: string;
                    /** Format: uri */
                    frame_url?: string;
                    confidence?: number;
                    required?: boolean;
                } & unknown) | {
                    selectors: unknown;
                } | {
                    name: unknown;
                } | {
                    label: unknown;
                } | {
                    placeholder: unknown;
                };
            };
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    readWorkflowEvents: {
        parameters: {
            query?: {
                /** @description Exact value filter */
                client_id?: string;
                /** @description Exact value filter */
                trace_id?: string;
                /** @description Page size; values above 200 are capped at 200 */
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["eventQueryResponse"];
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Authentication required */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Access denied */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Conflict or lost lease; reconcile before retry */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Version changed; reload */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Size limit exceeded */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Version precondition required */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Server error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
        };
    };
    recordClientEvents: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["clientEvents"];
            };
        };
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["clientEventsResponse"];
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Authentication required */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Access denied */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Conflict or lost lease; reconcile before retry */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Version changed; reload */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Size limit exceeded */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Version precondition required */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Server error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
        };
    };
    public_discovery: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Public resource; supports ETag revalidation */
            200: {
                headers: {
                    ETag?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["discoveryResponse"];
                };
            };
            /** @description Not modified */
            304: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    public_openapi_json: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Public resource; supports ETag revalidation */
            200: {
                headers: {
                    ETag?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["publicDocumentResponse"];
                };
            };
            /** @description Not modified */
            304: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    public_guide: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Public resource; supports ETag revalidation */
            200: {
                headers: {
                    ETag?: string;
                    [name: string]: unknown;
                };
                content: {
                    "text/markdown": components["schemas"]["guideResponse"];
                };
            };
            /** @description Not modified */
            304: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    public_changes: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Public resource; supports ETag revalidation */
            200: {
                headers: {
                    ETag?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["changesResponse"];
                };
            };
            /** @description Not modified */
            304: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    public_releases: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Public resource; supports ETag revalidation */
            200: {
                headers: {
                    ETag?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["releasesResponse"];
                };
            };
            /** @description Not modified */
            304: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    parseJobPosting: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["parse"];
            };
        };
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["parsedJobResponse"];
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Authentication required */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Access denied */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Conflict or lost lease; reconcile before retry */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Version changed; reload */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Size limit exceeded */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Version precondition required */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Server error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
        };
    };
    listApplications: {
        parameters: {
            query?: {
                /** @description Company search (SQLite LIKE wildcards are supported by this legacy endpoint) */
                q?: string;
                /** @description Exact value filter */
                view?: "all" | "applied";
                /** @description Page size; values above 200 are capped at 200 */
                limit?: number;
                /** @description Exact value filter */
                offset?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["applicationListResponse"];
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Authentication required */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Access denied */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Conflict or lost lease; reconcile before retry */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Version changed; reload */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Size limit exceeded */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Version precondition required */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Server error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
        };
    };
    createLegacyApplication: {
        parameters: {
            query?: never;
            header?: {
                /** @description Stable per-attempt key; required for agent/extension inserts */
                "Idempotency-Key"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["applicationCreate"];
            };
        };
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["applicationCreatedResponse"];
                };
            };
            /** @description Success */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["applicationCreatedResponse"];
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Authentication required */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Access denied */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Conflict or lost lease; reconcile before retry */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Version changed; reload */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Size limit exceeded */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Version precondition required */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Server error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
        };
    };
    getApplication: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Numeric tracker ID */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["applicationResponse"];
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Authentication required */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Access denied */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Conflict or lost lease; reconcile before retry */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Version changed; reload */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Size limit exceeded */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Version precondition required */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Server error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
        };
    };
    updateApplication: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Numeric tracker ID */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["applicationPatch"];
            };
        };
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["applicationUpdatedResponse"];
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Authentication required */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Access denied */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Conflict or lost lease; reconcile before retry */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Version changed; reload */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Size limit exceeded */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Version precondition required */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Server error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
        };
    };
    applicationStats: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["statsResponse"];
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Authentication required */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Access denied */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Conflict or lost lease; reconcile before retry */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Version changed; reload */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Size limit exceeded */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Version precondition required */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Server error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
        };
    };
    listOpportunities: {
        parameters: {
            query?: {
                /** @description Literal company/role substring */
                q?: string;
                /** @description Literal substring search */
                company?: string;
                /** @description Exact value filter */
                type?: "full_stack" | "cloud" | "ai_ml" | "backend" | "frontend" | "data" | "mobile" | "embedded" | "security" | "other";
                /** @description Exact value filter */
                role_type?: "full_stack" | "cloud" | "ai_ml" | "backend" | "frontend" | "data" | "mobile" | "embedded" | "security" | "other";
                /** @description Exact value filter */
                work_mode?: "remote" | "hybrid" | "onsite";
                /** @description Literal substring search */
                location?: string;
                /** @description Exact value filter */
                source?: string;
                /** @description Exact value filter */
                employment_type?: string;
                /** @description Omit for all statuses; case is normalized */
                status?: "pending" | "in_progress" | "skipped" | "blocked" | "applied" | "not_applicable" | "N/A";
                /** @description Inclusive timestamp boundary; date-only means UTC midnight */
                collected_since?: string;
                /** @description Exclusive first-seen boundary; date-only means UTC midnight */
                collected_until?: string;
                /** @description Inclusive timestamp boundary; date-only means UTC midnight */
                updated_since?: string;
                /** @description Exact value filter */
                archived?: "false" | "true" | "all";
                /** @description Opaque next_cursor from the previous response; retain the same filters */
                cursor?: string;
                /** @description Page size, 1–100 */
                limit?: number;
                /** @description Exact value filter */
                availability?: "unknown" | "open" | "expired";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["collectionListResponse"];
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Authentication required */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Access denied */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Conflict or lost lease; reconcile before retry */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Version changed; reload */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Size limit exceeded */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Version precondition required */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Server error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
        };
    };
    collectOpportunity: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["collectionCreate"];
            };
        };
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["collectionResponse"];
                };
            };
            /** @description Success */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["collectionResponse"];
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Authentication required */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Access denied */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Conflict or lost lease; reconcile before retry */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Version changed; reload */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Size limit exceeded */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Version precondition required */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Server error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
        };
    };
    getOpportunity: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Canonical UUID */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["collectionResponse"];
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Authentication required */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Access denied */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Conflict or lost lease; reconcile before retry */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Version changed; reload */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Size limit exceeded */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Version precondition required */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Server error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
        };
    };
    enrichOpportunity: {
        parameters: {
            query?: never;
            header: {
                /** @description Quoted current row version, e.g. "3" */
                "If-Match": string;
            };
            path: {
                /** @description Canonical UUID */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["collectionPatch"];
            };
        };
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["collectionResponse"];
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Authentication required */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Access denied */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Conflict or lost lease; reconcile before retry */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Version changed; reload */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Size limit exceeded */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Version precondition required */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Server error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
        };
    };
    exportOpportunityUrls: {
        parameters: {
            query?: {
                /** @description Literal company/role substring */
                q?: string;
                /** @description Literal substring search */
                company?: string;
                /** @description Exact value filter */
                type?: "full_stack" | "cloud" | "ai_ml" | "backend" | "frontend" | "data" | "mobile" | "embedded" | "security" | "other";
                /** @description Exact value filter */
                role_type?: "full_stack" | "cloud" | "ai_ml" | "backend" | "frontend" | "data" | "mobile" | "embedded" | "security" | "other";
                /** @description Exact value filter */
                work_mode?: "remote" | "hybrid" | "onsite";
                /** @description Literal substring search */
                location?: string;
                /** @description Exact value filter */
                source?: string;
                /** @description Exact value filter */
                employment_type?: string;
                /** @description Omit for all statuses; case is normalized */
                status?: "pending" | "in_progress" | "skipped" | "blocked" | "applied" | "not_applicable" | "N/A";
                /** @description Inclusive timestamp boundary; date-only means UTC midnight */
                collected_since?: string;
                /** @description Exclusive first-seen boundary; date-only means UTC midnight */
                collected_until?: string;
                /** @description Inclusive timestamp boundary; date-only means UTC midnight */
                updated_since?: string;
                /** @description Exact value filter */
                archived?: "false" | "true" | "all";
                /** @description Opaque next_cursor from the previous response; retain the same filters */
                cursor?: string;
                /** @description Page size, 1–100 */
                limit?: number;
                /** @description Exact value filter */
                availability?: "unknown" | "open" | "expired";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["exportedResponse"];
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Authentication required */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Access denied */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Conflict or lost lease; reconcile before retry */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Version changed; reload */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Size limit exceeded */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Version precondition required */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Server error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
        };
    };
    connection: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["connectionResponse"];
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Authentication required */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Access denied */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Conflict or lost lease; reconcile before retry */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Version changed; reload */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Size limit exceeded */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Version precondition required */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Server error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
        };
    };
    contract: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["contractResponse"];
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Authentication required */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Access denied */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Conflict or lost lease; reconcile before retry */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Version changed; reload */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Size limit exceeded */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Version precondition required */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Server error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
        };
    };
    metrics: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["metricsResponse"];
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Authentication required */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Access denied */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Conflict or lost lease; reconcile before retry */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Version changed; reload */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Size limit exceeded */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Version precondition required */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Server error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
        };
    };
    history: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Canonical UUID */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["historyResponse"];
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Authentication required */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Access denied */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Conflict or lost lease; reconcile before retry */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Version changed; reload */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Size limit exceeded */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Version precondition required */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Server error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
        };
    };
    queueHandoff: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Canonical UUID */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["handoff"];
            };
        };
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["handoffResponse"];
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Authentication required */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Access denied */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Conflict or lost lease; reconcile before retry */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Version changed; reload */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Size limit exceeded */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Version precondition required */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Server error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
        };
    };
    listHandoffs: {
        parameters: {
            query?: {
                /** @description Exact value filter */
                status?: string;
                /** @description Exact value filter */
                offset?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["workflowListResponse"];
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Authentication required */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Access denied */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Conflict or lost lease; reconcile before retry */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Version changed; reload */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Size limit exceeded */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Version precondition required */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Server error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
        };
    };
    getHandoff: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Canonical UUID */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["handoffDetailResponse"];
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Authentication required */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Access denied */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Conflict or lost lease; reconcile before retry */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Version changed; reload */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Size limit exceeded */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Version precondition required */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Server error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
        };
    };
    claimHandoff: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Canonical UUID */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["handoffClaim"];
            };
        };
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["claimResponse"];
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Authentication required */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Access denied */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Conflict or lost lease; reconcile before retry */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Version changed; reload */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Size limit exceeded */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Version precondition required */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Server error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
        };
    };
    markExpired: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Canonical UUID */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["availability"];
            };
        };
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["collectionResponse"];
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Authentication required */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Access denied */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Conflict or lost lease; reconcile before retry */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Version changed; reload */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Size limit exceeded */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Version precondition required */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Server error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
        };
    };
    getCapture: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Canonical UUID */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["captureResponse"];
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Authentication required */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Access denied */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Conflict or lost lease; reconcile before retry */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Version changed; reload */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Size limit exceeded */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Version precondition required */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Server error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
        };
    };
    listAttempts: {
        parameters: {
            query?: {
                /** @description Exact value filter */
                collection_id?: string;
                /** @description Exact value filter */
                outcome?: string;
                /** @description Exact value filter */
                actor?: string;
                /** @description Exact value filter */
                offset?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["workflowListResponse"];
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Authentication required */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Access denied */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Conflict or lost lease; reconcile before retry */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Version changed; reload */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Size limit exceeded */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Version precondition required */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Server error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
        };
    };
    claim: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["claim"];
            };
        };
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["claimResponse"];
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Authentication required */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Access denied */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Conflict or lost lease; reconcile before retry */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Version changed; reload */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Size limit exceeded */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Version precondition required */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Server error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
        };
    };
    listBlockers: {
        parameters: {
            query?: {
                /** @description Exact value filter */
                collection_id?: string;
                /** @description Exact value filter */
                status?: "open" | "resolved" | "dismissed";
                /** @description Exact value filter */
                reason_code?: string;
                /** @description Exact value filter */
                offset?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["workflowListResponse"];
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Authentication required */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Access denied */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Conflict or lost lease; reconcile before retry */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Version changed; reload */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Size limit exceeded */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Version precondition required */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Server error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
        };
    };
    heartbeat: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Canonical UUID */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["heartbeat"];
            };
        };
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["heartbeatResponse"];
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Authentication required */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Access denied */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Conflict or lost lease; reconcile before retry */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Version changed; reload */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Size limit exceeded */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Version precondition required */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Server error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
        };
    };
    recover: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Canonical UUID */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["recover"];
            };
        };
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["recoverResponse"];
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Authentication required */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Access denied */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Conflict or lost lease; reconcile before retry */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Version changed; reload */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Size limit exceeded */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Version precondition required */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Server error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
        };
    };
    outcome: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Canonical UUID */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["outcome"];
            };
        };
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["outcomeResponse"];
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Authentication required */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Access denied */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Conflict or lost lease; reconcile before retry */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Version changed; reload */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Size limit exceeded */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Version precondition required */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Server error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
        };
    };
    capture: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["capture"];
            };
        };
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["captureResponse"];
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Authentication required */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Access denied */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Conflict or lost lease; reconcile before retry */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Version changed; reload */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Size limit exceeded */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Version precondition required */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Server error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
        };
    };
    complete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Canonical UUID */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["complete"];
            };
        };
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["completeResponse"];
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Authentication required */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Access denied */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Conflict or lost lease; reconcile before retry */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Version changed; reload */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Size limit exceeded */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Version precondition required */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Server error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
        };
    };
    resolve: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Canonical UUID */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["resolve"];
            };
        };
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["resolveResponse"];
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Authentication required */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Access denied */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Conflict or lost lease; reconcile before retry */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Version changed; reload */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Size limit exceeded */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Version precondition required */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
            /** @description Server error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["errorResponse"];
                };
            };
        };
    };
}
