import path from "node:path";
import { expect, test } from "@playwright/test";

const token = "abcdefghijklmnopqrstuvwx12345678";

test("standalone invitation saves immediately and polls an idempotent pending reward", async ({ page }, testInfo) => {
  let answerWrites = 0;
  let completions = 0;
  const completionKeys: string[] = [];
  await page.route("**/api/public/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/surveys/resolve")) {
      await route.fulfill({
        json: {
          eligible: true,
          survey: {
            id: "survey-1",
            versionId: "version-1",
            title: "Harbor purchase survey",
            definition: {
              schemaVersion: 1,
              surveyId: "survey-1",
              title: "Harbor purchase survey",
              startQuestionId: "welcome",
              locale: "en",
              questions: [
                { id: "welcome", type: "welcome", title: "Tell us what mattered" },
                {
                  id: "reason",
                  type: "single_choice",
                  title: "Why did you choose Paper7?",
                  required: true,
                  options: [
                    { id: "eye-care", label: "Zero blue light / eye comfort" },
                    { id: "outdoor", label: "Outdoor readability" },
                  ],
                },
                { id: "end", type: "end", title: "Thank you" },
              ],
              completion: { title: "Thank you", message: "Your feedback has been recorded." },
            },
          },
        },
      });
      return;
    }
    if (url.pathname.endsWith("/sessions")) {
      await route.fulfill({ json: { sessionId: "session-1", resumeToken: "resume-1", answers: [] } });
      return;
    }
    if (url.pathname.includes("/answers/")) {
      answerWrites += 1;
      await route.fulfill({ json: { nextQuestionId: "end", complete: false } });
      return;
    }
    if (url.pathname.endsWith("/complete")) {
      completions += 1;
      completionKeys.push(String(route.request().postDataJSON().idempotencyKey));
      await route.fulfill({
        json: {
          completion: { title: "Thank you", message: "Your feedback has been recorded." },
          reward: completions === 1
            ? { status: "pending" }
            : { status: "issued", code: "HARBOR10", expiresAt: "2026-08-09T00:00:00.000Z" },
        },
      });
      return;
    }
    await route.abort();
  });

  await page.goto(`/s/${token}?lang=en`);
  await expect(page.getByRole("heading", { name: "Tell us what mattered" })).toBeVisible();
  await page.getByRole("button", { name: /Start survey/ }).click();
  if (process.env.SHOPOLL_SCREENSHOT_DIR) {
    await page.screenshot({
      path: path.join(process.env.SHOPOLL_SCREENSHOT_DIR, `shopoll-survey-${testInfo.project.name}.png`),
      fullPage: true,
    });
  }
  await page.getByRole("radio", { name: /Zero blue light/ }).click();
  await expect.poll(() => answerWrites).toBe(1);
  await page.getByRole("button", { name: /Continue|Submit/ }).click();
  await expect(page.getByText("HARBOR10")).toBeVisible();
  expect(completions).toBe(2);
  expect(new Set(completionKeys).size).toBe(1);
  expect(answerWrites).toBeGreaterThanOrEqual(1);
});
