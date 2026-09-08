/** Legacy tracker entries predate status and were recorded as applications.
 * Explicit statuses must indicate submission; timestamps alone are not proof.
 */
export const appliedJobsPredicate = "(status IS NULL OR TRIM(status) = '' OR LOWER(TRIM(status)) IN ('submitted', 'applied'))"
