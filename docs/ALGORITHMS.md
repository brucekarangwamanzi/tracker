# Algorithms, explained simply

All money inputs below are canonical RWF integer strings. Convert to `bigint` before arithmetic and return strings over JSON. Durations, indices and basis-point rates are bounded integers; money never passes through a JavaScript `number`.

## 1. Wallet balance and transfers

**Idea:** the wallet is a ledger, not a number you manually change. Add incoming rows and subtract outgoing rows. Ignore soft-deleted rows. A transfer removes from one wallet and adds to another in the same transaction.

```text
balance = 0
for active entry in this user's wallet:
  balance += amount for income/transfer_in
  balance -= amount for expense/transfer_out
transfer: validate wallets → insert operation → insert both linked entries → commit
```

**Edges:** self-transfer, different/foreign owner, retries, missing wallets, maximum BIGINT, tombstones, negative recorded balances. Transfers must not inflate income or spending. Negative balances are permitted for honest recordkeeping; this app does not enforce bank overdraft policies. Opening balances need an opening transaction.

**Code:** [money.ts](../src/core/money.ts), [transfer service](../src/server/finance.ts), [offline drafts](../src/mobile/drafts.ts). **Tests:** `integer money and wallet ledger` in [core.test.ts](../tests/core.test.ts), [sync.test.ts](../tests/sync.test.ts), [SQLite tests](../tests/sqlite.test.ts), [PostgreSQL tests](../tests/postgres.test.ts).

## 2. Budget alerts

**Idea:** after an expense, calculate this category’s expenses for its recorded local calendar month. Compare using multiplication, so 80% needs no decimals. Record the fact that an alert was created.

```text
spent = sum active expenses for category + YYYY-MM
for level in [80, 100]:
  if spent * 100 >= limit * level and no event for budget/month/level:
    insert budget_alert inside the expense transaction
```

**Edges:** crossing both thresholds in one purchase creates one event for each level; repeating the push creates neither again. Dropping below a threshold then crossing again does not spam. Zero budgets are invalid. Transfers are excluded. An expense’s category must be an expense category. Alert events sync to the phone for in-app display; the scheduled push worker currently sends study/bill/loan reminders, not budget pushes.

**Code:** `budgetLevels` in [money.ts](../src/core/money.ts), `budgetAlerts` in [finance.ts](../src/server/finance.ts). **Tests:** threshold and no-spam cases in core/sync tests. The `(user_id,budget_id,month,level)` database unique key also protects against duplicates.

## 3. Loan schedules, interest and payoff planning

**Idea:** create actual due dates first, then walk them one at a time. Calculate interest on the outstanding principal for the actual elapsed days. Cap the final payment at what remains.

```text
denominator = 10,000 basis points * 365 days
numerator = principal * annual_rate_bps * elapsed_days + carried_fraction
new whole-franc interest = numerator / denominator  [integer division]
new carried fraction = numerator % denominator
for scheduled date:
  offered = scheduled payment + extra
  payment = min(offered, rounded settlement amount)
  pay interest first, then principal
  stop when principal, interest and carried fraction are zero
```

Regular installments carry sub-franc interest forward. Near final settlement, any remaining fraction is charged as one franc. This conservative ceiling is explicit: a payment one franc short leaves one franc outstanding rather than silently forgiving interest. The final payment absorbs the remaining principal/rounding difference. This convention must match the lender’s recorded agreement before relying on its estimate.

Weekly dates advance by seven days. Monthly dates retain the chosen day, clamping to month-end without turning all later payments into the 28th. Custom dates are sorted, unique and can have different amounts. A custom schedule that ends before payoff returns `payoff: null`, not an invented date.

Before simulating, allocate already recorded payments against the schedule and move unpaid past obligations to the forecast start date. Zero-interest family loans use the same code with rate zero. Interest already paid is not included in future interest savings. Completed plans return exact days saved and whole calendar months saved; incomplete plans return null savings.

**Snowball/avalanche:** at each date in the combined event calendar, pay scheduled minimums first. Apply the declared `extra_per_event` and any unused minimum to the smallest principal (snowball) or highest annual rate (avalanche), breaking ties deterministically. Both scenarios use the same event calendar and money budget. This API explicitly uses extra **per event**, not per month: weekly loans create more events. To offer a fixed monthly household budget, add that separate funding convention rather than relabeling this input. Estimates are limited by the supplied schedules; no hidden infinite extension is assumed.

**Edges:** leap years under ACT/365F still use 365 in the denominator; no compound interest, fees or penalties are inferred. Detect insufficient schedules and do not claim a payoff. Reject invalid dates, duplicate custom dates, zero payments, excessive schedule lengths, backdated accrual and overflow. Preserve inputs during simulations.

