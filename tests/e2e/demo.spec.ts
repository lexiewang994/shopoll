import path from "node:path";
import { expect, test } from "@playwright/test";

test("admin demo covers survey creation and CSV export", async ({
  page,
}, testInfo) => {
  await page.goto("/demo");
  await expect(
    page.getByRole("heading", { name: "概览", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Paper7", { exact: true }).first()).toBeVisible();
  if (process.env.SHOPOLL_SCREENSHOT_DIR) {
    await page.screenshot({
      path: path.join(
        process.env.SHOPOLL_SCREENSHOT_DIR,
        `shopoll-admin-${testInfo.project.name}.png`,
      ),
      fullPage: true,
    });
  }

  await page.goto("/demo#surveys");
  await expect(page.getByRole("heading", { name: "问卷" })).toBeVisible();
  await page.getByRole("button", { name: /新建问卷/ }).click();
  await expect(page.getByRole("heading", { name: "选择起点" })).toBeVisible();
  await page.getByRole("button", { name: "使用此模板" }).first().click();
  await expect(
    page.getByRole("navigation", { name: "问卷设置" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "检查并发布" }).first(),
  ).toBeVisible();

  await page.goto("/demo#responses");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /导出 CSV/ }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("shopoll-demo-responses.csv");
});

test("admin demo supports English navigation and translated surfaces", async ({
  page,
}, testInfo) => {
  await page.goto("/demo?adminLocale=en");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");

  if (testInfo.project.name.includes("mobile")) {
    await page.getByRole("button", { name: "Open navigation" }).click();
  }

  const navigation = page.getByRole("navigation", {
    name: "Shopoll navigation",
  });
  await expect(
    navigation.getByRole("link", { name: "Overview" }),
  ).toBeVisible();
  await navigation.getByRole("link", { name: "Surveys" }).click();

  await expect(page).toHaveURL(/\/demo\?adminLocale=en#surveys$/);
  await expect(
    page.getByRole("heading", { name: "Surveys", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /New survey/ }).click();
  await expect(
    page.getByRole("heading", { name: "Choose a starting point" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Use template" }).first().click();

  const editorTabs = page.getByRole("navigation", {
    name: "Survey settings",
  });
  await expect(editorTabs).toBeVisible();
  await expect(
    page.getByText("Question settings", { exact: true }),
  ).toBeVisible();

  await editorTabs.getByRole("button", { name: "Logic" }).click();
  await expect(page.getByText("Skip logic", { exact: true })).toBeVisible();
  await editorTabs
    .getByRole("button", { name: "Audience and triggers" })
    .click();
  await expect(
    page.getByText("Placement surface", { exact: true }),
  ).toBeVisible();
  await editorTabs.getByRole("button", { name: /Translations/ }).click();
  await expect(
    page.getByText("Customer survey translations", { exact: true }),
  ).toBeVisible();
  await editorTabs.getByRole("button", { name: "Style" }).click();
  await expect(page.getByText("Brand styling", { exact: true })).toBeVisible();
  await editorTabs.getByRole("button", { name: "Reward" }).click();
  await expect(
    page.getByText("Completion reward", { exact: true }),
  ).toBeVisible();
  await editorTabs.getByRole("button", { name: "Publish" }).click();
  await expect(
    page.getByText("Publication checks", { exact: true }),
  ).toBeVisible();
});

test("customer preview switches product and locale and completes", async ({
  page,
}) => {
  await page.goto("/demo#preview");
  await expect(
    page.getByRole("heading", { name: "购买动机问卷" }),
  ).toBeVisible();
  await page.getByLabel("产品").selectOption("nexus");
  await page.getByLabel("语言").selectOption("de");
  await expect(
    page.getByRole("heading", { name: /Nexus/ }).last(),
  ).toBeVisible();

  for (let index = 0; index < 3; index += 1) {
    await page.locator(".sp-public-options button").first().click();
    await page.locator(".sp-public-next").click();
  }
  await expect(page.locator(".sp-public-complete")).toBeVisible();
});

test("mobile navigation and fixed-format controls do not overflow", async ({
  page,
}, testInfo) => {
  test.skip(
    !testInfo.project.name.includes("mobile"),
    "mobile-only layout check",
  );
  await page.goto("/demo");
  await page.getByRole("button", { name: "打开导航" }).click();
  await expect(page.locator(".sp-demo-sidebar")).toHaveClass(/is-open/);
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  expect(overflows).toBe(false);
});
