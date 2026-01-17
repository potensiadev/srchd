import { test as base, expect, Page, Locator } from "@playwright/test";
import path from "path";

/**
 * Extended test fixtures for SRCHD E2E tests
 */

// ============================================================================
// Page Object Models
// ============================================================================

export class AuthPage {
  constructor(private page: Page) {}

  // Locators
  get googleLoginButton() {
    return this.page.locator('[data-testid="google-login-button"]');
  }
  get googleSignupButton() {
    return this.page.locator('[data-testid="google-signup-button"]');
  }
  get loginError() {
    return this.page.locator('[data-testid="login-error"]');
  }
  get consentCheckboxes() {
    return this.page.locator('input[type="checkbox"]');
  }
  get consentSubmitButton() {
    return this.page.locator('button:has-text("동의하고 시작하기")');
  }

  // Actions
  async goToLogin() {
    await this.page.goto("/login");
    await this.page.waitForLoadState("networkidle");
  }

  async goToSignup() {
    await this.page.goto("/signup");
    await this.page.waitForLoadState("networkidle");
  }

  async acceptAllConsents() {
    const count = await this.consentCheckboxes.count();
    for (let i = 0; i < count; i++) {
      await this.consentCheckboxes.nth(i).check();
    }
    await this.consentSubmitButton.click();
  }
}

export class CandidatesPage {
  constructor(private page: Page) {}

  // Locators
  get searchInput() {
    return this.page.locator('[data-testid="search-input"]');
  }
  get sortDropdown() {
    return this.page.locator('[data-testid="filter-sort"]');
  }
  get loadingState() {
    return this.page.locator('[data-testid="loading-state"]');
  }
  get emptyState() {
    return this.page.locator('[data-testid="empty-state"]');
  }
  get candidateList() {
    return this.page.locator('[data-testid="candidate-list"]');
  }
  get candidateItems() {
    return this.page.locator('[data-testid="candidate-item"]');
  }
  get uploadButton() {
    return this.page.locator('[data-testid="upload-button"]');
  }
  get fileInput() {
    return this.page.locator('input[type="file"]');
  }
  get uploadProgress() {
    return this.page.locator('[data-testid="upload-progress"]');
  }
  get uploadError() {
    return this.page.locator('[data-testid="upload-error"]');
  }
  get processingStatus() {
    return this.page.locator('[data-testid="processing-status"]');
  }
  get paginationNext() {
    return this.page.locator('[data-testid="pagination-next"]');
  }
  get paginationPrev() {
    return this.page.locator('[data-testid="pagination-prev"]');
  }

  // Actions
  async goto() {
    await this.page.goto("/candidates");
    await this.page.waitForLoadState("networkidle");
  }

  async search(query: string) {
    await this.searchInput.fill(query);
    await this.page.keyboard.press("Enter");
    await this.page.waitForLoadState("networkidle");
  }

  async sortBy(option: "recent" | "confidence" | "experience") {
    await this.sortDropdown.selectOption(option);
    await this.page.waitForLoadState("networkidle");
  }

  async uploadFile(filePath: string) {
    await this.fileInput.setInputFiles(filePath);
  }

  async getCandidateCount(): Promise<number> {
    return await this.candidateItems.count();
  }

  async clickCandidate(index: number = 0) {
    await this.candidateItems.nth(index).click();
  }
}

export class CandidateDetailPage {
  constructor(private page: Page) {}

  // Locators
  get name() {
    return this.page.locator('[data-testid="candidate-name"]');
  }
  get email() {
    return this.page.locator('[data-testid="candidate-email"]');
  }
  get phone() {
    return this.page.locator('[data-testid="candidate-phone"]');
  }
  get skills() {
    return this.page.locator('[data-testid="candidate-skills"] span');
  }
  get careers() {
    return this.page.locator('[data-testid="career-item"]');
  }
  get education() {
    return this.page.locator('[data-testid="education-item"]');
  }
  get summary() {
    return this.page.locator('[data-testid="candidate-summary"]');
  }
  get confidenceScore() {
    return this.page.locator('[data-testid="ai-confidence"]');
  }
  get requiresReviewBadge() {
    return this.page.locator('[data-testid="requires-review"]');
  }
  get blindExportButton() {
    return this.page.locator('[data-testid="blind-export-button"]');
  }
  get findSimilarButton() {
    return this.page.locator('[data-testid="find-similar-button"]');
  }
  get editButton() {
    return this.page.locator('[data-testid="edit-candidate-button"]');
  }
  get deleteButton() {
    return this.page.locator('[data-testid="delete-candidate-button"]');
  }