**Code:** [loans.ts](../src/core/loans.ts), planner routes in [app.ts](../src/server/app.ts). **Tests:** `loan schedules and payment allocation` in [core.test.ts](../tests/core.test.ts).

## 4. Record a loan payment

**Idea:** recording the payment, reducing the debt and recording money leaving the wallet are one event. Either all of them happen or none happen.

```text
BEGIN
  acquire user transaction lock and SELECT loan FOR UPDATE
  verify token owner, loan version, wallet/category, date and idempotency key
  accrue interest through the actual payment date
  reject amount greater than settlement; never silently change an entered amount
  allocate payment to interest, then principal
  insert loan_payment and linked expense using client-created IDs
  update loan remainder/accrual date; mark paid only at exact settlement
  evaluate budget events; save sync receipt and change events
COMMIT
```

**Edges:** early means before the scheduled due date, not necessarily backdated relative to prior posted payments. Late payments accrue more actual-day interest. Partial payments can pay only interest. Extra payments reduce principal after interest. Overpayment is rejected for user review; no phantom refund is created. Future payments are rejected. A payment dated before the last accrual is rejected with `BACKDATED_PAYMENT_REQUIRES_REPLAY`: safe historical re-amortization is an explicit future correction operation, not a silently approximate edit. Linked payment/transfer ledger rows cannot be edited or deleted independently.

**Code:** `splitPayment` and `recordPayment`. **Tests:** unit allocation cases, atomic sync/payment tests, real PostgreSQL simultaneous-payment and rollback tests. A stale second payment is preserved as a conflict rather than applied twice.

## 5. Study streak

**Idea:** a qualifying day has at least the configured number of study minutes. Today can still qualify until local midnight, so yesterday’s streak stays alive while today is unfinished.

```text
split each completed session at actual local midnights in the user's IANA timezone
sum seconds per day, then floor to completed minutes
day = local today
if today's minutes < minimum: day = yesterday
while day qualifies: streak += 1; day -= one calendar day
```

**Edges:** year/month transitions, 23-hour and 25-hour daylight-saving days, UTC/local-date disagreement, sessions crossing midnight, deleted sessions, sessions shorter than the daily minimum. Only completed sessions are posted. The current preference timezone reinterprets historical instants consistently; freezing a separate historical travel timezone per session would be a different product rule.

**Code:** [study.ts](../src/core/study.ts), date helpers using Temporal in [dates.ts](../src/core/dates.ts). **Tests:** `study dates and streaks`, including Kigali midnight, Los Angeles date boundary and New York DST transitions.

## 6. Offline-first sync

**Idea:** each offline user action becomes an immutable command with a client UUID. A receipt makes retries safe. A per-user change sequence makes pull incremental without trusting clocks.

```text
phone exclusive transaction: change local rows + append immutable outbox command
push each command:
  BEGIN and lock user
  if receipt exists: same hash → return previous outcome; different hash → reject
  validate table, fields, token-derived ownership and references
  if stale: notes/settings overwrite by server arrival; other rows preserve conflict
  otherwise apply operation and append commit-ordered change records
  persist outcome receipt; COMMIT
phone: acknowledge only accepted op ID + revision + exact payload
pull: owner changes with sequence > cursor, ordered, limited
phone exclusive transaction: apply rows or store shadows; save cursor with them
```

**Edges:** retry after timeout, duplicate batch, reused UUID with changed content, table/column injection, cross-user IDs, missing dependencies, edits during an in-flight request, partial accepted batches, rejected rows, deleted rows and multiple devices. Client queue order is assigned transactionally, not by random UUID or tied timestamps. A newer local edit is never cleared by an older acknowledgment. Conflicts are distinct from accepted rows.

The sequence counter is updated while holding the user transaction lock. An ordinary global `BIGSERIAL` alone is insufficient: a lower-numbered uncommitted transaction could otherwise commit after the phone passed a higher cursor. Tombstones and change history are retained; there is no unsafe automatic tombstone garbage collection.

Financial conflicts store the server snapshot and complete incoming command in `sync_conflict`. User choice is another idempotent command. Client choice rechecks the latest version. Loan payment conflicts require review and a fresh payment command rather than applying an old split to a changed loan. Conflict copies do **not** enter the ledger as extra spending.

**Code:** [sync.ts](../src/server/sync.ts), [store.ts](../src/server/store.ts), [local.ts](../src/mobile/local.ts). **Tests:** all sync tests, real SQLite shadow/dirty/cursor tests, PostgreSQL commit-order and ownership cases.

## 7. Home dashboard

**Idea:** collect the few tables needed in parallel and calculate the four headline values in one shared pure function. The phone runs it over SQLite; the API runs it over canonical server rows.

