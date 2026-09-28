# Complete Qyoo UI/UX for demo readiness

## Goal
Make the full authenticated app consistent, clear, responsive, and presentation-ready without changing finance calculations, posting rules, or backend architecture.

## What the audit found
- Detail pages use several different back-navigation patterns: invoice links sit above the title, orders place a back action beside primary actions, and document pages use different labels and icon treatment.
- Desktop navigation disappears on smaller screens without a replacement, making the authenticated app difficult to use on mobile and tablet.
- Lists are inconsistent: some rows are clickable, some only link the record number, and some operational records have no obvious route to their details.
- Page action hierarchy varies. Destructive actions such as Void/Delete appear repeatedly as always-visible text, while secondary edit actions and primary workflow actions shift position between screens.
- Loading, empty, unavailable, and failed states are implemented differently and often do not provide a clear recovery action.
- Settings currently expose raw structured values instead of understandable fields, selectors, switches, and amount/percentage controls.
- Dense pages need better small-screen behavior, stable action wrapping, and clearer table overflow cues.
- The preview produced one failed data request during the route sweep; it needs tracing and a frontend correction if caused by an invalid query.

## Implementation

### 1. Establish shared page patterns
- Add reusable detail navigation, detail header, state display, and row-link patterns to the existing Qyoo primitives.
- Use one detail-page structure everywhere: back link above the header, title/subtitle/status in the header, then secondary and primary actions in a predictable order.
- Standardize labels such as “Back to Sales”, “Back to Purchases”, and “Back to Documents”, including icon size, spacing, focus state, and placement.
- Standardize tabs, filters, date/period controls, metrics, tables, empty states, loading states, and retryable error states.

### 2. Make the app shell responsive and consistent
- Add a compact mobile header and navigation drawer containing every module, company context, settings, notifications, and sign-out.
- Keep the desktop sidebar and search behavior, while preventing header controls from clipping or overlapping on narrower widths.
- Replace remaining one-off raw controls with the existing design-system controls and accessible labels/tooltips.

### 3. Normalize every module page
- **Overview:** align quick actions, improve decision/activity links, and preserve the executive overview hierarchy.
- **Action Required:** clarify filtering and selected-item behavior, use consistent severity/status treatment, and provide a clean empty state.
- **Sales and Purchases:** make invoices, receipts, orders, delivery notes, bills, GRNs, payments, customers, suppliers, and ageing rows consistently discoverable and clickable; move destructive actions into subtle row menus.
- **Banking:** improve account/filter controls, transaction selection, matching status clarity, reconciliation summary, and narrow-screen handling.
- **Expenses and Inventory:** add consistent record inspection/edit entry points, replace repeated destructive text with subtle menus, and clarify locked/posted states.
- **Production and Accounting:** improve selected-record guidance, table navigation, journal/source links, and period/status readability.
- **Documents:** remove duplicated visual hierarchy, refine upload/review states, and keep the approval path visibly distinct from posting status.
- **FP&A and Reports:** standardize period selection, tabs, exports, comparison labels, and responsive financial statements.
- **Settings:** replace raw structured text with business-friendly inputs, selects, toggles, percentages, currency amounts, validation, and clear save feedback.

### 4. Normalize every detail experience
- Apply the shared back/header/action pattern to sales orders, purchase orders, invoices, document reviews, delivery notes, GRNs, supplier bills, receipts, and payments.
- Make linked records consistently navigable in both directions: order ↔ delivery/receipt ↔ invoice/bill ↔ payment/receipt ↔ source document.
- Present status, dates, amounts, parties, lines, linked documents, and audit history in the same visual order where applicable.
- Keep edits subtle and respect existing immutability rules; posted records continue to require reversal or correction rather than casual editing/deletion.
- Add clear not-found and failed-load recovery actions that return to the correct parent module.

### 5. Presentation polish and verification
- Correct wrapping, spacing, truncation, focus visibility, keyboard access, and table behavior at desktop, tablet, and mobile sizes.
- Trace the observed failed request and remove any user-visible console/runtime issue caused by the UI.
- Open every main route and representative detail route in a signed-in session; exercise tabs, filters, dialogs, menus, back links, upload entry, and non-destructive form states.
- Verify representative Sales, Purchases, Banking, Documents, Reports, and Settings journeys on desktop and mobile, then confirm a clean build and no runtime errors.

## Technical details
- Keep the current Qyoo tokens, typography, density, square-radius language, and finance data untouched.
- Reuse the existing route structure and design-system controls; introduce only small shared frontend primitives where they eliminate inconsistency.
- Do not add or alter tables, posting procedures, seeded records, or accounting behavior during this UI pass.
- Add route-specific metadata only where a content route is missing required metadata.

## Completion criteria
- Every app route is reachable and usable at desktop and mobile widths.
- Every record type visible in a list has a consistent, obvious inspection path.
- Every detail page uses the same back-navigation and header hierarchy.
- Primary, secondary, edit, and destructive actions are visually consistent and appropriately emphasized.
- All major pages have coherent loading, empty, error, and success feedback.
- Settings are understandable without reading raw data syntax.
- The signed-in route sweep finishes without build, runtime, or console errors attributable to the UI.