  // Actions
  async goto(candidateId: string) {
    await this.page.goto(`/candidates/${candidateId}`);
    await this.page.waitForLoadState("networkidle");
  }

  async getSkillsList(): Promise<string[]> {
    const skills = await this.skills.allTextContents();
    return skills;
  }
}

export class PositionsPage {
  constructor(private page: Page) {}

  // Locators
  get createButton() {
    return this.page.locator('[data-testid="create-position-button"]');
  }
  get positionList() {
    return this.page.locator('[data-testid="position-list"]');
  }
  get positionItems() {
    return this.page.locator('[data-testid="position-item"]');
  }
  get emptyState() {
    return this.page.locator('[data-testid="empty-state"]');
  }
  get searchInput() {
    return this.page.locator('[data-testid="position-search"]');
  }
  get statusFilter() {
    return this.page.locator('[data-testid="status-filter"]');
  }

  // Actions
  async goto() {
    await this.page.goto("/positions");
    await this.page.waitForLoadState("networkidle");
  }

  async clickCreate() {
    await this.createButton.click();
  }

  async getPositionCount(): Promise<number> {
    return await this.positionItems.count();
  }
}

export class PositionFormPage {
  constructor(private page: Page) {}

  // Locators
  get titleInput() {
    return this.page.locator('[data-testid="position-title"]');
  }
  get clientCompanyInput() {
    return this.page.locator('[data-testid="client-company"]');
  }
  get departmentInput() {
    return this.page.locator('[data-testid="department"]');
  }
  get descriptionInput() {
    return this.page.locator('[data-testid="description"]');
  }
  get requiredSkillsInput() {
    return this.page.locator('[data-testid="required-skills"]');
  }
  get preferredSkillsInput() {
    return this.page.locator('[data-testid="preferred-skills"]');
  }
  get minExpInput() {
    return this.page.locator('[data-testid="min-exp-years"]');
  }
  get maxExpInput() {
    return this.page.locator('[data-testid="max-exp-years"]');
  }
  get locationInput() {
    return this.page.locator('[data-testid="location-city"]');
  }
  get jobTypeSelect() {
    return this.page.locator('[data-testid="job-type"]');
  }
  get salaryMinInput() {
    return this.page.locator('[data-testid="salary-min"]');
  }
  get salaryMaxInput() {
    return this.page.locator('[data-testid="salary-max"]');
  }
  get statusSelect() {
    return this.page.locator('[data-testid="status"]');
  }
  get prioritySelect() {
    return this.page.locator('[data-testid="priority"]');
  }
  get deadlineInput() {
    return this.page.locator('[data-testid="deadline"]');
  }
  get submitButton() {
    return this.page.locator('[data-testid="submit-position"]');
  }
  get cancelButton() {
    return this.page.locator('[data-testid="cancel-button"]');
  }
  get jdUploadInput() {
    return this.page.locator('[data-testid="jd-upload"]');
  }
  get validationError() {
    return this.page.locator('[data-testid="validation-error"]');
  }

  // Actions
  async goto() {
    await this.page.goto("/positions/new");
    await this.page.waitForLoadState("networkidle");
  }

  async gotoEdit(positionId: string) {
    await this.page.goto(`/positions/${positionId}/edit`);
    await this.page.waitForLoadState("networkidle");
  }

  async fillBasicInfo(data: {
    title: string;
    company?: string;
    department?: string;
    description?: string;
  }) {
    await this.titleInput.fill(data.title);
    if (data.company) await this.clientCompanyInput.fill(data.company);
    if (data.department) await this.departmentInput.fill(data.department);
    if (data.description) await this.descriptionInput.fill(data.description);
  }

  async addSkill(skill: string, required: boolean = true) {
    const input = required ? this.requiredSkillsInput : this.preferredSkillsInput;
    await input.fill(skill);
    await this.page.keyboard.press("Enter");
  }

  async setExperience(min: number, max?: number) {
    await this.minExpInput.fill(min.toString());
    if (max !== undefined) await this.maxExpInput.fill(max.toString());
  }

  async setSalary(min: number, max?: number) {
    await this.salaryMinInput.fill(min.toString());
    if (max !== undefined) await this.salaryMaxInput.fill(max.toString());
  }

  async submit() {
    await this.submitButton.click();
    await this.page.waitForLoadState("networkidle");
  }

