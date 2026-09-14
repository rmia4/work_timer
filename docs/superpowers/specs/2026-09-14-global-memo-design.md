# Global Memo Design

## Scope

Add an authenticated, date-independent memo area to the unused right side of the work timer. Memo data remains unchanged when the selected work-log date changes and is synchronized across devices through D1.

## Interface

- Widen the desktop workspace and add a fixed right memo column beside the existing new-task and work-log columns.
- On narrow screens, place the memo area below the work log.
- Each memo is one block with a separate title input and body textarea.
- The title is 2px larger than the body.
- The body textarea grows vertically with its content and does not use an internal scrollbar during ordinary editing.
- Provide a new-memo button at the top and a delete button on each block.
- Show saving, saved, and failed states without blocking typing.

## Persistence and API

- Add a memos D1 table containing id, owner, title, body, position, version, created, and updated.
- Memos have no date column and are loaded independently of task records.
- Add an authenticated /api/memos route for list, create, update, and delete.
- Enforce title/body length limits and ownership on the server.
- Use version comparison for updates and deletes so stale changes from another device cannot silently overwrite newer content.
- Return memos ordered by position, then creation time. Reordering is outside this feature.

## Automatic Save

- Creating a memo immediately creates an empty server record and focuses its title.
- After title or body input stops for about 700ms, save the latest content.
- Keep local text visible while saving.
- If a newer edit occurs during a request, do not replace it with the older response.
- On a conflict or network failure, retain the text and display a retryable error; do not discard local input.
- Flush a pending save when the field loses focus when possible.

## Deletion

- Ask for confirmation before deleting a non-empty memo.
- Empty memo blocks may be deleted directly.
- Delete only after the server confirms success; retain the block and show an error if deletion fails.

## Compatibility and Testing

- Existing tasks, timer state, access-code authentication, and calendar behavior remain unchanged.
- Add a forward-only D1 migration for the memo table and owner/position index.
- Test authentication, ownership, validation, optimistic version conflicts, create/update/delete behavior, and date independence.
- Verify responsive layout, textarea growth, automatic-save state handling, TypeScript, existing tests, and the production build before publishing.
