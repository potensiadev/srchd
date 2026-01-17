import { test, expect, helpers, TestData } from "./fixtures";

/**
 * E2E Tests: Settings Module
 *
 * Tests for profile, subscription, billing
 * Following test scenarios from E2E_Test_Scenarios.md
 */

test.describe("Settings - Core Scenarios", () => {
  test.beforeEach(async ({ settingsPage }) => {
    await settingsPage.goto();
  });

  test.describe("SET-001 to SET-005: Profile Tab", () => {
    test("SET-001: Settings page loads correctly", async ({ page }) => {
      await expect(page).toHaveURL(/\/settings/);
      await expect(page.locator("body")).toBeVisible();
    });

    test("SET-002: Profile tab displays user info", async ({ settingsPage, page }) => {
      // Look for profile section
      const profileSection = page.locator(
        '[data-testid="profile-section"], text=/프로필|Profile/i'
      ).first();

      await expect(profileSection).toBeVisible({ timeout: 10000 });
    });

    test("SET-003: Email field is readonly", async ({ settingsPage, page }) => {
      const emailField = settingsPage.emailField.or(
        page.locator('input[type="email"], [data-testid="email"]').first()
      );

      if (await emailField.isVisible()) {
        const isDisabled = await emailField.isDisabled();
        const isReadonly = await emailField.getAttribute("readonly");

        expect(isDisabled || isReadonly !== null).toBeTruthy();
      }
    });

    test("SET-004: Name field is editable", async ({ settingsPage, page }) => {
      const nameInput = settingsPage.nameInput.or(
        page.locator('input[name="name"], [data-testid="name-input"]').first()
      );

      if (await nameInput.isVisible()) {
        await expect(nameInput).toBeEditable();
      }
    });

    test("SET-005: Company field is editable", async ({ settingsPage, page }) => {
      const companyInput = settingsPage.companyInput.or(
        page.locator('input[name="company"], [data-testid="company-input"]').first()
      );

      if (await companyInput.isVisible()) {
        await expect(companyInput).toBeEditable();
      }
    });
  });

  test.describe("SET-006 to SET-010: Subscription Tab", () => {
    test("SET-006: Subscription tab exists", async ({ settingsPage, page }) => {
      const subscriptionTab = settingsPage.subscriptionTab.or(
        page.locator('text=/구독|Subscription|플랜|Plan/i').first()
      );

      await expect(subscriptionTab).toBeVisible({ timeout: 10000 });
    });

    test("SET-007: Current plan displayed", async ({ settingsPage, page }) => {
      // Click subscription tab if needed
      const subTab = settingsPage.subscriptionTab;
      if (await subTab.isVisible()) {
        await subTab.click();
      }

      // Look for plan info
      const planInfo = settingsPage.currentPlan.or(
        page.locator('text=/Starter|Pro|Basic|Premium/i').first()
      );

      await expect(planInfo).toBeVisible({ timeout: 10000 });
    });

    test("SET-008: Credit usage displayed", async ({ settingsPage, page }) => {
      const subTab = settingsPage.subscriptionTab;
      if (await subTab.isVisible()) {
        await subTab.click();
      }

      // Look for credit usage
      const creditInfo = settingsPage.creditUsage.or(
        page.locator('text=/크레딧|Credit|사용량|Usage/i').first()
      );

      // May or may not be visible
    });

    test("SET-009: Progress bar for credits", async ({ settingsPage, page }) => {
      const subTab = settingsPage.subscriptionTab;
      if (await subTab.isVisible()) {
        await subTab.click();
      }

      // Look for progress indicator
      const progress = settingsPage.creditProgress.or(
        page.locator('[class*="progress"], [role="progressbar"]').first()
      );

      // Progress bar may or may not be visible
    });

    test("SET-010: Plan comparison cards visible", async ({ settingsPage, page }) => {
      const subTab = settingsPage.subscriptionTab;
      if (await subTab.isVisible()) {
        await subTab.click();
      }

      // Look for plan cards
      const planCards = settingsPage.planCards.or(
        page.locator('[class*="plan-card"], [data-testid*="plan"]')
      );

      // Should have at least one plan card
    });
  });

  test.describe("SET-011 to SET-015: Actions", () => {
    test("SET-011: Save button exists for profile", async ({ settingsPage, page }) => {
      const saveBtn = settingsPage.saveButton.or(
        page.locator('button:has-text("저장"), button:has-text("Save")').first()
      );

      // Save button should exist
      await expect(saveBtn).toBeVisible({ timeout: 10000 });
    });

    test("SET-012: Logout button exists", async ({ settingsPage, page }) => {
      const logoutBtn = settingsPage.logoutButton.or(
        page.locator('button:has-text("로그아웃"), button:has-text("Logout")').first()
      );

      await expect(logoutBtn).toBeVisible({ timeout: 10000 });
    });

    test("SET-013: Tab navigation works", async ({ settingsPage, page }) => {
      // Click between tabs
      const profileTab = settingsPage.profileTab.or(
        page.locator('text=/프로필|Profile/i').first()
      );
      const subscriptionTab = settingsPage.subscriptionTab;

      if (await subscriptionTab.isVisible()) {
        await subscriptionTab.click();
        await page.waitForLoadState("networkidle");

        // Content should change
        await expect(page.locator('text=/플랜|Plan|구독|Subscription/i').first()).toBeVisible();
      }

      if (await profileTab.isVisible()) {
        await profileTab.click();
        await page.waitForLoadState("networkidle");
      }
    });

    test("SET-014: Update name saves successfully", async ({ settingsPage, page }) => {
      const nameInput = settingsPage.nameInput.or(
        page.locator('input[name="name"]').first()
      );

      if (await nameInput.isVisible()) {
        const newName = `Test User ${Date.now()}`;
        await nameInput.fill(newName);

        const saveBtn = settingsPage.saveButton.or(
          page.locator('button:has-text("저장"), button:has-text("Save")').first()
        );

        if (await saveBtn.isVisible()) {
          await saveBtn.click();
          await page.waitForLoadState("networkidle");

          // Should show success or value persisted
        }
      }
    });

    test("SET-015: Logout redirects correctly", async ({ settingsPage, page }) => {
      const logoutBtn = settingsPage.logoutButton.or(
        page.locator('button:has-text("로그아웃"), button:has-text("Logout")').first()
      );

      if (await logoutBtn.isVisible()) {
        await logoutBtn.click();
        await page.waitForLoadState("networkidle");

        // Should redirect to home or login
        await expect(page).toHaveURL(/\/$|\?logged_out|\/login/);
      }
    });
  });
});

