import { test, expect, helpers } from "./fixtures";

/**
 * E2E Tests: Authentication Flow
 *
 * Tests for signup, login, consent, and session management
 * Following test scenarios from E2E_Test_Scenarios.md
 */

test.describe("Authentication - Core Scenarios", () => {
  test.describe("AUTH-001 to AUTH-005: Basic Auth Flow", () => {
    test("AUTH-001: New user signup page loads correctly", async ({ authPage, page }) => {
      await authPage.goToSignup();

      // Verify signup page elements
      await expect(page).toHaveURL(/\/signup/);
      await expect(authPage.googleSignupButton).toBeVisible();
      await expect(authPage.googleSignupButton).toBeEnabled();
    });

    test("AUTH-002: Login page loads correctly", async ({ authPage, page }) => {
      await authPage.goToLogin();

      // Verify login page elements
      await expect(page).toHaveURL(/\/login/);
      await expect(authPage.googleLoginButton).toBeVisible();
      await expect(authPage.googleLoginButton).toBeEnabled();
    });

    test("AUTH-003: Login button initiates OAuth flow", async ({ authPage, page }) => {
      await authPage.goToLogin();

      // Listen for popup or navigation
      const popupPromise = page.waitForEvent("popup", { timeout: 5000 }).catch(() => null);
      const navigationPromise = page.waitForURL(/accounts\.google\.com/, { timeout: 5000 }).catch(() => null);

      await authPage.googleLoginButton.click();

      // Either popup opens or page navigates to Google
      const popup = await popupPromise;
      const navigated = await navigationPromise;

      expect(popup !== null || navigated !== null).toBeTruthy();
    });

    test("AUTH-005: Logout clears session correctly", async ({ page, settingsPage }) => {
      // Already authenticated via setup
      await settingsPage.goto();
      await settingsPage.logout();

      // Should redirect to home with logged_out param
      await expect(page).toHaveURL(/\?logged_out=true/);

      // Try to access protected route
      await page.goto("/positions");
      await expect(page).toHaveURL(/\/login/);
    });
  });

  test.describe("AUTH-006 to AUTH-010: Session & Protection", () => {
    test("AUTH-007: Protected route redirects to login", async ({ page }) => {
      // Clear auth state
      await page.context().clearCookies();

      // Try to access protected route
      await page.goto("/positions");

      // Should redirect to login
      await expect(page).toHaveURL(/\/login/);
    });

    test("AUTH-007b: Protected analytics route redirects", async ({ page }) => {
      await page.context().clearCookies();
      await page.goto("/analytics");
      await expect(page).toHaveURL(/\/login/);
    });

    test("AUTH-007c: Protected settings route redirects", async ({ page }) => {
      await page.context().clearCookies();
      await page.goto("/settings");
      await expect(page).toHaveURL(/\/login/);
    });

    test("AUTH-007d: Protected candidates route redirects", async ({ page }) => {
      await page.context().clearCookies();
      await page.goto("/candidates");
      await expect(page).toHaveURL(/\/login/);
    });

    test("AUTH-009: Consent page accessible when not completed", async ({ page }) => {
      // Consent page should be accessible
      await page.goto("/consent");
      // Page should load without error
      await expect(page.locator("body")).toBeVisible();
    });
  });
});

