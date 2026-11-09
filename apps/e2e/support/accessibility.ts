import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page } from '@playwright/test';

export async function auditAccessibility(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(result.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    nodes: violation.nodes.map((node) => ({ target: node.target, failureSummary: node.failureSummary })),
  }))).toEqual([]);
}

export async function expectFocusTrap(page: Page, dialog: Locator): Promise<void> {
  for (const key of ['Tab', 'Shift+Tab']) {
    for (let step = 0; step < 8; step += 1) {
      await page.keyboard.press(key);
      expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    }
  }
}

export async function expectControlWithinViewport(control: Locator): Promise<void> {
  await control.scrollIntoViewIfNeeded();
  await expectControlVisibleWithoutScrolling(control);
}

/** Persistent actions must already be visible: this assertion never repairs scrolling. */
export async function expectControlVisibleWithoutScrolling(control: Locator): Promise<void> {
  await expect(control).toBeInViewport();
  const bounds = await control.boundingBox();
  const viewport = control.page().viewportSize();
  if (!bounds || !viewport) throw new Error('Controle ou viewport ausente na prova de reflow.');
  expect(bounds.x).toBeGreaterThanOrEqual(-1);
  expect(bounds.y).toBeGreaterThanOrEqual(-1);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height + 1);
}
