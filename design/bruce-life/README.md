# Bruce’s Life — mobile design handoff

**Implementation update (19 October 2026):** Quiet Momentum is now implemented as an Expo app in `apps/mobile`. See [the UI guide](../../docs/UI.md), [run instructions](../../docs/MOBILE.md), and [verification limits](../../docs/VERIFICATION.md). This document preserves the original concept specification; exact runtime behavior and the supported ACT/365 interest model are documented with the implementation.

A calm personal dashboard connecting learning, everyday money, and debt progress. Designed for one person using iOS or Android in portrait, with primary actions within thumb reach.

## High-fidelity screen boards

Each board includes the same eleven requested screens and a compact flow/design-system panel. Numbers below match the order displayed in the conversation.

1. [Quiet Momentum — revised](01-quiet-momentum-v2.png): dark navy, mint progress, focused study hero; light Settings example. [Original](01-quiet-momentum.png).
2. [Daily Rhythm — revised](02-daily-rhythm-v2.png): soft indigo, sage, cream actions, daily agenda; light Settings example. [Original](02-daily-rhythm.png).
3. [Open Chapter — revised](03-open-chapter-v2.png): light surfaces, deep blue typography, evergreen progress; dark Settings example. [Original](03-open-chapter.png).

These are AI-generated static visual concepts, created with the built-in image generation tool. They are not editable Figma layers or functioning applications. The specifications below govern exact copy, calculations, navigation, and behavior where generated imagery contains small inconsistencies. In particular, all skill progress uses green rather than red, the five tab labels remain visible, and 6/12 weekly hours is 50%. Original boards are preserved; revised boards incorporate the currency, wallet, and loan requirements below.

Visual QA notes: generated revisions can alter small labels or remove secondary controls. The specification remains authoritative: UI Design progress is 68%, JavaScript 42%, and French 24% with 1/3 weekly hours; the SACCO next payment is 23 October; positive wallet balances use neutral or green text; transaction amounts have no extra placeholder text; Light/Dark/System and all reminder settings remain available even if a compact Settings mock omits a row. Spending charts use historical dates through the selected period, not unlabeled future months. These raster boards are concept references rather than pixel-exact production screens.

## Rwandan money and lending requirements

### Currency and large amounts

- Default to **RWF** on first launch. Use **RWF 25,000** consistently; show thousands separators and no `.00` in lists, balances, budgets, fields, chart tooltips, payments, or reports.
- RWF entry accepts whole francs only. Use a numeric keyboard; a pasted fractional value gives an inline explanation rather than silently rounding. Optional USD support uses the precision appropriate to USD.
- Keep Settings → Currencies with RWF marked Default and Add currency available for later USD income or course purchases. Changing the default changes new-entry defaults, not historical amounts or their currencies.
- Lay out large money values such as **RWF 125,000,000** at 320–430px screen widths. Use full-width amount regions and tabular numerals. On narrow screens or with larger text, place the currency label above the amount, move the amount below the transaction name, and grow the row vertically. Never truncate amounts, append ellipses, or shrink them to unreadable text.
- Chart axes may say **RWF · millions** with ticks 0, 1, 2, 3 or **RWF · thousands** with ticks 0, 250, 500, 750. Every selected bar/point reveals the exact value, such as **RWF 1,250,000**; compact axis notation must not replace exact account, budget, or loan balances.

### Payment method and wallet balances

- Every transaction requires **Payment method / wallet**: **Cash, Bank, MTN MoMo, Airtel Money**. A loan payment and a course purchase recorded as a transaction use the same field. A transfer has a source and destination wallet.
- Money includes a visible **Wallet balances** group with full amounts: Cash **RWF 25,000**; Bank **RWF 300,000**; MTN MoMo **RWF 185,000**; Airtel Money **RWF 27,500**. Example total wallet balance: **RWF 537,500**. Keep this distinct from the monthly **budget remaining RWF 187,500**.
- Show all four balances as readable grouped rows, not a carousel that hides the remaining wallets. Keep the top summary and wallet rows visible; charts and recent transactions may continue below the fold.
- Tapping a wallet filters its transactions and opens wallet detail. Opening balance is configured separately from income so balances remain meaningful when the app starts mid-month. Balances derive from opening balance plus recorded inflows minus outflows and transfers, rather than the month’s budget alone.
- Quick-add preselects the **last wallet successfully saved** for the selected currency, stored locally and available offline. Cancelled forms do not change this preference. For first use, use the onboarding wallet; if none exists, require selection. Archived or currency-incompatible wallets prompt a new choice. Users can override the wallet on every entry.
- Example foreign-currency accounts are separate wallets, such as Bank (USD). Do not silently convert an RWF wallet into a USD wallet or aggregate balances across currencies without showing the conversion assumptions.

