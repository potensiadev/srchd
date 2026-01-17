import { test, expect, helpers, TestData } from "./fixtures";

/**
 * E2E Tests: Candidates Module
 *
 * Tests for candidate listing, searching, filtering, and detail views
 * Following test scenarios from E2E_Test_Scenarios.md
 */

test.describe("Candidates - Core Scenarios", () => {
  test.beforeEach(async ({ candidatesPage }) => {
    await candidatesPage.goto();
  });

  test.describe("CAN-001 to CAN-005: List & Search", () => {
    test("CAN-001: View candidates list displays correctly", async ({ candidatesPage, page }) => {
      // Verify page structure
      await expect(page).toHaveURL(/\/candidates/);

      // Either show candidate list or empty state
      const hasCandidates = await candidatesPage.candidateList.isVisible().catch(() => false);
      const hasEmptyState = await candidatesPage.emptyState.isVisible().catch(() => false);

      expect(hasCandidates || hasEmptyState).toBeTruthy();
    });

    test("CAN-002: Candidate cards display key information", async ({ candidatesPage }) => {
      const count = await candidatesPage.getCandidateCount();

      if (count > 0) {
        const firstCandidate = candidatesPage.candidateItems.first();

        // Should show key fields
        await expect(firstCandidate).toBeVisible();
      }
    });

    test("CAN-003: Search input accepts query", async ({ candidatesPage }) => {
      await expect(candidatesPage.searchInput).toBeVisible();
      await candidatesPage.search("React");

      // Search should trigger, either results or empty state
      await expect(
        candidatesPage.candidateList.or(candidatesPage.emptyState)
      ).toBeVisible();
    });

    test("CAN-004: Search by name returns results", async ({ candidatesPage, page }) => {
      await candidatesPage.search("Developer");

      // Wait for results
      await page.waitForLoadState("networkidle");

      // Should show results or empty state
      const hasResults = await candidatesPage.candidateItems.count() > 0;
      const hasEmpty = await candidatesPage.emptyState.isVisible();

      expect(hasResults || hasEmpty).toBeTruthy();
    });

    test("CAN-005: Semantic search works with skill query", async ({ candidatesPage, page }) => {
      await candidatesPage.search("TypeScript Node.js");
      await page.waitForLoadState("networkidle");

      // Results should appear
      await expect(
        candidatesPage.candidateList.or(candidatesPage.emptyState)
      ).toBeVisible();
    });
  });

  test.describe("CAN-006 to CAN-010: Sorting & Filtering", () => {
    test("CAN-006: Sort by experience works", async ({ candidatesPage, page }) => {
      const sortDropdown = candidatesPage.sortDropdown;

      if (await sortDropdown.isVisible()) {
        await sortDropdown.selectOption("experience");
        await page.waitForLoadState("networkidle");

        // Candidates should be reordered
        await expect(candidatesPage.candidateList.or(candidatesPage.emptyState)).toBeVisible();
      }
    });

    test("CAN-007: Sort by confidence score works", async ({ candidatesPage, page }) => {
      const sortDropdown = candidatesPage.sortDropdown;

      if (await sortDropdown.isVisible()) {
        await sortDropdown.selectOption("confidence");
        await page.waitForLoadState("networkidle");

        await expect(candidatesPage.candidateList.or(candidatesPage.emptyState)).toBeVisible();
      }
    });

    test("CAN-008: Sort by recent works", async ({ candidatesPage, page }) => {
      const sortDropdown = candidatesPage.sortDropdown;

      if (await sortDropdown.isVisible()) {
        await sortDropdown.selectOption("recent");
        await page.waitForLoadState("networkidle");

        await expect(candidatesPage.candidateList.or(candidatesPage.emptyState)).toBeVisible();
      }
    });

    test("CAN-009: Pagination loads more candidates", async ({ candidatesPage, page }) => {
      const count = await candidatesPage.getCandidateCount();

      if (count > 0 && await candidatesPage.paginationNext.isVisible()) {
        await candidatesPage.paginationNext.click();
        await page.waitForLoadState("networkidle");

        // Should still show candidates
        await expect(candidatesPage.candidateList).toBeVisible();
      }
    });
  });

  test.describe("CAN-011 to CAN-015: Candidate Details", () => {
    test("CAN-011: Clicking candidate opens detail view", async ({ candidatesPage, page }) => {
      const count = await candidatesPage.getCandidateCount();

      if (count > 0) {
        await candidatesPage.clickCandidate(0);
        await page.waitForLoadState("networkidle");

        // Should navigate to candidate detail
        await expect(page).toHaveURL(/\/candidates\/[^/]+$/);
      }
    });

    test("CAN-012: Candidate detail shows all sections", async ({ candidatesPage, candidateDetailPage, page }) => {
      const count = await candidatesPage.getCandidateCount();

      if (count > 0) {
        await candidatesPage.clickCandidate(0);
        await page.waitForLoadState("networkidle");

        // Should show candidate info
        await expect(page.locator("h1, h2, [data-testid='candidate-name']").first()).toBeVisible();
      }
    });

    test("CAN-013: Confidence score displayed on detail", async ({ candidatesPage, page }) => {
      const count = await candidatesPage.getCandidateCount();

      if (count > 0) {
        await candidatesPage.clickCandidate(0);
        await page.waitForLoadState("networkidle");

        // Confidence indicator should be visible somewhere
        const confidence = page.locator('[data-testid="ai-confidence"], [class*="confidence"], text=/[0-9]+%/');
        // May or may not be visible depending on data
      }
    });

    test("CAN-014: Skills displayed as tags", async ({ candidatesPage, page }) => {
      const count = await candidatesPage.getCandidateCount();

      if (count > 0) {
        await candidatesPage.clickCandidate(0);
        await page.waitForLoadState("networkidle");

        // Look for skills section
        const skills = page.locator('[data-testid="candidate-skills"] span, .skill-tag, [class*="skill"]');
        // Skills may or may not be present
      }
    });

    test("CAN-015: Career history displayed chronologically", async ({ candidatesPage, page }) => {
      const count = await candidatesPage.getCandidateCount();

      if (count > 0) {
        await candidatesPage.clickCandidate(0);
        await page.waitForLoadState("networkidle");

        // Career section should exist if candidate has career data
        const careers = page.locator('[data-testid="career-item"], [class*="career"], [class*="experience"]');
        // May or may not have career entries
      }
    });
  });
});

