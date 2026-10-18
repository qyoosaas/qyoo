# Flow Finance

BUILD: AUTONOMOUS FINANCE OS — V1

Build a real, functional authenticated web application for an AI-powered Finance Operating System for manufacturing and distribution SMEs.

This is NOT a landing page.

Do NOT build marketing pages.

Do NOT build a static UI prototype.

Build the actual logged-in application with functional navigation, database-backed entities, transaction workflows, automation logic, calculations, exception handling, and realistic sample data.

The application should feel like a completely new generation of finance software rather than traditional accounting software.

1. PRODUCT VISION

The product is a Finance Operating System.

Its core principle is:

Finance happens automatically. People handle exceptions.

The system connects:

Sales

Customers

Invoices

Receivables

Purchases

Suppliers

Bills

Payables

Banking

Bank reconciliation

Expenses

Inventory

Production

Accounting

Documents

Financial controls

FP&A

Management reporting

The product should automatically create the appropriate financial consequences when a business transaction occurs.

For example:

A user creates a sales invoice.

The system should automatically:

record the invoice

create the AR balance

calculate VAT

update customer balance

update revenue

update relevant sales reports

update cash forecast

link supporting documents

create an audit trail

The user should NOT need to separately enter the same information into accounting.

This principle must be reflected throughout the architecture.

2. IMPORTANT PRODUCT POSITIONING

Do NOT call this:

AI accounting software

generic ERP

bookkeeping software

accounting dashboard

The product is an:

Autonomous Finance OS

The first target customer is:

A UAE-based small/mid-sized manufacturing or manufacturing-distribution company.

Example company:

Al Noor Manufacturing LLC

Currency:

AED

Country:

United Arab Emirates

Fiscal year:

2026

Use UAE VAT concepts in the initial system.

However, build the underlying architecture so tax rates and rules can later become configurable.

3. DESIGN DIRECTION

The application should feel:

Premium

Minimal

Calm

Intelligent

Extremely clear

Fast

Trustworthy

Modern

Operational

Slightly futuristic

Do NOT make it resemble:

Tally

QuickBooks

Odoo

SAP

old ERP software

generic admin templates

Design inspiration can come from:

Linear

Stripe

Ramp

Mercury

Notion

modern banking applications

But do NOT copy their visual designs.

Create an original visual identity.

4. COLOR SYSTEM

Use a predominantly monochrome interface.

Primary:

Near-black:
#111111

Background:

Warm white:
#F7F7F5

Cards:

#FFFFFF

Borders:

#E6E5E0

Secondary text:

#737373

Primary action:

Black.

Do NOT use blue as the main brand/action color.

Use a restrained intelligent signal color:

Acid / electric lime:
#C7F000

The lime should NOT dominate the interface.

Use it primarily for:

AI signals

automation indicators

intelligent recommendations

system-generated insights

confidence indicators

successful automation

subtle active states

Use semantic status colors separately:

Green = resolved/success

Amber = warning/review

Red = critical

Important:

The application should be approximately 90–95% monochrome.

The accent should feel rare and intentional.

5. TYPOGRAPHY

Use a modern highly readable sans-serif font.

Prefer:

Inter

or another clean contemporary UI font.

Use strong typography rather than excessive cards.

Use whitespace generously.

Avoid oversized headings.

Avoid excessive rounded corners.

Use modest border radius.

Avoid glassmorphism.

Avoid excessive shadows.

Avoid gradients.

Avoid decorative illustrations.

The product should feel like serious financial infrastructure.

6. APPLICATION SHELL

Create a persistent left sidebar.

Top:

Product logo/name.

Use temporary product name:

FIN

Navigation:

Overview

Action Required

Sales

Purchases

Banking

Expenses

Inventory

Production

Accounting

Documents

FP&A

Reports

Bottom:

Company switcher

Al Noor Manufacturing LLC

Settings

User profile

Top navigation:

Global search

Command palette

Notifications

Help

User profile

7. AUTHENTICATION

Implement a basic authenticated application experience.

For the MVP:

Login

Logout

Protected application routes

