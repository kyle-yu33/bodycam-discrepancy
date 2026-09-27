# Application page flow

- `/`: reserved for the team landing page. Until that arrives, a temporary redirect opens `/cases`. Landing-page links should point to `/cases` (library) and `/new` (start a review).
- `/cases`: searchable case library, with Your cases and Examples views. Uploading, queued, analyzing, failed, and completed work stays discoverable. Destructive actions live in a row menu.
- `/new`: case name, footage source (file or YouTube), and report. Start analysis initiates the upload and returns to the library.
- `/cases/[case]`: a stable, refreshable case URL. Shows queue position or processing stage until complete, then the evidence workspace. Failed cases show details and recovery actions.

The shared header offers Cases, Queue, and New case. Queue opens from every work page and links to individual cases. It includes upload transfers, active analyses, waiting jobs, and recent outcomes.

Uploads belong to the root layout, so navigating inside the app does not interrupt a file transfer. Reloading or closing the browser during transfer can interrupt it; a browser leave warning protects that boundary. Once accepted by the backend, processing survives navigation and refresh. Transfer failures are visible in both the library and queue.

Review opens existing results directly. Findings and the full report share a left panel; the video and selected evidence appear on the right. No simulated processing replay is presented as a new analysis.

Delete and stop-and-delete actions use a shared modal naming the case and explaining the consequence. Cancel receives focus; Escape cancels; the native modal contains keyboard focus. Choosing a video uses a real button with its own hover area.
