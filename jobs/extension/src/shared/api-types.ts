export interface paths {
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
        resolve: {
            version: number;
            /** @enum {string} */
            action: "retry" | "resolved" | "dismiss";
            notes: string;
            /** @description Arbitrary JSON value; transport accepts JSON only */
            resolution?: unknown;
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
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
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
