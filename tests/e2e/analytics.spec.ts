import { test, expect } from "@playwright/test";

/**
 * E2E Tests: Analytics Module v2.0
 *
 * Tests for analytics dashboard with mocked Supabase RPC calls
 */

test.use({ storageState: 'tests/.auth/user.json' });

test.describe("Analytics v2.0 - Core Scenarios", () => {
  test.beforeEach(async ({ page }) => {
    // Mock Supabase RPC calls
    await page.route("**/rest/v1/rpc/get_analytics_summary", async (route) => {
      await route.fulfill({
        status: 200,
        json: {
          total_candidates: 1250,
          this_month_count: 45,
          last_month_count: 30,
          total_exports: 120,
          active_positions: 8,
          urgent_positions: 2
        },
      });
    });

    await page.route("**/rest/v1/rpc/get_pipeline_stats", async (route) => {
      await route.fulfill({
        status: 200,
        json: {
          stages: [
            { stage: "matched", count: 100, total_entered: 150, total_exited_forward: 50 },
            { stage: "reviewed", count: 30, total_entered: 50, total_exited_forward: 20 },
            { stage: "contacted", count: 15, total_entered: 20, total_exited_forward: 10 },
            { stage: "interviewing", count: 8, total_entered: 10, total_exited_forward: 5 },
            { stage: "offered", count: 3, total_entered: 5, total_exited_forward: 2 },
            { stage: "placed", count: 2, total_entered: 2, total_exited_forward: 0 }
          ],
          total_in_pipeline: 158,
          placed_count: 2,
          conversions: [
            { from_stage: "matched", to_stage: "reviewed", count: 50 },
            { from_stage: "reviewed", to_stage: "contacted", count: 20 }
          ]
        },
      });
    });

    await page.route("**/rest/v1/rpc/get_talent_pool_stats", async (route) => {
      await route.fulfill({
        status: 200,
        json: {
          exp_distribution: { entry: 10, junior: 20, middle: 30, senior: 40, lead: 50 },
          top_skills: [{ name: "React", skill_count: 100 }, { name: "Node.js", skill_count: 80 }],
          top_companies: [{ name: "Tech Co", company_count: 15 }],
          monthly_candidates: [],
          monthly_placements: []
        },
      });
    });

    await page.route("**/rest/v1/rpc/get_position_health", async (route) => {
      await route.fulfill({
        status: 200,
        json: [
          {
            id: "pos-1",
            title: "Senior Frontend Engineer",
            client_company: "Tech Corp",
            status: "open",
            priority: "urgent",
            created_at: new Date().toISOString(),
            days_open: 5,
            match_count: 12,
            stuck_count: 0,
            health_status: "good"
          }
        ],
      });
    });

    await page.route("**/rest/v1/rpc/get_recent_activities", async (route) => {
      await route.fulfill({
        status: 200,
        json: [
          {
            id: "act-1",
            activity_type: "stage_changed",
            description: "Changed stage to interviewed",
            created_at: new Date().toISOString(),
            display_type: "stage_change",
            metadata: {}
          }
        ],
      });
    });



    await page.goto("/analytics");
  });

  test("ANA-001: Page loads and shows KPI cards", async ({ page }) => {
    // Check Header
    await expect(page.locator("h1")).toContainText("Analytics");

    // Check Represenative KPI values from mock
    await expect(page.locator("text=1,250")).toBeVisible(); // Total candidates
    await expect(page.locator("text=120")).toBeVisible(); // Exports
    // 2 urgent positions
    await expect(page.locator("text=2 긴급")).toBeVisible();
  });

  test("ANA-002: Pipeline funnel renders with correct counts", async ({ page }) => {
    // Check for stage counts from mock
    await expect(page.locator("text=100")).toBeVisible(); // Matched
    await expect(page.locator("text=30")).toBeVisible(); // Reviewed
    await expect(page.locator("text=2")).toBeVisible(); // Placed

    // Check for total in pipeline
    await expect(page.locator("text=총 158명")).toBeVisible();
  });

  test("ANA-003: Pipeline tooltips show conversion rates", async ({ page }) => {
    // Hover over a conversion rate badge (mock data logic might need adjustment if badges aren't showing)
    // In PipelineFunnel.tsx, badges show if showConversion is true.
    // showConversion = total_in_pipeline > 0 && conversionRate !== null

    // Verify at least one conversion percentage is visible
    const badge = page.locator("text=%").first();
    await expect(badge).toBeVisible();

    await badge.hover();
    // Tooltip should appear
    await expect(page.locator("text=실제 전환")).toBeVisible();
  });

  test("ANA-004: Position health list renders and is clickable", async ({ page }) => {
    const positionLink = page.locator("a[href*='/positions/pos-1']");
    await expect(positionLink).toBeVisible();
    await expect(positionLink).toContainText("Senior Frontend Engineer");

    // Check metadata
    await expect(page.locator("text=Tech Corp")).toBeVisible();
    await expect(page.locator("text=12명")).toBeVisible(); // Match count
  });

  test("ANA-005: Manual refresh button works", async ({ page }) => {
    const refreshBtn = page.locator("button:has-text('새로고침')");
    await expect(refreshBtn).toBeVisible();

    // Mock a change in data for the second call
    await page.route("**/rest/v1/rpc/get_analytics_summary", async (route) => {
      await route.fulfill({
        status: 200,
        json: {
          total_candidates: 1300, // Changed from 1250
          this_month_count: 50,
          last_month_count: 30,
          total_exports: 125,
          active_positions: 8,
          urgent_positions: 2
        },
      });
    });

    await refreshBtn.click();

    // Check if new data is reflected
    await expect(page.locator("text=1,300")).toBeVisible();
  });
});

test.describe("Analytics v2.0 - Responsive & Error Handling", () => {
  test("ANA-E01: Handles empty states gracefully", async ({ page }) => {
    // Mock empty data
    await page.route("**/rest/v1/rpc/get_position_health", async (route) => {
      await route.fulfill({ status: 200, json: [] });
    });
    await page.route("**/rest/v1/rpc/get_recent_activities", async (route) => {
      await route.fulfill({ status: 200, json: [] });
    });

    await page.goto("/analytics");

    // Should show empty state messages
    await expect(page.locator("text=모든 포지션이 정상입니다")).toBeVisible();
    await expect(page.locator("text=아직 활동 기록이 없습니다")).toBeVisible();
  });

  test("ANA-E02: Handles API errors gracefully", async ({ page }) => {
    // Mock error for KPIs
    await page.route("**/rest/v1/rpc/get_analytics_summary", async (route) => {
      await route.fulfill({ status: 500 });
    });

    await page.goto("/analytics");

    // Should show error message for that section
    await expect(page.locator("text=KPI 데이터를 불러올 수 없습니다")).toBeVisible();
    // Retry button should be present
    await expect(page.locator("button:has-text('다시 시도')").first()).toBeVisible();
  });
});
