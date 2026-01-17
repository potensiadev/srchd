# SRCHD E2E Test Suite

Comprehensive end-to-end tests for the SRCHD SaaS application using Playwright.

## Test Coverage

| Module | File | Core Tests | Edge Cases |
|--------|------|------------|------------|
| Authentication | `auth.spec.ts` | 10 | 10 |
| Candidates | `candidates.spec.ts` | 15 | 10 |
| Positions | `positions.spec.ts` | 15 | 10 |
| Upload | `upload.comprehensive.spec.ts` | 15 | 10 |
| Analytics | `analytics.spec.ts` | 10 | 10 |
| Settings | `settings.spec.ts` | 15 | 10 |

**Total: 140+ test cases**

## Quick Start

```bash
# Install Playwright browsers
npx playwright install

# Run all E2E tests
npm run e2e

# Run with UI (visual test runner)
npm run e2e:ui

# Run specific module
npm run e2e:auth
npm run e2e:candidates
npm run e2e:positions
npm run e2e:upload
npm run e2e:analytics
npm run e2e:settings
```

## Environment Setup

Create `.env.test` in the project root:

```env
# Test Base URL
TEST_BASE_URL=http://localhost:3005

# Supabase (required for auth)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Test User
TEST_USER_EMAIL=test@example.com
```

## Running Tests

### All Tests (Headless)
```bash
npm run e2e
```

### Headed Mode (Visual)
```bash
npm run e2e:headed
```

### Debug Mode
```bash
npm run e2e:debug
```

### Specific Browser
```bash
npm run e2e:chromium
npm run e2e:firefox
npm run e2e:webkit
```

### Mobile Viewports
```bash
npm run e2e:mobile
```

### View Report
```bash
npm run e2e:report
```

## Test Structure

```
tests/
├── e2e/
│   ├── fixtures/
│   │   └── index.ts          # Page objects, helpers, test data
│   ├── auth.setup.ts         # Authentication setup
│   ├── auth.spec.ts          # Auth tests
│   ├── candidates.spec.ts    # Candidates tests
│   ├── positions.spec.ts     # Positions tests
│   ├── upload.comprehensive.spec.ts  # Upload tests
│   ├── analytics.spec.ts     # Analytics tests
│   ├── settings.spec.ts      # Settings tests
│   └── README.md             # This file
├── fixtures/                 # Test data files
└── .auth/
    └── user.json             # Saved auth state
```

## Page Objects

Page objects are defined in `fixtures/index.ts`:

- `AuthPage` - Login, signup, consent flows
- `CandidatesPage` - Candidate list, search, filters
- `CandidateDetailPage` - Individual candidate view
- `PositionsPage` - Position list
- `PositionFormPage` - Create/edit position
- `PositionDetailPage` - Position detail with matches
- `AnalyticsPage` - Dashboard metrics
- `SettingsPage` - Profile, subscription

## Writing Tests

### Using Page Objects

```typescript
import { test, expect } from "./fixtures";

test("search for candidates", async ({ candidatesPage }) => {
  await candidatesPage.goto();
  await candidatesPage.search("React");

  const count = await candidatesPage.getCandidateCount();
  expect(count).toBeGreaterThan(0);
});
```

### Using Helpers

```typescript
import { helpers } from "./fixtures";

test("wait for toast", async ({ page }) => {
  // ... perform action
  await helpers.waitForToast(page, "Success");
});
```

### Mocking API

```typescript
test("handle API error", async ({ page }) => {
  await page.route("**/api/candidates**", (route) => {
    route.fulfill({
      status: 500,
      json: { error: "Server error" },
    });
  });

  // Test error handling
});
```

## Test Data

Test data generators in `fixtures/index.ts`:

```typescript
import { TestData } from "./fixtures";

// Valid position data
TestData.positions.valid

// Invalid position data (for validation tests)
TestData.positions.invalid.noTitle

// Search queries (including XSS, SQL injection)
TestData.candidates.searchQueries.sqlInjection
```

## CI/CD Integration

Tests are configured to run in CI with:
- Single worker (sequential execution)
- 2 retries on failure
- JSON + HTML reports

GitHub Actions example:

```yaml
- name: Install Playwright
  run: npx playwright install --with-deps

- name: Run E2E Tests
  run: npm run e2e
  env:
    CI: true
    TEST_BASE_URL: ${{ secrets.TEST_URL }}
```

## Debugging

### Interactive Debug Mode
```bash
npm run e2e:debug
```

### UI Mode
```bash
npm run e2e:ui
```

### Screenshots on Failure
Screenshots are automatically captured on test failure and saved to `test-results/`.

### Traces
Traces are recorded on first retry and can be viewed with:
```bash
npx playwright show-trace test-results/trace.zip
```

## Best Practices

1. **Use Page Objects** - Keep selectors centralized
2. **Wait Properly** - Use `waitForLoadState` or `expect` with timeouts
3. **Mock External APIs** - Use `page.route()` for predictable tests
4. **Clean State** - Each test should be independent
5. **Readable Assertions** - Use descriptive `expect` messages

## Troubleshooting

### Tests Fail on First Run
```bash
# Ensure auth setup runs first
npx playwright test --project=setup
```

### Timeout Issues
Increase timeouts in `playwright.config.ts`:
```typescript
timeout: 60000,
expect: { timeout: 10000 },
```

### Browser Not Found
```bash
npx playwright install
```

### Port Already in Use
```bash
# Kill process on port 3005
npx kill-port 3005
```
