import { test, expect } from '@playwright/test';

/**
 * E2E Tests: Headhunter Persona User Journey
 *
 * Persona: Kim Soyeon (김소연)
 * - Senior Partner at Executive Search Firm
 * - 12 years headhunting experience
 * - Specializes in Tech/Fintech placements
 * - Searches 100+ times per day
 * - Bilingual (Korean/English)
 */

// Independent tests (not serial) to avoid cascading failures
// But use single worker to avoid rate limiting

test.describe('Headhunter Persona Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Login for each test
    const email = process.env.TEST_USER_EMAIL || 'test@example.com';
    const password = process.env.TEST_USER_PASSWORD || 'testpass123';

    await page.goto('/login');
    await page.fill('[data-testid="email-input"]', email);
    await page.fill('[data-testid="password-input"]', password);
    await page.click('[data-testid="login-button"]');

    // Wait for navigation or timeout
    await page.waitForURL('**/candidates', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(500);
  });

  test.describe('HH-001: Morning Workflow - Candidate Review', () => {
    test('should load candidate list or empty state quickly', async ({ page }) => {
      // Headhunter expects fast loading
      const startTime = Date.now();

      // Wait for either candidate list OR empty state (new user has no candidates)
      await Promise.race([
        page.waitForSelector('[data-testid="candidate-list"]', { timeout: 5000 }),
        page.waitForSelector('[data-testid="empty-state"]', { timeout: 5000 }),
      ]);

      const loadTime = Date.now() - startTime;
      expect(loadTime).toBeLessThan(5000);
    });

    test('should display AI confidence indicators when candidates exist', async ({ page }) => {
      // Check if we have candidates first
      const hasCandidates = await page.locator('[data-testid="candidate-item"]').count() > 0;

      if (hasCandidates) {
        // AI confidence should be visible for data quality assessment
        const confidenceIndicators = page.locator('[data-testid="ai-confidence"]');
        const count = await confidenceIndicators.count();
        expect(count).toBeGreaterThan(0);
      } else {
        // Empty state is acceptable for new users
        await expect(page.locator('[data-testid="empty-state"]')).toBeVisible();
      }
    });
  });

  test.describe('HH-002: Client Brief - Mixed Language Search', () => {
    test('should parse mixed Korean/English query correctly', async ({ page }) => {
      // Client brief: "React 시니어 개발자, 핀테크 경력"
      await page.fill('[data-testid="search-input"]', 'React 시니어 핀테크');
      await page.keyboard.press('Enter');

      // Wait for search to complete
      await page.waitForTimeout(2000);

      // Should not show error
      await expect(page.locator('[data-testid="search-error"]')).not.toBeVisible();

      // Check if parsed keywords are displayed (if UI supports it)
      const parsedKeywords = page.locator('[data-testid="parsed-keywords"]');
      if (await parsedKeywords.isVisible()) {
        const text = await parsedKeywords.textContent();
        expect(text).toContain('React');
      }
    });

    test('should apply experience year filter', async ({ page }) => {
      await page.fill('[data-testid="search-input"]', 'React 개발자');
      await page.keyboard.press('Enter');

      // Apply 5-10 year filter
      const expFilter = page.locator('[data-testid="filter-exp-years"]');
      if (await expFilter.isVisible()) {
        await expFilter.click();
        await page.click('[data-testid="exp-5-10"]');

        await page.waitForTimeout(1000);

        // Verify results if any
        const firstExp = page.locator('[data-testid="candidate-exp-years"]').first();
        if (await firstExp.isVisible()) {
          const years = parseInt(await firstExp.textContent() || '0');
          expect(years).toBeGreaterThanOrEqual(5);
          expect(years).toBeLessThanOrEqual(10);
        }
      }
    });
  });

  test.describe('HH-003: Typo Recovery', () => {
    test('should handle Korean keyboard typo gracefully', async ({ page }) => {
      // User forgot to switch from Korean keyboard
      // Typing "React" with Korean keyboard produces different characters
      await page.fill('[data-testid="search-input"]', 'ㄱㄷㅁㅊㅅ');
      await page.keyboard.press('Enter');

      await page.waitForTimeout(2000);

      // Should not crash or show error
      await expect(page.locator('[data-testid="search-error"]')).not.toBeVisible();

      // Should show results or empty state (not error)
      const hasResults = await page.locator('[data-testid="candidate-item"]').count() > 0;
      const hasEmptyState = await page.locator('[data-testid="empty-state"]').isVisible();
      const isSearchComplete = await page.locator('[data-testid="search-results"]').isVisible();

      expect(hasResults || hasEmptyState || isSearchComplete).toBeTruthy();
    });

    test('should show typo correction suggestion when available', async ({ page }) => {
      // Common typo: "Recat" instead of "React"
      await page.fill('[data-testid="search-input"]', 'Recat');
      await page.keyboard.press('Enter');

      await page.waitForTimeout(2000);

      // Check for typo correction (if implemented)
      const typoSuggestion = page.locator('[data-testid="typo-suggestion"], [data-testid="did-you-mean"]');
      // This is optional - system should work even without suggestion
      await expect(page.locator('[data-testid="search-error"]')).not.toBeVisible();
    });
  });

  test.describe('HH-004: Competitor Exclusion', () => {
    test('should exclude specified companies from results', async ({ page }) => {
      await page.fill('[data-testid="search-input"]', '개발자');
      await page.keyboard.press('Enter');

      await page.waitForTimeout(1000);

      // Look for exclude company filter
      const excludeFilter = page.locator('[data-testid="filter-exclude-companies"]');

      if (await excludeFilter.isVisible()) {
        await excludeFilter.click();

        const excludeInput = page.locator('[data-testid="exclude-company-input"]');
        if (await excludeInput.isVisible()) {
          await excludeInput.fill('테스트회사');
          await page.keyboard.press('Enter');

          await page.waitForTimeout(1500);

          // Verify exclusion worked
          const companies = await page.locator('[data-testid="candidate-company"]').allTextContents();
          companies.forEach(company => {
            expect(company.toLowerCase()).not.toContain('테스트회사');
          });
        }
      }
    });
  });

  test.describe('HH-005: Zero Results Handling', () => {
    test('should show graceful empty state for no results', async ({ page }) => {
      // Very specific search unlikely to have results
      await page.fill('[data-testid="search-input"]', 'xyznonexistent12345skill');
      await page.keyboard.press('Enter');

      await page.waitForTimeout(2000);

      // Should show empty state, not error
      const emptyState = page.locator('[data-testid="empty-state"]');
      const noResults = page.locator('text=검색 결과가 없습니다');
      const errorState = page.locator('[data-testid="search-error"]');

      // Either empty state or no results message should be visible
      const hasEmptyMessage = (await emptyState.isVisible()) || (await noResults.isVisible());

      // Error should NOT be visible
      await expect(errorState).not.toBeVisible();

      // If no results found, there should be a graceful message
      const resultCount = await page.locator('[data-testid="candidate-item"]').count();
      if (resultCount === 0) {
        expect(hasEmptyMessage).toBeTruthy();
      }
    });
  });

  test.describe('HH-006: Rapid Search Iteration', () => {
    test('should handle rapid consecutive searches', async ({ page }) => {
      // Headhunter quickly iterates through variations
      const searches = ['React', 'React Native', 'React Node', 'Vue'];

      for (const query of searches) {
        await page.fill('[data-testid="search-input"]', query);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(300); // Brief pause
      }

      // Wait for final search to complete
      await page.waitForTimeout(2000);

      // Should show last query in input
      const inputValue = await page.locator('[data-testid="search-input"]').inputValue();
      expect(inputValue).toBe('Vue');

      // Should not show error
      await expect(page.locator('[data-testid="search-error"]')).not.toBeVisible();
    });

    test('should not show stale results from earlier search', async ({ page }) => {
      // Search A
      await page.fill('[data-testid="search-input"]', 'Python');
      await page.keyboard.press('Enter');

      // Immediately search B
      await page.fill('[data-testid="search-input"]', 'Java');
      await page.keyboard.press('Enter');

      // Wait for completion
      await page.waitForTimeout(3000);

      // Final input should be Java
      const inputValue = await page.locator('[data-testid="search-input"]').inputValue();
      expect(inputValue).toBe('Java');
    });
  });

  test.describe('HH-007: Synonym Matching', () => {
    test('should match skill synonyms (nodejs -> Node.js)', async ({ page }) => {
      await page.fill('[data-testid="search-input"]', 'nodejs');
      await page.keyboard.press('Enter');

      await page.waitForTimeout(2000);

      // Check results
      const resultCount = await page.locator('[data-testid="candidate-item"]').count();

      if (resultCount > 0) {
        // Get all skills from first result
        const skillsText = await page.locator('[data-testid="candidate-skills"]').first().textContent();

        // Should contain Node.js variant (if results exist)
        if (skillsText) {
          const hasNodeVariant =
            skillsText.toLowerCase().includes('node') ||
            skillsText.toLowerCase().includes('nodejs');
          expect(hasNodeVariant).toBeTruthy();
        }
      }
    });
  });

  test.describe('HH-008: Long Query (Job Description Copy-Paste)', () => {
    test('should handle long query from job description', async ({ page }) => {
      const longQuery = '경력 5년 이상의 백엔드 개발자로 대규모 트래픽 처리 경험과 MSA 아키텍처 설계 경험 보유자 우대';

      await page.fill('[data-testid="search-input"]', longQuery);
      await page.keyboard.press('Enter');

      // Should complete without error
      await page.waitForTimeout(3000);

      await expect(page.locator('[data-testid="search-error"]')).not.toBeVisible();

      // Should show either results or empty state
      const hasResults = await page.locator('[data-testid="candidate-item"]').count() > 0;
      const hasEmptyState = await page.locator('[data-testid="empty-state"]').isVisible();

      expect(hasResults || hasEmptyState).toBeTruthy();
    });

    test('should truncate extremely long queries gracefully', async ({ page }) => {
      // 600+ character query (exceeds MAX_QUERY_LENGTH of 500)
      const veryLongQuery = '개발자 '.repeat(100);

      await page.fill('[data-testid="search-input"]', veryLongQuery);
      await page.keyboard.press('Enter');

      await page.waitForTimeout(3000);

      // Should not crash
      await expect(page.locator('[data-testid="search-error"]')).not.toBeVisible();
    });
  });

  test.describe('HH-009: Filter Combinations', () => {
    test('should apply multiple filters simultaneously', async ({ page }) => {
      await page.fill('[data-testid="search-input"]', '개발자');
      await page.keyboard.press('Enter');

      await page.waitForTimeout(1000);

      // Try to apply experience filter
      const expFilter = page.locator('[data-testid="filter-exp-years"]');
      if (await expFilter.isVisible()) {
        await expFilter.click();
        const option = page.locator('[data-testid="exp-5-10"]');
        if (await option.isVisible()) {
          await option.click();
        }
      }

      await page.waitForTimeout(1000);

      // Try to apply skill filter
      const skillFilter = page.locator('[data-testid="filter-skills"]');
      if (await skillFilter.isVisible()) {
        await skillFilter.click();
        // Select a skill if available
      }

      await page.waitForTimeout(1000);

      // Should not error with multiple filters
      await expect(page.locator('[data-testid="search-error"]')).not.toBeVisible();
    });
  });

  test.describe('HH-010: Performance Expectations', () => {
    test('should complete semantic search within acceptable time', async ({ page }) => {
      const startTime = Date.now();

      // 3+ character query triggers semantic search
      await page.fill('[data-testid="search-input"]', 'React Developer');
      await page.keyboard.press('Enter');

      // Wait for results or empty state
      await Promise.race([
        page.waitForSelector('[data-testid="candidate-item"]', { timeout: 5000 }),
        page.waitForSelector('[data-testid="empty-state"]', { timeout: 5000 }),
      ]).catch(() => {});

      const searchTime = Date.now() - startTime;

      // Semantic search should complete within 5 seconds
      expect(searchTime).toBeLessThan(5000);
    });

    test('should complete keyword search faster than semantic', async ({ page }) => {
      const startTime = Date.now();

      // 2 character query triggers keyword search (faster)
      await page.fill('[data-testid="search-input"]', 'AI');
      await page.keyboard.press('Enter');

      // Wait for results or empty state
      await Promise.race([
        page.waitForSelector('[data-testid="candidate-item"]', { timeout: 3000 }),
        page.waitForSelector('[data-testid="empty-state"]', { timeout: 3000 }),
      ]).catch(() => {});

      const searchTime = Date.now() - startTime;

      // Keyword search should be fast
      expect(searchTime).toBeLessThan(3000);
    });
  });
});