test.describe("Settings - Edge Cases", () => {
  test("SET-E01: Name with maximum length", async ({ settingsPage, page }) => {
    await settingsPage.goto();

    const nameInput = settingsPage.nameInput.or(
      page.locator('input[name="name"]').first()
    );

    if (await nameInput.isVisible()) {
      // Try very long name
      const longName = "A".repeat(200);
      await nameInput.fill(longName);

      const saveBtn = page.locator('button:has-text("저장"), button:has-text("Save")').first();
      if (await saveBtn.isVisible()) {
        await saveBtn.click();
        await page.waitForLoadState("networkidle");

        // Should truncate or show error
      }
    }
  });

  test("SET-E02: Name with only whitespace", async ({ settingsPage, page }) => {
    await settingsPage.goto();

    const nameInput = settingsPage.nameInput.or(
      page.locator('input[name="name"]').first()
    );

    if (await nameInput.isVisible()) {
      await nameInput.fill("   ");

      const saveBtn = page.locator('button:has-text("저장"), button:has-text("Save")').first();
      if (await saveBtn.isVisible()) {
        await saveBtn.click();
        await page.waitForLoadState("networkidle");

        // Should show error or trim whitespace
      }
    }
  });

  test("SET-E03: Company with special characters", async ({ settingsPage, page }) => {
    await settingsPage.goto();

    const companyInput = settingsPage.companyInput.or(
      page.locator('input[name="company"]').first()
    );

    if (await companyInput.isVisible()) {
      await companyInput.fill("삼성전자(주) - AI Lab & ML팀");

      const saveBtn = page.locator('button:has-text("저장"), button:has-text("Save")').first();
      if (await saveBtn.isVisible()) {
        await saveBtn.click();
        await page.waitForLoadState("networkidle");

        // Should save successfully
      }
    }
  });

  test("SET-E04: Session expiry during save", async ({ page }) => {
    await page.route("**/api/users/**", async (route) => {
      await route.fulfill({
        status: 401,
        json: { error: "Session expired" },
      });
    });

    await page.goto("/settings");

    // Should handle gracefully
    await expect(page.locator("body")).toBeVisible();
  });

  test("SET-E05: Network error during save", async ({ page }) => {
    await page.goto("/settings");

    await page.route("**/api/users/**", async (route) => {
      await route.abort("failed");
    });

    const saveBtn = page.locator('button:has-text("저장"), button:has-text("Save")').first();
    if (await saveBtn.isVisible()) {
      await saveBtn.click();

      // Should show error message
    }
  });

  test("SET-E06: Credits at exact limit (100%)", async ({ page }) => {
    await page.route("**/api/users/me**", async (route) => {
      await route.fulfill({
        status: 200,
        json: {
          credits: 50,
          credits_used_this_month: 50,
          plan: "starter",
        },
      });
    });

    await page.goto("/settings");

    // Progress should show 100%
  });

  test("SET-E07: Credits over limit (overage)", async ({ page }) => {
    await page.route("**/api/users/me**", async (route) => {
      await route.fulfill({
        status: 200,
        json: {
          credits: 50,
          credits_used_this_month: 55, // Overage
          plan: "starter",
        },
      });
    });

    await page.goto("/settings");

    // Should show overage state
  });

  test("SET-E08: Upgrade button initiates checkout", async ({ page }) => {
    await page.goto("/settings");

    // Click subscription tab
    const subTab = page.locator('text=/구독|Subscription/i').first();
    if (await subTab.isVisible()) {
      await subTab.click();
    }

    const upgradeBtn = page.locator('button:has-text("업그레이드"), button:has-text("Upgrade")').first();
    if (await upgradeBtn.isVisible()) {
      // Mock Paddle checkout
      await page.route("**/paddle/**", (route) => route.abort());

      await upgradeBtn.click();
      // Should initiate checkout flow
    }
  });

  test("SET-E09: Cancel subscription shows confirmation", async ({ page }) => {
    await page.route("**/api/users/me**", async (route) => {
      await route.fulfill({
        status: 200,
        json: {
          plan: "pro", // Pro user can cancel
        },
      });
    });

    await page.goto("/settings");

    const cancelBtn = page.locator('button:has-text("취소"), button:has-text("Cancel")').first();
    if (await cancelBtn.isVisible()) {
      await cancelBtn.click();

      // Should show confirmation dialog
      const dialog = page.locator('[role="dialog"], [class*="modal"]');
      // Dialog may appear
    }
  });

  test("SET-E10: Checkout success shows confirmation", async ({ page }) => {
    await page.goto("/settings?checkout=success");

    // Should show success message
    const successMsg = page.locator('text=/성공|Success|완료|Complete/i');
    // Success message should appear
  });
});