  async uploadJD(filePath: string) {
    await this.jdUploadInput.setInputFiles(filePath);
    await this.page.waitForTimeout(2000); // Wait for extraction
  }
}

export class PositionDetailPage {
  constructor(private page: Page) {}

  // Locators
  get title() {
    return this.page.locator('[data-testid="position-title"]');
  }
  get status() {
    return this.page.locator('[data-testid="position-status"]');
  }
  get statusDropdown() {
    return this.page.locator('[data-testid="status-dropdown"]');
  }
  get matchedCandidates() {
    return this.page.locator('[data-testid="matched-candidate"]');
  }
  get matchScore() {
    return this.page.locator('[data-testid="match-score"]');
  }
  get editButton() {
    return this.page.locator('[data-testid="edit-position-button"]');
  }
  get deleteButton() {
    return this.page.locator('[data-testid="delete-position-button"]');
  }
  get pipelineStages() {
    return this.page.locator('[data-testid="pipeline-stage"]');
  }

  // Actions
  async goto(positionId: string) {
    await this.page.goto(`/positions/${positionId}`);
    await this.page.waitForLoadState("networkidle");
  }

  async changeStatus(status: string) {
    await this.statusDropdown.selectOption(status);
    await this.page.waitForLoadState("networkidle");
  }

  async getMatchedCandidateCount(): Promise<number> {
    return await this.matchedCandidates.count();
  }
}

export class AnalyticsPage {
  constructor(private page: Page) {}

  // Locators
  get totalCandidatesCard() {
    return this.page.locator('[data-testid="total-candidates"]');
  }
  get thisMonthNewCard() {
    return this.page.locator('[data-testid="this-month-new"]');
  }
  get blindExportsCard() {
    return this.page.locator('[data-testid="blind-exports"]');
  }
  get experienceChart() {
    return this.page.locator('[data-testid="experience-chart"]');
  }
  get chartBars() {
    return this.page.locator('[data-testid="chart-bar"]');
  }
  get emptyState() {
    return this.page.locator('[data-testid="empty-state"]');
  }

  // Actions
  async goto() {
    await this.page.goto("/analytics");
    await this.page.waitForLoadState("networkidle");
  }

  async getTotalCandidates(): Promise<string> {
    return (await this.totalCandidatesCard.textContent()) || "0";
  }
}

export class SettingsPage {
  constructor(private page: Page) {}

  // Locators - Profile Tab
  get profileTab() {
    return this.page.locator('[data-testid="profile-tab"]');
  }
  get subscriptionTab() {
    return this.page.locator('[data-testid="subscription-tab"]');
  }
  get emailField() {
    return this.page.locator('[data-testid="email-field"]');
  }
  get nameInput() {
    return this.page.locator('[data-testid="name-input"]');
  }
  get companyInput() {
    return this.page.locator('[data-testid="company-input"]');
  }
  get saveButton() {
    return this.page.locator('[data-testid="save-profile"]');
  }
  get logoutButton() {
    return this.page.locator('[data-testid="logout-button"]');
  }

  // Locators - Subscription Tab
  get currentPlan() {
    return this.page.locator('[data-testid="current-plan"]');
  }
  get creditUsage() {
    return this.page.locator('[data-testid="credit-usage"]');
  }
  get creditProgress() {
    return this.page.locator('[data-testid="credit-progress"]');
  }
  get upgradeButton() {
    return this.page.locator('[data-testid="upgrade-button"]');
  }
  get cancelSubscriptionButton() {
    return this.page.locator('[data-testid="cancel-subscription"]');
  }
  get planCards() {
    return this.page.locator('[data-testid="plan-card"]');
  }

  // Actions
  async goto() {
    await this.page.goto("/settings");
    await this.page.waitForLoadState("networkidle");
  }

  async goToProfile() {
    await this.profileTab.click();
  }

  async goToSubscription() {
    await this.subscriptionTab.click();
  }

  async updateName(name: string) {
    await this.nameInput.fill(name);
    await this.saveButton.click();
  }

  async updateCompany(company: string) {
    await this.companyInput.fill(company);
    await this.saveButton.click();
  }

  async logout() {
    await this.logoutButton.click();
  }
}

// ============================================================================
// Test Data Generators
// ============================================================================