User profile

Company association

If Supabase is connected, use Supabase Auth.

If authentication is not configured yet, structure the application so Supabase Auth can be connected cleanly.

Do not spend significant time on authentication UI.

The product itself is the priority.

8. DATABASE ARCHITECTURE

Use Supabase/PostgreSQL.

Create a normalized database structure.

Core tables/entities:

companies

users

roles

customers

suppliers

products

product_categories

warehouses

accounts

accounting_periods

tax_rates

sales_orders

sales_order_items

invoices

invoice_items

customer_payments

purchase_orders

purchase_order_items

supplier_bills

supplier_bill_items

supplier_payments

bank_accounts

bank_transactions

bank_reconciliations

expenses

expense_categories

inventory_transactions

inventory_balances

boms

bom_items

production_orders

production_materials

production_outputs

journal_entries

journal_entry_lines

documents

document_links

exceptions

exception_actions

audit_logs

budgets

forecasts

cash_forecasts

settings

9. ACCOUNTING ENGINE

Build a simple but proper double-entry accounting engine.

Every financial transaction that affects accounting should create journal entries.

Core accounts should include:

Cash / Bank

Accounts Receivable

Accounts Payable

Inventory

Raw Materials

Work in Progress

Finished Goods

Revenue

Cost of Goods Sold

Operating Expenses

VAT Input

VAT Output

Sales Discounts

Purchase Discounts

Other Income

Other Expenses

Equity

Retained Earnings

10. JOURNAL ENGINE

Create reusable functions/services for creating accounting entries.

Never duplicate accounting logic inside individual pages.

Use a centralized accounting engine.

Example:

Sales invoice:

Debit:
Accounts Receivable

Credit:
Revenue

Credit:
VAT Output

Customer payment:

Debit:
Bank

Credit:
Accounts Receivable

Supplier bill:

Debit:
Inventory or Expense

Debit:
VAT Input

Credit:
Accounts Payable

Supplier payment:

Debit:
Accounts Payable

Credit:
Bank

Sales discount:

Debit:
Sales Discounts

Credit:
Accounts Receivable

Purchase discount:

Debit:
Accounts Payable

Credit:
Purchase Discount / Inventory adjustment depending on treatment

The system should preserve a full audit trail.

11. CORE CONCEPT: TRANSACTION → FINANCIAL IMPACT

Every business transaction must have a clear relationship between:

Business event

Financial event

Accounting entry

Supporting document

Reconciliation status

Exception status

This should be represented in the database.

Do not build isolated modules.

Everything should connect.

12. SALES MODULE

Build:

Customers

Sales Orders

Invoices

Payments

AR Aging

Customer

Fields:

Customer name

TRN

Email

Phone

Address

Payment terms

Credit limit

Opening balance

Status

Sales order

Fields:

Customer

Order date

Items

Quantity

Price

Discount

VAT

Expected delivery

Status

Invoice

Fields:

Invoice number

Customer

Invoice date

Due date

Items

Quantity

Unit price

Discount

VAT

Subtotal

Total

Payment status

Attachments

Notes

13. SALES INVOICE WORKFLOW

User selects:

Create Invoice

Select customer.

Add products.

Set quantities.

Set price.

System calculates:

Subtotal

Discount

VAT

Total

Show live invoice preview.

When user clicks:

Create Invoice

automatically:

Save invoice.

Create invoice items.

Create AR balance.

Create accounting journal.

Calculate VAT.

Update customer balance.

Update sales reports.

Update cash forecast.

Add audit log.

Make invoice available in Documents.

Create an expected payment item for reconciliation.

Show confirmation:

Invoice created.

Then show:

AR updated.

Revenue recorded.

VAT recorded.

Customer balance updated.

This should happen automatically.

14. PAYMENT MATCHING ENGINE

This is one of the most important parts of V1.

Create a matching engine for:

Bank transaction

↔ Customer invoice

Bank transaction

↔ Supplier bill

Bank transaction

↔ Expense

Bank transaction

↔ Transfer

The matching engine should consider:

Amount

Date

Reference

Customer/supplier name

