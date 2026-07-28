import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

const themeAssets = path.resolve("extensions/shopoll-theme/assets");
const loaderSource = fs.readFileSync(path.join(themeAssets, "shopoll.js"), "utf8");
const themeStyles = fs.readFileSync(path.join(themeAssets, "shopoll.css"), "utf8");
const runtimeSource = fs.readFileSync(
  path.join(themeAssets, "shopoll-runtime.js"),
  "utf8",
);

test("theme loader waits for a block and runs the popup survey end to end", async ({
  page,
}, testInfo) => {
  let runtimeRequests = 0;
  const answerBodies: Array<Record<string, unknown>> = [];

  await page.route("**/shopoll-test-runtime.js", async (route) => {
    runtimeRequests += 1;
    await route.fulfill({
      body: runtimeSource,
      contentType: "text/javascript; charset=utf-8",
    });
  });
  await page.route("**/apps/shopoll/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith("/surveys/resolve")) {
      await route.fulfill({
        json: {
          eligible: true,
          placement: { id: "placement-1", trigger: { type: "immediate" } },
          survey: {
            id: "survey-1",
            versionId: "version-1",
            definition: {
              startQuestionId: "reason",
              style: { accentColor: "#147d64", borderRadius: 4 },
              questions: [
                {
                  id: "reason",
                  type: "single_choice",
                  required: true,
                  isFinal: true,
                  title: { en: "Why did you choose Paper7?" },
                  options: [
                    { id: "eye-comfort", label: { en: "Eye comfort" } },
                    { id: "outdoors", label: { en: "Outdoor readability" } },
                  ],
                },
              ],
              completion: {
                title: { en: "Thank you" },
                message: { en: "Your answer was saved." },
              },
            },
          },
        },
      });
      return;
    }
    if (pathname.endsWith("/sessions")) {
      await route.fulfill({
        json: { id: "session-1", resumeToken: "resume-1", answers: [] },
      });
      return;
    }
    if (pathname.endsWith("/answers")) {
      answerBodies.push(route.request().postDataJSON());
      await route.fulfill({ json: { navigation: { complete: true } } });
      return;
    }
    if (pathname.endsWith("/complete")) {
      await route.fulfill({
        json: {
          completion: {
            title: { en: "Thank you" },
            message: { en: "Your answer was saved." },
          },
        },
      });
      return;
    }
    await route.fulfill({ json: {} });
  });

  await page.goto("/demo");
  await page.locator("body").evaluate((body) => body.replaceChildren());
  await page.addStyleTag({ content: themeStyles });
  await page.addScriptTag({ content: loaderSource });
  await page.waitForTimeout(100);
  expect(runtimeRequests).toBe(0);

  await page.locator("body").evaluate((body) => {
    body.innerHTML = `
      <div
        id="shopoll-theme-test"
        data-shopoll-root
        data-runtime-url="/shopoll-test-runtime.js"
        data-mode="popup"
        data-placement-key="storefront-popup"
        data-api-base="/apps/shopoll"
        data-locale="en"
        data-trigger-mode="server"
        data-label-question="Question"
        data-label-next="Next"
        data-label-submit="Submit"
        data-label-close="Close survey"
      ></div>`;
    document.dispatchEvent(new CustomEvent("shopify:section:load"));
  });

  await expect(
    page.getByRole("heading", { name: "Why did you choose Paper7?" }),
  ).toBeVisible();
  expect(runtimeRequests).toBe(1);

  if (process.env.SHOPOLL_SCREENSHOT_DIR) {
    await page.screenshot({
      path: path.join(
        process.env.SHOPOLL_SCREENSHOT_DIR,
        `shopoll-theme-popup-${testInfo.project.name}.png`,
      ),
    });
  }

  await page.getByLabel("Eye comfort").check();
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByRole("heading", { name: "Thank you" })).toBeVisible();
  expect(answerBodies.length).toBeGreaterThanOrEqual(1);
  expect(answerBodies.at(-1)).toMatchObject({
    questionId: "reason",
    value: "eye-comfort",
    resumeToken: "resume-1",
  });
  expect(String(answerBodies.at(-1)?.idempotencyKey)).toMatch(/^answer:/);
});