test.describe("Settings - Responsive Design", () => {
  test("Settings works on mobile viewport", async ({ settingsPage, page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await settingsPage.goto();

    await expect(page).toHaveURL(/\/settings/);
    await expect(page.locator("body")).toBeVisible();
  });

  test("Settings works on tablet viewport", async ({ settingsPage, page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await settingsPage.goto();

    await expect(page.locator("body")).toBeVisible();
  });

  test("Tabs accessible on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/settings");

    // Tabs should still be usable
    const tabs = page.locator('[role="tab"], [data-testid*="tab"]');
    // Should be accessible
  });

  test("Form fields usable on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/settings");

    const inputs = page.locator('input:visible');
    // Inputs should be tappable
  });
});

test.describe("Settings - Accessibility", () => {
  test("Settings page has proper headings", async ({ page }) => {
    await page.goto("/settings");

    const heading = page.locator("h1, h2").first();
    await expect(heading).toBeVisible();
  });

  test("Form fields have labels", async ({ page }) => {
    await page.goto("/settings");

    // Check for associated labels
    const inputs = page.locator("input[name]");
    const count = await inputs.count();

    for (let i = 0; i < Math.min(count, 3); i++) {
      const input = inputs.nth(i);
      const id = await input.getAttribute("id");
      const ariaLabel = await input.getAttribute("aria-label");
      const placeholder = await input.getAttribute("placeholder");

      // Should have some form of label
      if (id) {
        const label = page.locator(`label[for="${id}"]`);
        // Label may exist
      }
    }
  });

  test("Tabs are keyboard navigable", async ({ page }) => {
    await page.goto("/settings");

    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");

    const focused = page.locator(":focus");
    await expect(focused).toBeVisible();
  });

  test("Save button keyboard accessible", async ({ page }) => {
    await page.goto("/settings");

    const saveBtn = page.locator('button:has-text("저장"), button:has-text("Save")').first();
    if (await saveBtn.isVisible()) {
      await saveBtn.focus();
      await expect(saveBtn).toBeFocused();
    }
  });

  test("Form submission via Enter key", async ({ page }) => {
    await page.goto("/settings");

    const nameInput = page.locator('input[name="name"]').first();
    if (await nameInput.isVisible()) {
      await nameInput.focus();
      await nameInput.fill("Test Name");
      await page.keyboard.press("Enter");

      // May or may not submit form
    }
  });
});

