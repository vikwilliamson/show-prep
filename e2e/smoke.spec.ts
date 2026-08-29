import { expect, test } from "@playwright/test";

test("an unauthenticated visitor is redirected to /login (proxy.ts session gate)", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
});

test("login page renders", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Gamma" })).toBeVisible();
  await expect(page.getByPlaceholder("Passcode")).toBeVisible();
});

test("the login form submits a passcode, not a password", async ({ page }) => {
  await page.goto("/login");

  const sessionRequest = page.waitForRequest("**/api/session");
  await page.getByPlaceholder("Passcode").fill("whatever-was-typed");
  await page.getByRole("button", { name: "Enter", exact: true }).click();

  const req = await sessionRequest;
  const body = req.postDataJSON();
  expect(body).toEqual({ passcode: "whatever-was-typed" });
});