### Loan sources, interest, and schedules

- **Add loan** collects loan name, lender type, lender name, currency, original principal, remaining principal, interest choice, payment schedule, and next due information. Types are **Bank, SACCO, Mobile lending, Friend / family**. The lender name can be a person or institution; no institution account connection is required.
- Interest choice is **No interest** or **With interest**. No interest shows **Interest-free · 0%**, hides rate/method inputs, and keeps estimated interest at RWF 0. With interest requires rate, rate period, and calculation method before estimating payoff. Fees are separate recorded terms and are not inferred from the lender type.
- **Weekly:** choose payment amount, weekday, and first due date; future dates recur every seven days.
- **Monthly:** choose payment amount and due day or last day of month. For a 29th–31st due day, use the last valid day in shorter months and retain the chosen day for later months.
- **Custom dates:** add explicit date/amount rows, with Add payment date and editable entries. Sort chronologically; explain duplicate dates and amounts that do not cover the planned obligation. Permit an unscheduled remaining balance, but label it and avoid claiming a final payoff date until a complete plan is available.
- Loan cards show lender type, remaining balance, **Interest-free** or rate with its period, and **Weekly / Monthly / Custom dates** beside next due information. Detail shows the complete upcoming schedule and payment history, with partial payments and the remaining due amount visible.
- Keep the aggregate loan example **RWF 1,650,000** using Equipment / Bank **RWF 1,200,000**, SACCO **RWF 300,000**, Mobile lending **RWF 100,000**, and Friend / family **RWF 50,000**. Example labels: bank 12% annual, monthly, next 25 Oct; SACCO 8% annual, weekly, next 23 Oct; mobile custom dates, next 28 Oct, terms to confirm; family interest-free, custom dates, next 1 Nov. Do not invent mobile-loan interest or show an estimate before its terms are recorded.
- The planner labels the slider **Extra per week**, **Extra per month**, or **Extra on selected payment dates**, matching the schedule. For custom dates, select the date or defined date set the extra applies to. Recalculate using actual scheduled dates and recorded interest terms; a weekly loan must not reuse the illustrative monthly calculation.
- An interest-free RWF 50,000 family loan with custom RWF 25,000 payments on 1 Nov and 1 Dec 2026 shows **Estimated payoff 1 Dec 2026 · Interest RWF 0**. Adding RWF 25,000 to the 1 Nov payment moves payoff to **1 Nov 2026**, with **interest saved RWF 0**. Do not claim interest savings for a zero-interest loan.
- Reminders follow each scheduled due date, including custom entries. Editing future dates reschedules their reminders without modifying historical payments. The Home next-payment card selects the earliest unpaid scheduled obligation across all loans.

## User flow overview

| Entry | Next screens | Completion |
|---|---|---|
| First launch | Welcome and currency/wallet → create and confirm PIN → optional biometrics and reminders | Home; onboarding is not repeated |
| Returning launch | PIN or platform biometrics | Restore previous tab; Home on cold start |
| Home → study card | Skill detail → Pomodoro | Finish/log session → hours and daily progress update |
| Skills | Skills list → skill detail → milestones, notes, timer | Back preserves list position |
| Skills → Add skill | Name and goal → milestones → weekly hours and course cost | New skill detail |
| Any main tab → floating + | Bottom sheet: Expense / Income / Study session | Add form → save → original tab with confirmation |
| Money | Overview → Transactions or Budgets → filter/category | Matching transactions or editable monthly budget |
| Loans | Loan list → loan detail | Record payment or explore payoff planner |
| Loan → Record payment | Amount, date, wallet, principal/interest split, note → review | History and linked Money transaction update once |
| Loan → Payoff planner | Adjust extra payment → compare dates and interest → Save plan | Updated planned amount; no payment occurs |
| More | Reminders / wallets and currencies / Settings | Return to previous tab |
| Settings → Export | CSV or PDF → date range and modules → preview → device share/save | Export includes currency labels |

The five persistent tabs are **Home, Skills, Money, Loans, More**. A separate floating **+** sits above the tab bar at the trailing edge. It must not cover More or any tab label. Detail screens push onto their parent tab; forms open as full-height sheets with a clear Cancel action. The quick-add sheet fits within lower-thumb reach.