export const TestData = {
  positions: {
    valid: {
      title: "Senior Frontend Developer",
      company: "Tech Corp",
      department: "Engineering",
      description: "Looking for experienced React developer",
      requiredSkills: ["React", "TypeScript", "Node.js"],
      minExp: 5,
      maxExp: 10,
      salaryMin: 6000,
      salaryMax: 10000,
      location: "Seoul",
      jobType: "full-time" as const,
      priority: "high" as const,
    },
    minimal: {
      title: "Developer",
      requiredSkills: ["JavaScript"],
      minExp: 0,
    },
    invalid: {
      noTitle: {
        requiredSkills: ["JavaScript"],
        minExp: 0,
      },
      noSkills: {
        title: "Developer",
        minExp: 0,
      },
      invalidExpRange: {
        title: "Developer",
        requiredSkills: ["JavaScript"],
        minExp: 10,
        maxExp: 5,
      },
      invalidSalaryRange: {
        title: "Developer",
        requiredSkills: ["JavaScript"],
        minExp: 0,
        salaryMin: 10000,
        salaryMax: 5000,
      },
    },
  },

  candidates: {
    searchQueries: {
      korean: "리액트 개발자",
      english: "React Developer",
      mixed: "React개발자",
      skill: "TypeScript",
      nonexistent: "xyznonexistent12345",
      sqlInjection: "'; DROP TABLE candidates; --",
      xss: '<script>alert("xss")</script>',
    },
  },

  users: {
    testUser: {
      email: "test@example.com",
      name: "Test User",
      company: "Test Company",
    },
  },
};

// ============================================================================
// Custom Test Fixtures
// ============================================================================

type TestFixtures = {
  authPage: AuthPage;
  candidatesPage: CandidatesPage;
  candidateDetailPage: CandidateDetailPage;
  positionsPage: PositionsPage;
  positionFormPage: PositionFormPage;
  positionDetailPage: PositionDetailPage;
  analyticsPage: AnalyticsPage;
  settingsPage: SettingsPage;
};

export const test = base.extend<TestFixtures>({
  authPage: async ({ page }, use) => {
    await use(new AuthPage(page));
  },
  candidatesPage: async ({ page }, use) => {
    await use(new CandidatesPage(page));
  },
  candidateDetailPage: async ({ page }, use) => {
    await use(new CandidateDetailPage(page));
  },
  positionsPage: async ({ page }, use) => {
    await use(new PositionsPage(page));
  },
  positionFormPage: async ({ page }, use) => {
    await use(new PositionFormPage(page));
  },
  positionDetailPage: async ({ page }, use) => {
    await use(new PositionDetailPage(page));
  },
  analyticsPage: async ({ page }, use) => {
    await use(new AnalyticsPage(page));
  },
  settingsPage: async ({ page }, use) => {
    await use(new SettingsPage(page));
  },
});

export { expect };

// ============================================================================
// Test Helpers
// ============================================================================

export const helpers = {
  /**
   * Wait for toast notification and verify message
   */
  async waitForToast(page: Page, message: string | RegExp) {
    const toast = page.locator('[data-testid="toast"]').or(page.locator(".toast"));
    await expect(toast).toContainText(message);
  },

  /**
   * Wait for loading to complete
   */
  async waitForLoading(page: Page) {
    const loading = page.locator('[data-testid="loading-state"]');
    if (await loading.isVisible()) {
      await loading.waitFor({ state: "hidden", timeout: 30000 });
    }
  },

  /**
   * Mock API response
   */
  async mockAPI(page: Page, urlPattern: string, response: object, method: string = "GET") {
    await page.route(urlPattern, async (route) => {
      if (route.request().method() === method) {
        await route.fulfill({ json: response });
      } else {
        await route.continue();
      }
    });
  },

  /**
   * Generate unique test ID
   */
  generateTestId(): string {
    return `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  },

  /**
   * Take screenshot with timestamp
   */
  async screenshot(page: Page, name: string) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    await page.screenshot({ path: `tests/screenshots/${name}-${timestamp}.png` });
  },

  /**
   * Wait for network idle with timeout
   */
  async waitForNetworkIdle(page: Page, timeout: number = 5000) {
    await page.waitForLoadState("networkidle", { timeout });
  },

  /**
   * Check if element is in viewport
   */
  async isInViewport(locator: Locator): Promise<boolean> {
    return await locator.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
        rect.right <= (window.innerWidth || document.documentElement.clientWidth)
      );
    });
  },

  /**
   * Retry action with exponential backoff
   */
  async retryAction<T>(
    action: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000
  ): Promise<T> {
    let lastError: Error | undefined;
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await action();
      } catch (error) {
        lastError = error as Error;
        await new Promise((resolve) => setTimeout(resolve, baseDelay * Math.pow(2, i)));
      }
    }
    throw lastError;
  },
};