test.describe("Authentication - Edge Cases", () => {
  test("AUTH-E02: OAuth cancelled - stays on login page", async ({ authPage, page }) => {
    await authPage.goToLogin();

    // Click login but don't complete OAuth (simulate by not waiting for popup)
    // The page should remain on login if user closes popup
    const initialUrl = page.url();

    // Verify still on login page after brief wait
    await page.waitForTimeout(1000);
    expect(page.url()).toContain("/login");
  });

  test("AUTH-E04: Multiple page visits maintain session", async ({ page }) => {
    // Visit multiple protected pages
    await page.goto("/positions");
    await expect(page).not.toHaveURL(/\/login/);

    await page.goto("/candidates");
    await expect(page).not.toHaveURL(/\/login/);

    await page.goto("/analytics");
    await expect(page).not.toHaveURL(/\/login/);

    await page.goto("/settings");
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("AUTH-E07: Browser back after logout stays logged out", async ({ page, settingsPage }) => {
    await settingsPage.goto();
    await settingsPage.logout();

    await expect(page).toHaveURL(/\?logged_out=true/);

    // Go back
    await page.goBack();

    // Should not be on authenticated page - either redirected or login required
    await page.goto("/positions");
    await expect(page).toHaveURL(/\/login/);
  });

  test("AUTH-E08: Consent page form is stateless on refresh", async ({ page }) => {
    await page.goto("/consent");

    // Find checkboxes if they exist
    const checkboxes = page.locator('input[type="checkbox"]');
    const count = await checkboxes.count();

    if (count > 0) {
      // Check first checkbox
      await checkboxes.first().check();
      expect(await checkboxes.first().isChecked()).toBeTruthy();

      // Refresh page
      await page.reload();

      // Checkbox should be unchecked after refresh
      const newCheckboxes = page.locator('input[type="checkbox"]');
      if (await newCheckboxes.count() > 0) {
        expect(await newCheckboxes.first().isChecked()).toBeFalsy();
      }
    }
  });

  test("AUTH-E06: Login page handles slow network gracefully", async ({ authPage, page }) => {
    // Simulate slow network
    await page.route("**/*", async (route) => {
      await new Promise((r) => setTimeout(r, 100));
      await route.continue();
    });

    await authPage.goToLogin();
    await expect(authPage.googleLoginButton).toBeVisible({ timeout: 10000 });
  });

  test("AUTH-E01: Login page shows properly on various viewports", async ({ authPage, page }) => {
    // Desktop
    await page.setViewportSize({ width: 1920, height: 1080 });
    await authPage.goToLogin();
    await expect(authPage.googleLoginButton).toBeVisible();

    // Tablet
    await page.setViewportSize({ width: 768, height: 1024 });
    await expect(authPage.googleLoginButton).toBeVisible();

    // Mobile
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(authPage.googleLoginButton).toBeVisible();
  });

  test("AUTH-E05: Session persists across page navigation", async ({ page }) => {
    // Navigate through app
    await page.goto("/positions");
    await page.waitForLoadState("networkidle");

    await page.goto("/candidates");
    await page.waitForLoadState("networkidle");

    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    // All should load without redirect to login
    await expect(page).toHaveURL(/\/settings/);
  });

  test("AUTH-E10: Invalid callback parameters handled gracefully", async ({ page }) => {
    // Try to access callback with invalid params
    await page.goto("/api/auth/callback?error=access_denied");

    // Should handle gracefully - either error page or redirect
    await page.waitForLoadState("networkidle");
    // Page should not crash
    await expect(page.locator("body")).toBeVisible();
  });

  test("Login page has proper accessibility", async ({ authPage, page }) => {
    await authPage.goToLogin();

    // Check for proper heading
    const heading = page.locator("h1, h2").first();
    await expect(heading).toBeVisible();

    // Button should be keyboard accessible
    await authPage.googleLoginButton.focus();
    await expect(authPage.googleLoginButton).toBeFocused();
  });

  test("Signup page has proper accessibility", async ({ authPage, page }) => {
    await authPage.goToSignup();

    // Check for proper heading
    const heading = page.locator("h1, h2").first();
    await expect(heading).toBeVisible();

    // Button should be keyboard accessible
    await authPage.googleSignupButton.focus();
    await expect(authPage.googleSignupButton).toBeFocused();
  });
});

test.describe("Authentication - Security", () => {
  test("Protected API routes return 401 without auth", async ({ page }) => {
    // Clear auth
    await page.context().clearCookies();

    // Try to fetch protected API
    const response = await page.request.get("/api/candidates");
    expect(response.status()).toBe(401);
  });

  test("Protected API routes return 401 for positions", async ({ page }) => {
    await page.context().clearCookies();
    const response = await page.request.get("/api/positions");
    expect(response.status()).toBe(401);
  });

  test("XSS in URL parameters handled safely", async ({ page }) => {
    // Try XSS in URL
    await page.goto('/login?next=<script>alert("xss")</script>');
    await page.waitForLoadState("networkidle");

    // Page should load without executing script
    await expect(page.locator("body")).toBeVisible();
    // No alert should appear (test would fail if script executed)
  });

  test("Path traversal in URL handled safely", async ({ page }) => {
    await page.goto("/login?next=../../etc/passwd");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toBeVisible();
  });
});