## Version 1 screen specifications

| Screen | Content and hierarchy | Primary interaction |
|---|---|---|
| Lock | App name, quiet illustration, six empty PIN dots, numeric keypad, biometric option; no money or study data | Unlock with device biometrics or PIN; incorrect PIN gives inline feedback and platform-appropriate retry delay |
| Onboarding | Three steps: currency and wallet; PIN confirmation with optional biometrics; optional reminders | Continue; reminders can be skipped and enabled later |
| Home | Greeting/date; today’s study 35/60 min and Resume study; monthly budget left RWF 187,500; next payment SACCO RWF 25,000 due 23 Oct; 12-day streak | Resume study; tap financial summaries to open their modules |
| Skills list | Weekly hours 6/12, then UI Design 68%, JavaScript 42%, French 24%; weekly targets 5, 4, and 3 hours | Tap skill; Add skill opens the short setup flow |
| Skill detail | Goal, milestone-derived progress, 24/40 logged hours, milestone checkboxes, 25-minute Pomodoro, notes, RWF 75,000 course cost | Start focus; pause/resume/end session; milestone checkbox updates progress |
| Add transaction | Income/expense segmented control, full whole-number RWF amount, category, date, required Payment method / wallet, optional note | Save expense or Save income; quick-add remembers the last saved compatible wallet |
| Money overview | Month selector, budget remaining, four wallet balances, income/expense comparison, category spending; Transactions/Budgets view | Tap a wallet to filter; filter by day/week/month/custom date and category; edit monthly category budgets |
| Loans list | Total outstanding by currency, lender type, balances, interest or Interest-free, Weekly/Monthly/Custom dates, next due, repayment progress | Select loan or Add loan; amber upcoming and red overdue statuses include text |
| Loan detail | Balance, lender type/name, interest terms, payment schedule, next due, estimated payoff when determinable, remaining interest, payment history | Record payment; edit future schedule; Explore extra payments |
| Payoff planner | Scheduled payment, extra-payment slider labeled for the chosen schedule, before/after timeline, estimated date and interest savings | Slider updates estimates using recorded terms and actual dates; Save plan saves a target only |
| Settings | Profile, Light/Dark/System, PIN/biometrics, currencies/wallets, reminders, sync status, CSV/PDF exports | Immediate appearance preview; sensitive changes require reauthentication |

### Supporting flows

- **Add skill:** require a name and goal, suggest 3–5 editable milestones, set weekly study target, optionally enter course cost and currency. On save, ask whether to also record the course purchase as an expense; do not silently create or duplicate a transaction.
- **Pomodoro:** default 25-minute focus and 5-minute break; configure duration in the timer. Pausing preserves elapsed time. Ending early offers Save elapsed time or Discard. Log only focus time. A timer running through app backgrounding reconciles elapsed time on return and respects the device’s notification permissions.
- **Study session:** choose skill, duration, date, and optional note. Manual sessions use the same totals as the timer. Completing today’s target gives a small checkmark and “You showed up today.”
- **Record payment:** select loan, amount, date, and wallet; review principal, interest, and any fee. Show one linked expense in Money. Editing or undoing a payment updates both records together. A payment is a record of money already paid; this UI does not initiate a bank or mobile money transfer.
- **Add loan:** name and lender type/name → original and remaining balance in RWF by default → No interest or With interest and recorded terms → Weekly, Monthly, or Custom dates → review and save. A friend/family loan can have interest or be interest-free. Weekly setup shows amount, weekday, and first date; monthly shows amount and day of month; custom shows editable dated amount rows. Saving a loan does not automatically create an income transaction; offer an explicit linked disbursement record when needed.
- **Reminders:** list Study, Loan payments, and Bills with individually editable time, recurrence, and enabled state. Ask for notification permission after the user enables a reminder. When permission is denied, explain how to enable it and keep the reminder saved. Use device-local notification scheduling so reminders can work offline.
- **Budgets:** monthly category rows show spent, limit, amount remaining, and progress. Over-budget rows show text and a red indicator; near-limit rows use amber. Budgeted expenses and loan payment category inclusion are explicit so the remaining balance stays explainable.

## Small design system

Use Quiet Momentum as the default reference for the exact tokens below. The other boards are alternatives, not additional themes to mix into the same interface. The light and dark modes share layout, component sizes, icon meanings, and typography.