Invoice number

Transaction description

Historical behavior

Payment terms

15. PAYMENT DIFFERENCES

This is a core product feature.

Example:

Invoice:

AED 25,000

Payment:

AED 24,850

Difference:

AED 150

The system should automatically identify:

"Payment matched to INV-10492 with AED 150 underpayment."

Create an exception.

Show:

Invoice amount

Payment amount

Difference

Possible reason

Recommended action

Actions:

Record customer discount

Write off

Keep outstanding

Create credit note

Investigate

16. TOLERANCE RULES

Create configurable company settings.

Example:

Payment difference tolerance:

AED 50

If difference <= tolerance:

Suggest automatic resolution.

If difference > tolerance:

Create Action Required exception.

Also support percentage tolerance.

Example:

0.5%

Never automatically resolve large differences.

Management approval thresholds should be configurable later.

17. PURCHASE MODULE

Build:

Suppliers

Purchase Orders

Supplier Bills

Payments

AP Aging

Supplier statements later.

18. THREE-WAY MATCHING

For supplier bills:

Purchase Order

↔ Goods Receipt

↔ Supplier Invoice

Compare:

Quantity

Unit price

Total

VAT

Supplier

Example:

PO:

AED 42,500

GRN:

AED 42,500

Invoice:

AED 42,500

Show:

✓ PO matched

✓ Goods received

✓ Invoice matched

Status:

Fully matched

Button:

Approve & Post

If mismatch:

Create Action Required exception.

Example:

PO:

AED 42,500

Invoice:

AED 43,250

Difference:

AED 750

Suggested:

Review supplier price difference.

19. BANKING

Create:

Bank Accounts

Bank Transactions

Reconciliation

Bank account:

Name

Bank

Account number masked

Currency

Current balance

Ledger balance

Last synced

Reconciliation status

For MVP, allow:

CSV bank statement upload.

Do not require live banking integrations initially.

Structure the data model so live bank APIs can be integrated later.

20. BANK STATEMENT IMPORT

User uploads CSV.

System should:

Parse transactions.

Normalize dates.

Normalize descriptions.

Detect debit/credit.

Identify amount.

Create bank transaction records.

Attempt matching.

Show:

1,243 transactions imported.

1,182 automatically matched.

43 require review.

18 unmatched.

21. RECONCILIATION UI

Create a modern reconciliation workspace.

Each transaction:

Date

Description

Amount

Type

Suggested match

Confidence

Status

Example:

AED 25,000

ABC Trading

Suggested:

INV-10492

Confidence:

98%

[Confirm Match]

For multiple suggestions:

Show ranked matches.

Allow manual selection.

22. EXCEPTION ENGINE

This is one of the most important systems in the application.

Create a centralized exceptions table.

Exceptions can originate from:

Bank reconciliation

AR

AP

Sales

Purchases

Inventory

Production

Documents

VAT

Accounting

FP&A

Exception structure:

ID

Type

Priority

Source

Entity

Entity ID

Amount

Description

Reason

AI/System recommendation

Status

Created date

Due date

Assigned user

Resolved date

Resolution

Statuses:

Open

In Review

Waiting

Resolved

Dismissed

Priorities:

Critical

High

Medium

Low

23. ACTION REQUIRED CENTER

This is the primary operational workspace.

Page title:

Action Required

Subtitle:

"Everything that needs a human decision."

Show:

Critical

Needs Review

Waiting

Resolved

Examples:

Payment mismatch

Supplier invoice mismatch

Unidentified bank transaction

Duplicate invoice

Missing VAT document

Negative inventory

Inventory variance

Production cost variance

Unusual journal

Overdue receivable

24. EXCEPTION DETAIL DRAWER

Clicking an exception should open a right-side drawer.

Show:

What happened

Why it was detected

Related transaction

Related documents

Suggested resolution

Historical context

Accounting impact

Available actions

Example:

PAYMENT DIFFERENCE

Customer:
ABC Trading

Invoice:
INV-10492

Invoice:
AED 25,000

Received:
AED 24,850

Difference:
AED 150

