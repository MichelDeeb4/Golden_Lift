# Neutral platform identity

Date: 2026-10-10. Accepted for the user-authorized rename.

The project identity was embedded in workspace imports, shared UI symbols, runtime credentials and durable message topology. Business Platform is the shared software identity; it is not a tenant. The target description is Multi-Tenant ERP and E-Commerce Platform; this rename implements no multi-tenancy or additional ERP modules.

A complete pre-production switch to @business-platform/* and BP/bp UI symbols was chosen over compatibility aliases. Package/service boundaries remain unchanged. Cookie and browser namespaces change together; existing development sessions and preferences reset, without weakening cookie flags or deleting browser data.

New infrastructure uses business_platform_ roles/databases and business-platform.media.* durable topology. Installed databases and owning roles are renamed with ALTER and OID checks, archived backups, live-client refusal and a resumable journal. No schema rebuild or media object movement is needed. The existing privileged bootstrap cluster administrator remains cluster provenance; new clusters use business_platform_local_admin. The exact old schema marker and UUID migration namespace are retained solely for historical compatibility.

Rabbit producers/consumers share the same adapter. Before asserting the new topology, the adapter refuses legacy queues with messages or consumers, including dead letters; a broker failure fails closed. Operators must pause old publishers and drain all queues before starting renamed relays. Legacy queues are never automatically deleted. Dedicated hosted broker/provider acceptance remains separate from local validation.

SQL migrations, prior decisions, validation evidence and the preceding tenancy audit retain their original names. Current operating guides and application descriptions use the new identity. See the [implementation and verification report](../implementation/01-business-platform-rename.md).

The procedure follows PostgreSQL [database rename](https://www.postgresql.org/docs/18/sql-alterdatabase.html) and [role rename](https://www.postgresql.org/docs/18/sql-alterrole.html) semantics; SCRAM is required to avoid the documented MD5 password invalidation on role rename.