| Token | Dark | Light | Use |
|---|---|---|---|
| Background | `#0C1424` | `#F6F8FB` | Main canvas |
| Surface | `#172238` | `#FFFFFF` | Cards, sheets, grouped lists |
| Main text | `#F3F6FA` | `#142239` | Titles and money |
| Secondary text | `#AAB9CD` | `#526276` | Supporting copy |
| Primary action | `#77E3B2` with `#0C1424` text | `#173C62` with white text | Main CTA |
| Progress/income | `#77E3B2` | `#187653` | Successful progress and positive money |
| Expense/overdue | `#FF8F91` | `#B74748` | Negative money and overdue text |
| Upcoming due | `#F2C66D` | `#956009` | Upcoming payment badges |
| Divider | `#2A3A50` | `#DCE3EC` | Grouping and field outlines |

- **Typography:** Manrope; platform system sans-serif fallback. Display/money 36/44 semibold, page heading 28/36 bold, section heading 20/28 semibold, body 16/24 regular, labels 14/20 medium, tab labels 12/16 medium. Use tabular numerals and explicit currency codes. Support device font scaling; allow cards to grow vertically.
- **Spacing:** 4, 8, 12, 16, 24, 32px. Screen side gutters 20px; card padding 20px; section spacing 24px. Honor platform top/bottom safe areas in the eventual implementation.
- **Buttons:** 52px minimum height, 14px radius. Filled primary, outlined secondary, quiet text action, disabled, pressed, focus, and loading states. Maintain button width while loading and prevent repeated saves.
- **Cards:** 20px corners, quiet surface fill, minimal elevation. Use grouped rows and dividers rather than giving every field a card. One dominant CTA per screen.
- **Fields:** visible persistent labels; minimum 52px height; native date/currency pickers; whole-number numeric entry for RWF and currency-appropriate precision for other currencies; optional notes multiline. Preserve typed values when opening a picker.
- **Progress:** 6–8px rounded track, text value and target adjacent. Monetary budget bars and study completion must explain what their percentages measure.
- **Icons:** one rounded line icon family such as Lucide at 20–24px with consistent 1.75–2px stroke. Home, book, wallet, repayment, and ellipsis icons pair with tab labels. Icon-only actions need accessible labels and 48px touch areas.
- **Accessibility:** target WCAG AA contrast during implementation, support screen readers and dynamic type, include non-color status labels, provide visible keyboard focus where applicable, and respect reduced-motion preferences. Contrast and native assistive technology behavior have not been tested on these raster concepts.

## Interaction and state notes

| Tap/action | Result |
|---|---|
| Floating + | Accessible bottom sheet with Expense, Income, Study; swipe down or tap outside to dismiss |
| Transaction type | Updates form label, categories, sign preview, and Save text; preserves amount and date |
| Payment method / wallet | Opens Cash, Bank, MTN MoMo, Airtel Money picker; preselects the last successfully saved compatible wallet |
| Wallet balance | Opens that wallet’s full balance and filtered transaction history |
| Loan schedule | Changes between Weekly, Monthly, and Custom dates, revealing the appropriate date/amount controls; confirms before discarding an existing custom schedule |
| Loan No interest | Hides rate and interest method; shows Interest-free and zero estimated interest |
| Save transaction | Validate → persist locally → dismiss → “Expense saved” confirmation with Undo; reconcile totals immediately |
| Milestone checkbox | Toggle completion; update milestone-based percentage; small check animation; Undo available |
| Timer Start | Start countdown; replace with Pause and End; keep the timer visible when returning to detail |
| Skill note | Open a simple editor; save locally with a visible saved state |
| Budget row | Open category detail and editable monthly limit; show recent matching expenses |
| Loan card | Open the same loan’s detail; retain scroll position on return |
| Planner slider | Recompute on every change; also provide +/− controls or a numeric input for precision and accessibility |
| Save plan | Persist intended extra payment and optional reminder; never log a payment |
| Theme choice | Preview immediately across all screens; System follows device appearance |
| Sync indicator | Open details: last sync, pending count, and retry; preserve all local records on failure |
| Export CSV/PDF | Choose date range/modules, preview, then save/share using the operating system |

Animation is short and restrained: 150–200ms for buttons and sheets, up to 300ms for progress. Streak celebrations at 7/14/30 days use a small badge and optional haptic; reduced motion uses a static success message. Never interrupt an amount entry with a celebration.

### Friendly empty/error states