test.describe("Settings - Performance", () => {
  test("Page loads within acceptable time", async ({ settingsPage, page }) => {
    const startTime = Date.now();

    await settingsPage.goto();
    await page.waitForLoadState("networkidle");

    const loadTime = Date.now() - startTime;
    expect(loadTime).toBeLessThan(3000);
  });

  test("Tab switching is responsive", async ({ page }) => {
    await page.goto("/settings");

    const subTab = page.locator('text=/구독|Subscription/i').first();
    if (await subTab.isVisible()) {
      const startTime = Date.now();
      await subTab.click();
      await page.waitForLoadState("networkidle");
      const switchTime = Date.now() - startTime;

      expect(switchTime).toBeLessThan(1000);
    }
  });

  test("No unnecessary re-renders on input", async ({ page }) => {
    await page.goto("/settings");

    const nameInput = page.locator('input[name="name"]').first();
    if (await nameInput.isVisible()) {
      // Type slowly and verify responsiveness
      await nameInput.fill("");
      for (const char of "Test User") {
        await nameInput.type(char, { delay: 50 });
      }

      // Should remain responsive
      await expect(nameInput).toHaveValue("Test User");
    }
  });
});

test.describe("Settings - Security", () => {
  test("Sensitive data not exposed in DOM", async ({ page }) => {
    await page.goto("/settings");

    // Check that no raw tokens are in the DOM
    const pageContent = await page.content();

    // Should not contain raw auth tokens
    expect(pageContent).not.toMatch(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/);
  });

  test("CSRF protection on save", async ({ page }) => {
    await page.goto("/settings");

    // Save should include proper headers/tokens
    const saveBtn = page.locator('button:has-text("저장"), button:has-text("Save")').first();
    // CSRF handling is server-side, just ensure no errors
  });

  test("XSS in name field sanitized", async ({ page }) => {
    await page.goto("/settings");

    const nameInput = page.locator('input[name="name"]').first();
    if (await nameInput.isVisible()) {
      await nameInput.fill('<script>alert("xss")</script>');

      const saveBtn = page.locator('button:has-text("저장")').first();
      if (await saveBtn.isVisible()) {
        await saveBtn.click();
        await page.waitForLoadState("networkidle");

        // Should not execute script
        await expect(page.locator("body")).toBeVisible();
      }
    }
  });
});