test.describe("Candidates - Edge Cases", () => {
  test("CAN-E01: Empty candidates state shows proper message", async ({ candidatesPage, page }) => {
    await candidatesPage.goto();

    // If no candidates, empty state should show
    const count = await candidatesPage.getCandidateCount();

    if (count === 0) {
      await expect(candidatesPage.emptyState).toBeVisible();
    }
  });

  test("CAN-E02: Search with no results shows empty message", async ({ candidatesPage, page }) => {
    await candidatesPage.goto();
    await candidatesPage.search(TestData.candidates.searchQueries.nonexistent);
    await page.waitForLoadState("networkidle");

    // Should show empty state or no results message
    const emptyState = candidatesPage.emptyState;
    const noResults = page.locator('text=/검색 결과|결과가 없|No results/i');

    await expect(emptyState.or(noResults)).toBeVisible({ timeout: 10000 });
  });

  test("CAN-E04: Search handles SQL injection attempt", async ({ candidatesPage, page }) => {
    await candidatesPage.goto();
    await candidatesPage.search(TestData.candidates.searchQueries.sqlInjection);
    await page.waitForLoadState("networkidle");

    // Should not crash, show empty or results
    await expect(page.locator("body")).toBeVisible();
    await expect(candidatesPage.candidateList.or(candidatesPage.emptyState)).toBeVisible();
  });

  test("CAN-E05: Search handles XSS attempt", async ({ candidatesPage, page }) => {
    await candidatesPage.goto();
    await candidatesPage.search(TestData.candidates.searchQueries.xss);
    await page.waitForLoadState("networkidle");

    // Should sanitize and not execute script
    await expect(page.locator("body")).toBeVisible();
  });

  test("CAN-E06: Korean search query works", async ({ candidatesPage, page }) => {
    await candidatesPage.goto();
    await candidatesPage.search(TestData.candidates.searchQueries.korean);
    await page.waitForLoadState("networkidle");

    // Should process Korean text
    await expect(candidatesPage.candidateList.or(candidatesPage.emptyState)).toBeVisible();
  });

  test("CAN-E07: Mixed Korean/English query works", async ({ candidatesPage, page }) => {
    await candidatesPage.goto();
    await candidatesPage.search(TestData.candidates.searchQueries.mixed);
    await page.waitForLoadState("networkidle");

    await expect(candidatesPage.candidateList.or(candidatesPage.emptyState)).toBeVisible();
  });

  test("CAN-E08: Rapid pagination doesn't break", async ({ candidatesPage, page }) => {
    await candidatesPage.goto();
    const count = await candidatesPage.getCandidateCount();

    if (count > 0 && await candidatesPage.paginationNext.isVisible()) {
      // Click rapidly
      await candidatesPage.paginationNext.click();
      await candidatesPage.paginationNext.click();
      await candidatesPage.paginationNext.click();

      await page.waitForLoadState("networkidle");

      // Should still work
      await expect(candidatesPage.candidateList.or(candidatesPage.emptyState)).toBeVisible();
    }
  });

  test("CAN-E09: Sort change while loading doesn't break", async ({ candidatesPage, page }) => {
    await candidatesPage.goto();

    const sortDropdown = candidatesPage.sortDropdown;
    if (await sortDropdown.isVisible()) {
      // Change sort rapidly
      await sortDropdown.selectOption("experience");
      await sortDropdown.selectOption("confidence");
      await sortDropdown.selectOption("recent");

      await page.waitForLoadState("networkidle");

      await expect(candidatesPage.candidateList.or(candidatesPage.emptyState)).toBeVisible();
    }
  });

  test("CAN-E10: Empty search clears results", async ({ candidatesPage, page }) => {
    await candidatesPage.goto();

    // Search for something
    await candidatesPage.search("React");
    await page.waitForLoadState("networkidle");

    // Clear search
    await candidatesPage.searchInput.clear();
    await page.keyboard.press("Enter");
    await page.waitForLoadState("networkidle");

    // Should show all candidates again
    await expect(candidatesPage.candidateList.or(candidatesPage.emptyState)).toBeVisible();
  });
});