System recommendation:

"Likely customer discount. This customer has made 7 similar deductions in the last 6 months."

Actions:

[Record Discount]

[Keep Outstanding]

[Write Off]

[Investigate]

Before applying action show:

Accounting impact.

25. LEARNING / RULE ENGINE

Do not build sophisticated machine learning for V1.

Build a deterministic rules engine with the architecture to support AI later.

Store resolution history.

Example:

ABC Trading

7 previous payment differences

Average difference:

0.8%

Typical resolution:

Customer discount

Then future transactions can use this history to improve recommendations.

Label recommendations:

System recommendation

Confidence:

96%

Do not claim that the system is truly AI if it is rule-based.

26. EXPENSE MODULE

Build:

Expenses

Expense categories

Employee expenses

Receipt attachments

Expense workflow:

Upload receipt.

Extract basic information.

For MVP, extraction can be simulated or implemented using available APIs if configured.

Fields:

Merchant

Date

Amount

VAT

Category

Employee

Project

Payment method

Document

27. INVENTORY

Build a finance-focused inventory module.

Products:

SKU

Name

Category

Unit

Selling price

Cost

VAT

Current quantity

Warehouse

Inventory transactions:

Purchase receipt

Sales issue

Adjustment

Production consumption

Production output

Show:

Inventory quantity

Inventory value

Raw materials

WIP

Finished goods

Slow-moving stock

28. INVENTORY ACCOUNTING

Every inventory movement that affects financials should be capable of creating accounting impact.

Sales:

Inventory decreases.

COGS increases.

Purchases:

Inventory increases.

AP increases.

Production:

Raw material decreases.

WIP increases.

Finished goods increases when production completes.

For V1, use a simple weighted-average costing model.

Keep the architecture expandable for FIFO and standard costing later.

29. PRODUCTION

Do not attempt to build a complete MRP system.

V1 production should support:

Products

BOM

Production Orders

Material Consumption

Finished Goods

Basic production costing

BOM:

Finished Product

Required materials

Quantity per unit

Production Order:

Product

Quantity

BOM

Expected material cost

Actual material cost

Expected production cost

Actual production cost

Variance

Status

Highlight:

"Actual material consumption is 8.4% above expected."

Create an exception.

30. DOCUMENT MANAGEMENT

Create a financial document vault.

Every transaction can have attachments.

Document categories:

Sales

Purchases

Banking

Expenses

Tax

Production

Contracts

Other

Every document should be linked to relevant entities.

Example:

Supplier invoice

→ Supplier

→ PO

→ GRN

→ Bill

→ Payment

→ Bank transaction

→ Journal

→ VAT

This relationship is critical.

Do not build generic cloud storage only.

Build:

Financial evidence storage.

31. TRANSACTION 360

Every important transaction must have a universal detail page/drawer.

Example:

Invoice INV-10492

Show:

Customer

Sales Order

Invoice

Payment

Bank transaction

Accounting journal

VAT

Documents

Exceptions

Timeline

Timeline example:

Order created

Invoice issued

Payment received

Payment matched

Difference detected

Discount recorded

Resolved

This should be one of the signature UX experiences.

32. ACCOUNTING MODULE

Build:

Chart of Accounts

General Ledger

Journal Entries

Trial Balance

Profit & Loss

Balance Sheet

Cash Flow

AR

AP

VAT

The accounting interface should be professional but secondary to the operational workflows.

Every accounting entry should link back to the business transaction that created it.

33. CHART OF ACCOUNTS

Create a sensible default manufacturing chart of accounts.

Include:

1000 Cash & Bank

1100 Accounts Receivable

1200 Inventory

1210 Raw Materials

1220 Work in Progress

1230 Finished Goods

1300 Prepayments

2000 Accounts Payable

2100 VAT Payable

2200 Accrued Expenses

4000 Sales Revenue

4100 Other Revenue

5000 Cost of Goods Sold

5100 Material Cost

5200 Production Cost

6000 Salaries

6100 Rent

6200 Utilities

6300 Transport

6400 Professional Fees

6500 Other Operating Expenses