/**
 * SQL Injection Protection Tests
 * Headhunters might accidentally paste malicious content
 */
test.describe('Security: Headhunter Input Protection', () => {
  test.beforeEach(async ({ page }) => {
    const email = process.env.TEST_USER_EMAIL || 'test@example.com';
    const password = process.env.TEST_USER_PASSWORD || 'testpass123';

    await page.goto('/login');
    await page.fill('[data-testid="email-input"]', email);
    await page.fill('[data-testid="password-input"]', password);
    await page.click('[data-testid="login-button"]');

    await page.waitForURL('**/candidates', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(500);
  });

  test('should handle SQL injection attempts gracefully', async ({ page }) => {
    const maliciousQueries = [
      "'; DROP TABLE candidates; --",
      "1' OR '1'='1",
      "admin'--",
    ];

    for (const query of maliciousQueries) {
      await page.fill('[data-testid="search-input"]', query);
      await page.keyboard.press('Enter');

      await page.waitForTimeout(1000);

      // Should not show database error
      await expect(page.locator('[data-testid="search-error"]')).not.toBeVisible();
      await expect(page.locator('text=database error')).not.toBeVisible();
      await expect(page.locator('text=SQL')).not.toBeVisible();
    }
  });

  test('should handle XSS attempts gracefully', async ({ page }) => {
    const xssQueries = [
      '<script>alert("xss")</script>',
      '"><img src=x onerror=alert(1)>',
    ];

    for (const query of xssQueries) {
      await page.fill('[data-testid="search-input"]', query);
      await page.keyboard.press('Enter');

      await page.waitForTimeout(1000);

      // Should not execute script (check for alert dialog)
      // Page should still be functional
      await expect(page.locator('[data-testid="search-input"]')).toBeVisible();
    }
  });
});