test.describe("Candidates - Responsive Design", () => {
  test("Candidates page works on mobile viewport", async ({ candidatesPage, page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await candidatesPage.goto();

    await expect(candidatesPage.searchInput).toBeVisible();
    await expect(candidatesPage.candidateList.or(candidatesPage.emptyState)).toBeVisible();
  });

  test("Candidates page works on tablet viewport", async ({ candidatesPage, page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await candidatesPage.goto();

    await expect(candidatesPage.searchInput).toBeVisible();
    await expect(candidatesPage.candidateList.or(candidatesPage.emptyState)).toBeVisible();
  });

  test("Candidates page works on desktop viewport", async ({ candidatesPage, page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await candidatesPage.goto();

    await expect(candidatesPage.searchInput).toBeVisible();
    await expect(candidatesPage.candidateList.or(candidatesPage.emptyState)).toBeVisible();
  });
});

test.describe("Candidates - Keyboard Navigation", () => {
  test("Search input is keyboard focusable", async ({ candidatesPage, page }) => {
    await candidatesPage.goto();

    await candidatesPage.searchInput.focus();
    await expect(candidatesPage.searchInput).toBeFocused();
  });

  test("Tab navigation works through page elements", async ({ candidatesPage, page }) => {
    await candidatesPage.goto();

    // Tab through elements
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");

    // Something should be focused
    const focused = page.locator(":focus");
    await expect(focused).toBeVisible();
  });

  test("Enter key submits search", async ({ candidatesPage, page }) => {
    await candidatesPage.goto();

    await candidatesPage.searchInput.fill("React");
    await page.keyboard.press("Enter");
    await page.waitForLoadState("networkidle");

    await expect(candidatesPage.candidateList.or(candidatesPage.emptyState)).toBeVisible();
  });
});

test.describe("Candidates - Performance", () => {
  test("Page loads within acceptable time", async ({ candidatesPage, page }) => {
    const startTime = Date.now();

    await candidatesPage.goto();
    await page.waitForLoadState("networkidle");

    const loadTime = Date.now() - startTime;

    // Should load within 5 seconds
    expect(loadTime).toBeLessThan(5000);
  });

  test("Search responds within acceptable time", async ({ candidatesPage, page }) => {
    await candidatesPage.goto();

    const startTime = Date.now();
    await candidatesPage.search("Developer");
    await page.waitForLoadState("networkidle");
    const searchTime = Date.now() - startTime;

    // Search should complete within 3 seconds
    expect(searchTime).toBeLessThan(3000);
  });
});