7000 Finance Costs

8000 Equity

Use account types and hierarchy.

34. FP&A

Create a lightweight FP&A module.

Show:

Revenue

Gross Profit

Gross Margin

Operating Expenses

EBITDA

Cash

AR

AP

Inventory

Working Capital

Include:

Actual vs Budget

Actual vs Forecast

Cash Forecast

Revenue Forecast

Margin Analysis

Create simple forecasting logic based on historical data.

Do not overcomplicate forecasting in V1.

35. AI INSIGHTS

Create an AI insights layer.

For V1, these can use deterministic calculations and rule-based insights.

Examples:

"Gross margin declined 2.8% this month."

"Inventory increased 14% while sales increased 4%."

"Customer ABC represents 31% of outstanding receivables."

"Cash is expected to fall below AED 1M within 24 days."

"Product X gross margin declined from 31% to 24%."

Each insight should include:

What changed

Why it changed

Potential impact

Suggested action

36. OVERVIEW DASHBOARD

The homepage should NOT be a collection of generic KPI cards.

Primary focus:

ACTION REQUIRED

Example:

Good morning, Ahmed.

9 items need your attention.

Then show exception queue.

Below:

Cash

AR

AP

Inventory

Revenue

Gross Margin

Then:

Cash outlook

AI insights

Recent activity

37. RECENT ACTIVITY

Show meaningful activity:

Invoice created

Payment matched

Supplier bill approved

Exception resolved

Bank statement imported

Production completed

Do not show meaningless system logs.

38. GLOBAL SEARCH

Implement global search.

Search should find:

Customers

Suppliers

Invoices

Bills

Payments

Bank transactions

Products

Documents

Journal entries

Exceptions

Search example:

"ABC Trading"

should show all related entities.

Search:

"INV-10492"

should open the invoice and its full financial chain.

39. COMMAND PALETTE

Implement:

Ctrl + K

Commands:

Create invoice

Create purchase order

Upload document

Record expense

Import bank statement

Reconcile transactions

Find customer

Find supplier

Find invoice

Open P&L

Open cash forecast

40. AUDIT TRAIL

Every important change should create an audit log.

Record:

User

Action

Entity

Before

After

Timestamp

Source

Example:

Ahmed

Resolved payment difference

INV-10492

Resolution:
Customer Discount

AED 150

Timestamp

41. PERMISSIONS

Create basic roles:

Admin

Finance Manager

Accountant

Viewer

For V1, implement basic permission boundaries.

Finance users can create and resolve transactions.

Viewer can view but not modify.

Admin can configure settings.

42. SETTINGS

Create:

Company

Users

Roles

Accounting

Tax

Banking

Automation Rules

Tolerance Rules

Notifications

Automation Rules should eventually support:

Payment tolerance

Approval thresholds

Auto-matching rules

Expense rules

Document requirements

43. IMPORTANT ACCOUNTING CONTROL

Never silently modify accounting records.

If a transaction is changed after posting:

Create an audit trail.

Prefer reversal/correction entries rather than destructive editing.

The system must preserve financial history.

44. SAMPLE DATA

Populate the application with realistic sample data.

Company:

Al Noor Manufacturing LLC

UAE

AED

Manufacturing company.

Create:

20 customers

15 suppliers

30 products

Several warehouses

100+ sales invoices

50+ supplier bills

500+ bank transactions

Multiple payments

Multiple partial payments

Multiple payment differences

Several exceptions

Inventory movements

Production orders

Journal entries

Documents

AR aging

AP aging

Budgets

Forecasts

Make the dashboard look like a real operating company.

Do not use lorem ipsum.

45. IMPORTANT SAMPLE EXCEPTIONS

Make sure the demo data includes:

Customer underpayment

Invoice:
AED 25,000

Payment:
AED 24,850

Difference:
AED 150

Suggested:
Customer discount

Supplier overpayment

Invoice:
AED 18,000

Payment:
AED 18,420

Difference:
AED 420

Suggested:
Supplier credit / recoverable balance

Unidentified bank transaction

AED 3,250

