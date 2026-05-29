# @notelab/gmail-connector

Read-only Gmail connector primitives for Notelab.

This package is intentionally app-agnostic so it can be used from the Notelab
backend today and published as an npm package later.

## Scope

- OAuth URL and token exchange helpers
- Gmail profile, message, and thread reads
- Message header/body extraction helpers
- Google Workspace hosted-domain eligibility helpers

The connector does not send, modify, trash, delete, label, or draft email.
