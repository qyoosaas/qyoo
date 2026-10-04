# Roadmap

## Done
- [x] Document Intelligence & Import Engine (inbox, classification, extraction, validation, matching, review + approval)
- [x] Qyoo rebrand: name, logo, icon/favicon, brand colours and typography
- [x] Logo sizing: larger wordmark in app shell + auth, no background tile on the main logo; white rounded-square background only on the favicon

- [x] Document engine completion: real XLSX/PDF text reading (no invented data), product matching, atomic approval, Action Required alerts, delivery notes / credit notes / quotations

## Open
- [x] Complete the frontend UI/UX readiness pass across every main page, detail page, dialog, and responsive state
- [x] Standardize detail-page navigation, headers, action hierarchy, record links, loading/empty/error states, and confirmations
- [x] Add a usable mobile app shell and replace raw settings data with clear business controls
- [x] Verify all public-facing routes and representative workflows on desktop and mobile without changing accounting logic
- [x] Make command search actions open their intended form or workflow immediately after navigation
- [ ] Swap the local heuristic reader for the self-hosted PaddleOCR / PP-StructureV3 / Docling service (set DOC_AI_URL when it is running)
- [ ] Remove leftover QA test data (bank lines "QA STATEMENT TEST", uploaded statement.csv) when the user confirms