No obvious match.

Supplier invoice mismatch

PO:
AED 42,500

Invoice:
AED 43,250

Missing VAT document

Expense:
AED 1,280

Inventory variance

System:
1,200 units

Physical:
1,176 units

Production cost variance

Expected:
AED 18,400

Actual:
AED 20,150

Overdue customer

AED 85,000 overdue.

46. UI BEHAVIOR

The application should feel responsive.

When an exception is resolved:

Remove it from the open queue.

Update counters.

Update relevant balances.

Create audit entry.

Show a subtle confirmation.

Example:

"Resolved"

"Customer discount recorded — AED 150"

Do not use flashy animations.

47. DO NOT BUILD THESE YET

Do NOT build:

Corporate cards

Live bank API integrations

Payroll

HR

CRM

Advanced MRP

Complex warehouse management

Multi-country tax engine

Full AI agent system

Advanced machine learning

External auditor portal

Mobile application

Native desktop application

These should remain future architecture considerations.

48. FUTURE-READY ARCHITECTURE

Even though the above features are not being built now, structure the system so these can eventually be added:

Corporate cards

Payment infrastructure

Live bank feeds

Advanced AI document extraction

AI finance agent

Financial document vault

Audit portal

Advanced FP&A

Multi-company

Multi-currency

Multi-country

49. FUTURE CORPORATE CARD CONCEPT

Do not build it now.

But ensure expenses and payments are represented generically enough that future card transactions can enter the same transaction engine.

Future flow:

Corporate card transaction

→ Merchant detection

→ Receipt request

→ Receipt upload

→ Document extraction

→ Transaction matching

→ Expense classification

→ VAT

→ Accounting

→ Reconciliation

The current architecture should not prevent this.

50. FUTURE DOCUMENT INTELLIGENCE

Documents should not merely be files.

They should eventually become structured evidence.

Future:

Document

→ Extracted data

→ Entity

→ Transaction

→ Accounting

→ VAT

→ Audit trail

Keep the current document schema ready for this.

51. PRODUCT NORTH STAR

Everything should work toward this experience:

A company operates normally.

Employees sell.

Buyers purchase.

Warehouse receives stock.

Production produces goods.

Customers pay.

Suppliers are paid.

Documents arrive.

Bank transactions happen.

And the Finance OS continuously turns those activities into clean financial records.

The accountant opens the application and sees:

Everything is under control.

Except for:

9 things that need you.

That is the product.

52. QUALITY BAR

Before considering V1 complete, verify these end-to-end flows:

Flow 1 — Sales

Create customer

→ Create invoice

→ AR created

→ Journal created

→ Customer balance updated

→ Payment entered

→ Payment matched

→ AR cleared

Flow 2 — Underpayment

Create invoice

→ Receive smaller payment

→ System detects difference

→ Exception created

→ Accountant selects "Customer Discount"

→ Correct accounting entry created

→ Exception resolved

→ AR corrected

→ Audit log created

Flow 3 — Purchase

Create supplier

→ Create PO

→ Record receipt

→ Upload supplier invoice

→ Match PO/GRN/invoice

→ Post bill

→ AP created

→ Payment entered

→ AP cleared

Flow 4 — Bank

Upload CSV

→ Transactions imported

→ Automatic matching

→ Unmatched transactions identified

→ Accountant resolves exceptions

→ Reconciliation completed

Flow 5 — Inventory

Purchase stock

→ Inventory increases

→ Inventory value updates

Sell product

→ Inventory decreases

→ COGS recognized

→ Margin updated

Flow 6 — Production

Create BOM

→ Create production order

→ Consume raw materials

→ Produce finished goods

→ Inventory updates

→ Production cost calculated

→ Variance calculated

53. FINAL UX PRINCIPLE

Do not make users "use accounting software."

Make them operate their company.

The system should translate business actions into finance automatically.

The user should feel:

"I don't know where the accounting happened — I just know that it is already done."

That feeling is the core product experience.

Build the application around that principle.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://qyoo.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/027469ce-6ca4-489b-a1be-db56017b2947).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