- Skills: “Your first small step starts here.” → Add your first skill.
- Transactions: “A clear picture starts with one entry.” → Add a transaction.
- Loans: “Nothing to track here yet.” → Add a loan; do not assume having no loans is an error.
- Reminders: “A gentle nudge, when you need it.” → Create reminder.
- Filter with no matches: “No entries in this view.” → Clear filters.
- Offline: “Offline · 2 changes saved on this device.” No blocking alert.
- Sync error: “Saved on this device. We’ll try syncing again.” → Retry.
- Save failure, including full storage: keep entered data, explain that saving failed, and offer Retry. Do not show a success message before local persistence succeeds.

## Privacy, offline, currencies, and export

- The lock conceals all financial information on launch and on return after the configured inactivity interval. Use a protected recent-app preview. Biometrics use the platform’s authentication prompt with PIN fallback; the drawing is not a claim of implemented security.
- The app’s primary records and timers work without a connection. States are Saved on device, Offline with pending changes, Syncing, Synced, and Needs attention. If cloud sync is not configured, use Saved on device rather than falsely showing Synced. Settings provides opt-in sync and explains its destination.
- Amounts always carry their currency. RWF uses zero decimal places; currencies such as USD use their appropriate precision. Keep totals separate by currency by default. A converted overview must show its rate, rate date, and base currency; offline uses an explicitly dated cached rate.
- Example wallets: Cash, Bank, MTN MoMo, Airtel Money, USD wallet. These are manual tracking containers, not connected financial accounts. Wallet selection does not imply a live provider connection. Wallet transfers move balances without counting as new income or spending.
- Study course cost, a linked purchase, and later loan payments stay connected by references so they are not double-counted. Principal reduction and interest paid remain distinct in the loan record.
- CSV exports include transaction IDs, date/time, category, amount, currency, wallet, notes, and linked payment IDs; provide separate skill-session and loan-payment files. PDF reports include date range, totals per currency, readable charts, and loan estimates labeled as estimates.

## Example data and payoff validation

All displayed dates are anchored to **Sunday, 18 October 2026**, Africa/Kigali. The current week is Monday 12–Sunday 18 October. Next Equipment loan payment: 25 October 2026. With the expanded loan example, Home shows the earlier SACCO payment of RWF 25,000 on 23 October 2026.

Monthly income RWF 850,000; expenses RWF 312,500; spending budget RWF 500,000; budget left RWF 187,500. Skill hours and milestone progress are separate measures: completing 24/40 target hours does not by itself imply 68% milestone completion. Each milestone can have a defined weight; otherwise use equal weights and display the derived percentage.

The planner example was checked using monthly amortization on a RWF 1,200,000 balance at 12% nominal annual interest, divided by 12, with the first scheduled payment on 25 October 2026:

| Scenario | Payment | Number of payments | Last payment date | Remaining interest |
|---|---|---|---|---|
| Regular | RWF 100,000/month | 13 | 25 October 2027 | Approximately RWF 84,779 |
| Extra | RWF 125,000/month | 11 | 25 August 2027 | Approximately RWF 67,948 |

Approximate saving: RWF 16,831, rounded to RWF 17,000 in the summary. The final payment is smaller than a full regular payment. Estimates exclude fees, penalties, and daily-interest adjustments. A real implementation must use each loan’s recorded interest method and detect payments that do not cover interest.

## Phase 2 — designed after Version 1 is approved

Keep these out of the V1 bottom navigation. Start from More and add contextual links from the relevant detail screens.

| Screen | Proposed layout | Entry/interaction |
|---|---|---|
| Skill ROI | Skill selector; course cost and study hours; attributed income; cash return and time-to-first-income | Skill detail → ROI; income entries can link to a skill; do not assign a cash value to hours without an explicit user input |
| Weekly review | Week selector; hours and milestones; money in/out by currency; principal repaid; one next-week intention | Home Sunday prompt or More; open each summary’s underlying records |
| Savings goals | Goal card with saved/target and target date; contribution history | More → Savings; record or reverse contribution without counting transfers as spending |
| Net worth | Assets minus liabilities per currency; monthly line chart and account breakdown | More → Net worth; converted view requires visible FX assumptions |
| Journal/mood | Today’s date; optional mood choice; private short note; chronological entries | Home evening prompt or More; optional reminders; journal excluded from exports unless selected |

Phase 2 is a future screen plan, not part of the eleven V1 high-fidelity screens on the boards. The raster design handoff itself contains no running behavior. The subsequent Expo implementation adds local app behavior, native biometric/encryption configuration, sync integration, and exports; real financial-account integration remains outside scope.
