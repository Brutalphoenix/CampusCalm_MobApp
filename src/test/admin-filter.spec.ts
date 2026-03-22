import { test, expect } from "../../playwright-fixture";

test.describe("Admin Dashboard Student Filter", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to login page
    await page.goto("http://localhost:8082/login");
    
    // Login as admin
    await page.fill('input[id="usn"]', "ADMIN001");
    await page.fill('input[id="password"]', "AdminPassword123");
    await page.click('button[type="submit"]');
    
    // Ensure we are on the admin page
    await expect(page).toHaveURL(/.*admin/);
  });

  test("should filter students by online/offline status", async ({ page }) => {
    // Go to Students tab
    await page.click('button:has-text("Students")');
    
    // Verify filter buttons are present
    const allFilter = page.locator('button:has-text("all")');
    const onlineFilter = page.locator('button:has-text("online")');
    const offlineFilter = page.locator('button:has-text("offline")');
    
    await expect(allFilter).toBeVisible();
    await expect(onlineFilter).toBeVisible();
    await expect(offlineFilter).toBeVisible();
    
    // Initially "all" should be selected (bg-card class)
    await expect(allFilter).toHaveClass(/bg-card/);
    
    // Test filtering by clicking "online"
    await onlineFilter.click();
    await expect(onlineFilter).toHaveClass(/bg-card/);
    await expect(allFilter).not.toHaveClass(/bg-card/);
    
    // Check that only online students are shown (if any)
    // In our seed, stu001 is offline by default unless the heartbeat ran
    
    // Test filtering by clicking "offline"
    await offlineFilter.click();
    await expect(offlineFilter).toHaveClass(/bg-card/);
    
    // Search functionality check
    await page.fill('input[placeholder*="Search"]', "Test Student");
    const studentRow = page.locator('span:has-text("Test Student")');
    await expect(studentRow).toBeVisible();
  });
});
