# 013 — Independent choice-option drafts

Date: 2026-10-07.

The configuration screen reused the parent attribute's code state when adding options and retained the last submitted code between additions. Duplicate option codes produce Catalog `CONFLICT`, but the shared HTTP 409 feedback described a version conflict. A new option has no existing version to reload.

Use a focused option-creation component with its own code, translations and mutation state. Successful saves clear this draft; closing the dialog preserves it. The parent attribute draft remains independent. Option labels omit description fields because the existing option contract accepts labels only. Submit existing Catalog APIs, preserve exact bigint ordering and append new options after the currently loaded option order. At the bigint upper bound, reuse the last order; the existing contract permits tied orders. No atomic batch API or database migration is introduced.

Check visible duplicate codes before submission, and also handle owning-service `CONFLICT` because concurrent additions or retained soft-deleted codes can still collide. Show a specific duplicate-code message without replacing version checks on reviewed updates. Code uniqueness remains authoritative in Catalog. Guidance is translated into English, Arabic and Sorani.

Verification exercises consecutive additions, a duplicate draft, closing/reopening that draft, parent-draft retention, reviewed option editing/deletion and assignment of three translated choices through real services and disposable PostgreSQL databases.