```text
parallel read sessions, entries, budgets, loans, payments
today = now in user timezone
minutes = today's study minutes
budget left = monthly category limits - spending in those budgeted categories
next payment = oldest unpaid scheduled obligation, accounting for partials
return minutes, budget left, next payment, streak
```

**Edges:** no budget, no loan, overdue obligation, paid loan, partial installment, unscheduled residual loan balance, deleted rows, offline pending records. Uncategorized/unbudgeted expenses appear in total spending but do not reduce the sum of category budgets; the UI should explain this. Parallel promises share a PostgreSQL transaction/connection for a consistent view; this is not a claim of parallel SQL execution on a single connection.

**Code:** [core/dashboard.ts](../src/core/dashboard.ts), [mobile/dashboard.ts](../src/mobile/dashboard.ts), server queries. **Tests:** dashboard in [jobs.test.ts](../tests/jobs.test.ts); the common core prevents server/mobile formula drift.

## 8. Reminders

**Idea:** a minutely cron tick creates durable occurrences, then claims work with a lease before calling Expo outside the database transaction. A unique occurrence key prevents duplicate enqueueing.

```text
for enabled reminder and device:
  determine today's occurrence in reminder timezone
  loan/bill: only 3 days before, 1 day before, or due day
  study: daily at configured local time
  if not already logged: insert pending occurrence
claim due unexpired work under lock with a two-minute lease
outside transaction: send push or request its receipt
update ticket/delivery status if still holding the same claim version
on transient failure: exponential backoff with a bounded attempt count
```

**Edges:** quiet hours crossing midnight, daytime quiet hours, disabled reminder/device, no push opt-in, provider timeout, expired reminder, process crash, overlapping workers, device-unregistered errors and receipt polling. Bill reminders currently represent explicit due dates; recurring bill instances should be created as dated reminders. Local study timers and optional offline device notifications can coexist, but use one chosen channel per occurrence to avoid duplicate local/server alerts.

There is **no exactly-once guarantee across a database and an external push provider**. If a process dies after Expo accepts the push but before the ticket is saved, retry may deliver twice. Leases/unique keys prevent normal duplicates; exact external delivery requires provider idempotency, which this interface does not claim. A push receipt means downstream provider acceptance, not that the user read or even saw it. Messages omit financial amounts for lock-screen privacy.

**Code:** [core/reminders.ts](../src/core/reminders.ts), [server/reminders.ts](../src/server/reminders.ts). **Tests:** dates/quiet-hour cases plus durable deduplication, lease, failure and invalid-device tests in jobs tests.

## 9. Weekly review without AI

**Idea:** take two adjacent Monday-based calendar weeks in the user’s timezone. Summarize the same recorded facts each time, then apply a few readable rules.

```text
current = [Monday, following Monday); previous = preceding seven calendar days
sum study minutes per skill for current week
sum income/expense separately for each week; omit transfers
sum loan-payment principal for current week
if prior spending > 0 and current * 100 > prior * 120: show spending-up insight
if prior spending is zero: show a plain no-baseline message, not infinity percent
```

**Edges:** year boundaries, sessions crossing week boundaries, exactly 20% increase, no prior spending, no data, tombstones and interest/principal separation. A current-week review is week-to-date; comparing it with a complete previous week is labeled accordingly in the eventual UI. It is not a forecast of the rest of the week.

**Code:** [reports.ts](../src/core/reports.ts). **Tests:** current/prior week, transfer exclusion, zero baseline, exact threshold and principal-paid cases.

## 10. Phase 2: net worth and skill ROI

**Idea:** net worth is recorded assets minus outstanding debt. Skill ROI uses actual linked cash entries, keeping time separate from money.

```text
daily snapshot:
  assets = sum derived wallet balances
  liabilities = loan principal + accrued unpaid interest at snapshot date
  net = assets - liabilities
  upsert one user/day snapshot
skill ROI:
  cost = linked actual expenses; income = linked attributed income
  net = income - cost
  ROI basis points = net * 10,000 / cost, or null if cost is zero
  study time = sum completed minutes, without inventing an hourly cash value
```

**Edges:** negative net worth, zero-cost skill, no attributed income, an entered course price that was never paid, deleted transactions and transfers. Do not count both the skill’s course-cost metadata and its actual linked expense. ROI may be negative; integer basis points avoid floating money math.

The daily job stores observed canonical state near the end of the local day; it cannot see unsynced phone records. Server downtime can miss a snapshot. Historical backfill/revisions after late offline sync require an explicit reconstruction job before using the chart as restated historical accounting. The snapshot timestamp (`updated_at`) makes this limit visible. The current asset model covers wallets; investments/property need additional asset records later.

**Code:** reports functions and `snapshot` in [queries.ts](../src/server/queries.ts). **Tests:** negative worth, precision above JavaScript’s safe integer range, daily upsert and zero-cost ROI in core/jobs tests.
