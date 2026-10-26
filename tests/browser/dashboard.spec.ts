import { test, expect } from "@playwright/test";
import { SIGNATURE } from "../fixtures.js";
test("offline example explains failure, exports JSON and preserves local navigation", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("textbox", { name: "Transaction signature" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Insufficient funds", exact: true })
    .click();
  await expect(page.getByTestId("source-label")).toHaveText(
    "Offline example · Fictional values",
  );
  await expect(
    page.getByRole("heading", { name: "Insufficient funds", exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("failed-instruction")).toContainText("#2");
  await expect(page.getByTestId("fee")).toContainText("0.000005 SOL");
  await expect(page.getByTestId("compute")).toContainText("18,420 CU");
  await expect(
    page.getByText("Ran; rolled back", { exact: true }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const exported = await download;
  expect(exported.suggestedFilename()).toMatch(/^txray-example-/);
  const stream = await exported.createReadStream();
  const chunks: Buffer[] = [];
  for await (const c of stream!) chunks.push(c);
  const report = JSON.parse(Buffer.concat(chunks).toString());
  expect(report.source).toBe("example");
  expect(report.raw.meta.fee).toBe("5000");
  await page.getByRole("link", { name: "Architecture", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Architecture", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "txray architecture" }),
  ).toBeVisible();
});
test("live form follows the complete backend lookup path", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Network").selectOption("devnet");
  await page
    .getByRole("textbox", { name: "Transaction signature" })
    .fill(SIGNATURE);
  await page
    .getByRole("button", { name: "Inspect transaction", exact: true })
    .click();
  await expect(page.getByTestId("source-label")).toHaveText(
    "Live RPC · Devnet",
  );
  await expect(
    page.getByRole("heading", { name: "Insufficient funds", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Looking up transaction…", { exact: true }),
  ).not.toBeVisible();
});
test("unknown custom errors and missing metadata stay explicit", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Unknown program error", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Unknown program error", exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("explanation")).toContainText("6001");
  await expect(page.locator(".log-failure")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Missing metadata", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Outcome unavailable", exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("fee")).toHaveText("Not reported");
  await expect(page.getByTestId("compute")).toHaveText("Not reported");
});
test("invalid input stays local and RPC failure gives actionable feedback", async ({
  page,
}) => {
  await page.goto("/");
  let lookups = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/api/transactions")) lookups++;
  });
  await page
    .getByRole("textbox", { name: "Transaction signature" })
    .fill("invalid");
  await page
    .getByRole("button", { name: "Inspect transaction", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("signature");
  expect(lookups).toBe(0);
  await page.route("**/api/transactions", (route) =>
    route.fulfill({
      status: 429,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "RPC_RATE_LIMITED",
          message: "The public RPC is busy. Wait before retrying.",
        },
      }),
    }),
  );
  await page
    .getByRole("textbox", { name: "Transaction signature" })
    .fill(SIGNATURE);
  await page
    .getByRole("button", { name: "Inspect transaction", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("public RPC is busy");
});
test("logs are rendered as text and clipboard failure stays honest", async ({
  page,
}) => {
  await page.goto("/");
  await page.route("**/api/examples/insufficient-funds", async (route) => {
    const response = await route.fetch();
    const report = await response.json();
    report.logs[0].text = '<img src=x onerror="window.pwned=true">';
    await route.fulfill({ json: report });
  });
  await page
    .getByRole("button", { name: "Insufficient funds", exact: true })
    .click();
  await expect(
    page.getByText('<img src=x onerror="window.pwned=true">', { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.querySelector(".logs img")),
  ).toBeNull();
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async () => {
          throw new Error("denied");
        },
      },
      configurable: true,
    });
  });
  await page.getByRole("button", { name: "Copy report", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Clipboard unavailable");
});
test("keyboard navigation, dark theme and mobile layout remain readable", async ({
  page,
}) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to inspector" }),
  ).toBeFocused();
  await page
    .getByRole("button", { name: "Successful v0", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Transaction succeeded", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => getComputedStyle(document.documentElement).colorScheme,
    ),
  ).toBe("dark");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page.getByRole("link", { name: "Guide", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Using txray", exact: true }),
  ).toBeVisible();
});

test("v1 settings and successful clipboard copy work in the dashboard", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await page
    .getByRole("button", { name: "v1 transaction", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Transaction succeeded", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("30,000 CU", { exact: true })).toBeVisible();
  await expect(page.getByText("1,000 lamports", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Copy report", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Report copied.");
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain("Fictional offline example");
});
