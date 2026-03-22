import { test, expect } from '@playwright/test';

test('should show 0m instead of undefinedm for screen time', async ({ page }) => {
  // We'll need to mock the login or navigate directly if possible.
  // Since we can't easily mock Firebase in a simple script, we'll just check if we can see the login page first.
  await page.goto('http://localhost:8081/login');
  await expect(page.locator('h1')).toContainText('ClassTime');
  
  // Fill login
  await page.fill('#usn', 'STU001');
  await page.fill('#password', 'StudentPassword123');
  await page.click('button[type="submit"]');
  
  // Wait for dashboard
  await page.waitForURL('**/dashboard');
  
  // Check Screen Time card
  const screenTimeValue = page.locator('div:has-text("SCREEN TIME") >> p.text-2xl');
  await expect(screenTimeValue).not.toContainText('undefinedm');
  await expect(screenTimeValue).toContainText('m'); // Should show some minutes, or 0m
});
