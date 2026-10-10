# Media deletion workflow

Applies to the permanent-deletion application switch. Existing-profile rollout remains pending; see [recovery](deletion-recovery.md).

1. A live ADMIN requests `GET /api/v1/admin/media/assets/{id}/deletion-impact`. Media obtains Catalog's current reference impact and binds its fingerprint to the actual Media asset version. SUPER_ADMIN has no content authority.
2. The confirmed DELETE requires `expectedVersion`, `impactRevision` and `confirmed: true`, plus the approved Origin and session CSRF token. Media atomically reserves its asset and writes `media.deletion.requested.v1`. A 202 response means durable acceptance, not completed file cleanup.
3. Catalog consumes that request in its own transaction, rechecks dependencies, removes gallery/cover references, unpublishes a Product losing its cover and writes `catalog.media.delete.requested.v1`. A changed impact instead produces `catalog.media.delete.rejected.v1`; Media releases its reservation and records `DELETE_IMPACT_CHANGED`.
4. Media records pending cleanup, takes the exclusive asset storage lock, removes `originals/{asset}`, all `outputs/{asset}` generations, `quarantine/{asset}` and every associated `staging/{upload-session}` namespace. It then removes variants, processing jobs, upload sessions and the asset. All normal API/worker writes must use the shared-lock storage adapter.
5. Media commits `media.delete.completed.v1` with its operation completion. Catalog consumes the result and removes its asset registration. Product/Category initiated deletion uses the same cleanup events, then finalizes owned rows after the result.

Check `GET /api/v1/admin/media/deletion-operations/{operationId}` for direct Media requests and `GET /api/v1/admin/products/deletion-operations/{operationId}` for Catalog requests. The dashboard provides links to recent operation IDs from this browser. Keep the ID when closing a dialog.

`MEDIA_CLEANUP` means work remains; `RETRYABLE` with `MEDIA_DELETE_FAILED` means the accepted event will retry. `RETRYABLE` with `DELETE_IMPACT_CHANGED` is a rejected direct request: review current impact and confirm a new command. `COMPLETED` means the owning cleanup has committed. A Media completion can precede Catalog's final result consumption briefly; verify both sides when investigating recovery.

The S3 runtime needs list/read/write for its private objects, `ListBucketVersions` and deletion of object versions/delete markers. Use a private bucket and scope permissions to the configured namespaces. Object lock, legal hold or provider retention can prevent physical removal; resolve that policy and replay the accepted request. Previously issued capabilities stop working when their objects/versions disappear; an already downloaded file cannot be recalled.
