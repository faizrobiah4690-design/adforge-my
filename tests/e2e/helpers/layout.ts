import { expect, type BrowserContext, type Page, type Request, type Response } from '@playwright/test';

export async function assertNoHorizontalOverflow(page: Page, label = 'viewport'): Promise<void> {
  const result = await page.evaluate(() => {
    const innerWidth = window.innerWidth;
    const clientWidth = document.documentElement.clientWidth;
    const scrollWidth = document.documentElement.scrollWidth;
    const maxWidth = Math.min(innerWidth, clientWidth);
    const offenders: Array<{ tag: string; testid: string | null; right: number }> = [];
    if (scrollWidth > maxWidth) {
      for (const el of Array.from(document.querySelectorAll<HTMLElement>('*'))) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.right > maxWidth + 1) {
          offenders.push({
            tag: el.tagName.toLowerCase(),
            testid: el.getAttribute('data-testid'),
            right: Math.round(rect.right),
          });
          if (offenders.length >= 5) break;
        }
      }
    }
    return { innerWidth, clientWidth, scrollWidth, maxWidth, offenders };
  });

  expect(
    result.scrollWidth,
    `Horizontal overflow detected (${label}): scrollWidth=${result.scrollWidth} > clientWidth=${result.clientWidth} / innerWidth=${result.innerWidth}; offenders=${JSON.stringify(result.offenders)}`,
  ).toBeLessThanOrEqual(result.maxWidth);
}

export async function assertNoElementClipping(page: Page, label = 'viewport'): Promise<void> {
  const result = await page.evaluate(() => {
    const clientWidth = document.documentElement.clientWidth;
    const issues: Array<{
      kind: string;
      tag: string;
      testid: string | null;
      text: string;
      detail: string;
    }> = [];

    const isVisuallyHidden = (el: HTMLElement): boolean => {
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return true;
      }
      if (el.classList.contains('sr-only')) return true;
      const r = el.getBoundingClientRect();
      return r.width <= 1 && r.height <= 1;
    };

    const selector =
      'button, a, [role="tab"], h1, h2, h3, h4, input, textarea, select, [data-testid$="-badge"]';
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
      if (el.closest('[aria-hidden="true"]') || el.closest('[inert]')) continue;
      if (el.closest('[data-carousel-stage="true"]')) continue;
      if (isVisuallyHidden(el)) continue;

      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;

      const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
      const testid = el.getAttribute('data-testid');

      // 1. Viewport bounds check
      if (rect.left < -1 || rect.right > clientWidth + 1) {
        issues.push({
          kind: 'viewport-clip',
          tag: el.tagName.toLowerCase(),
          testid,
          text,
          detail: `left=${Math.round(rect.left)}, right=${Math.round(rect.right)}, clientWidth=${clientWidth}`,
        });
      }

      // 2. Text / inner content horizontal clipping check on interactive/badge/heading elements
      const tag = el.tagName.toLowerCase();
      if (tag !== 'input' && tag !== 'textarea' && tag !== 'select') {
        const style = window.getComputedStyle(el);
        if (style.overflowX === 'hidden' || style.overflowX === 'clip') {
          if (el.scrollWidth > el.clientWidth + 2) {
            issues.push({
              kind: 'self-text-clip',
              tag,
              testid,
              text,
              detail: `scrollWidth=${el.scrollWidth} > clientWidth=${el.clientWidth}`,
            });
          }
        }
        for (const child of Array.from(el.querySelectorAll<HTMLElement>('span, div, p'))) {
          if (isVisuallyHidden(child)) continue;
          const cs = window.getComputedStyle(child);
          if (
            (cs.overflowX === 'hidden' || cs.overflowX === 'clip') &&
            child.scrollWidth > child.clientWidth + 2
          ) {
            issues.push({
              kind: 'child-text-clip',
              tag: child.tagName.toLowerCase(),
              testid,
              text: (child.textContent ?? '').trim().slice(0, 60),
              detail: `scrollWidth=${child.scrollWidth} > clientWidth=${child.clientWidth}`,
            });
          }
        }
      }

      // 3. Ancestor overflow-hidden clipping check
      let parent = el.parentElement;
      while (parent && parent !== document.documentElement) {
        const ps = window.getComputedStyle(parent);
        if (
          (ps.overflowX === 'hidden' || ps.overflowX === 'clip') &&
          ps.overflowY !== 'auto' &&
          ps.overflowY !== 'scroll'
        ) {
          const pRect = parent.getBoundingClientRect();
          if (rect.left < pRect.left - 2 || rect.right > pRect.right + 2) {
            issues.push({
              kind: 'ancestor-clip',
              tag,
              testid,
              text,
              detail: `child(${Math.round(rect.left)}..${Math.round(rect.right)}) outside parent(${Math.round(pRect.left)}..${Math.round(pRect.right)})`,
            });
            break;
          }
        }
        parent = parent.parentElement;
      }

      if (issues.length >= 10) break;
    }

    return { clientWidth, issues };
  });

  expect(
    result.issues,
    `Element clipping detected (${label} @ ${result.clientWidth}px): ${JSON.stringify(result.issues)}`,
  ).toEqual([]);
}

function clusterPositions(values: number[], tolerancePx = 4): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const clusters: number[] = [];
  for (const v of sorted) {
    if (clusters.length === 0 || Math.abs(v - clusters[clusters.length - 1]) > tolerancePx) {
      clusters.push(v);
    }
  }
  return clusters;
}

export async function assertTabGridLayout(
  page: Page,
  mode: 'mobile-2x2' | 'desktop-1x4',
  containerSelector = '[data-testid="workspace-tabs"]',
): Promise<void> {
  const container = page.locator(containerSelector).or(page.getByRole('tablist')).first();
  await expect(container).toBeVisible();

  const { clientWidth, boxes } = await container.evaluate((el) => {
    const tabs = Array.from(el.querySelectorAll(':scope > [role="tab"], :scope > button'));
    const targets = tabs.length > 0 ? tabs : Array.from(el.children);
    return {
      clientWidth: document.documentElement.clientWidth,
      boxes: targets.map((child, index) => {
        const r = child.getBoundingClientRect();
        return {
          index,
          text: (child.textContent ?? '').trim(),
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
          right: r.right,
          bottom: r.bottom,
        };
      }),
    };
  });

  expect(boxes, `Expected exactly 4 tab elements inside ${containerSelector}`).toHaveLength(4);
  for (const b of boxes) {
    expect(b.width, `Tab "${b.text}" width should be > 40px`).toBeGreaterThan(40);
    expect(b.height, `Tab "${b.text}" height should be > 24px`).toBeGreaterThan(24);
  }

  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      const separated =
        a.right <= b.x + 1 || b.right <= a.x + 1 || a.bottom <= b.y + 1 || b.bottom <= a.y + 1;
      expect(separated, `Tabs ${i} and ${j} overlap: ${JSON.stringify({ a, b })}`).toBe(true);
    }
  }

  const xCols = clusterPositions(boxes.map((b) => b.x));
  const yRows = clusterPositions(boxes.map((b) => b.y));

  if (mode === 'mobile-2x2') {
    expect(xCols, `Expected 2 distinct X columns at mobile, got ${JSON.stringify(xCols)}`).toHaveLength(2);
    expect(yRows, `Expected 2 distinct Y rows at mobile, got ${JSON.stringify(yRows)}`).toHaveLength(2);
    for (const rowY of yRows) {
      expect(boxes.filter((b) => Math.abs(b.y - rowY) <= 4)).toHaveLength(2);
    }
    for (const colX of xCols) {
      expect(boxes.filter((b) => Math.abs(b.x - colX) <= 4)).toHaveLength(2);
    }
    for (const b of boxes) {
      expect(b.right, `Mobile tab "${b.text}" must stay inside ${clientWidth}px`).toBeLessThanOrEqual(clientWidth + 1);
    }
  } else {
    expect(xCols, `Expected 4 distinct X columns at desktop, got ${JSON.stringify(xCols)}`).toHaveLength(4);
    expect(yRows, `Expected 1 distinct Y row at desktop, got ${JSON.stringify(yRows)}`).toHaveLength(1);
  }
}

export async function assertMobile2x2TabGrid(
  page: Page,
  containerSelector = '[data-testid="workspace-tabs"]',
): Promise<void> {
  return assertTabGridLayout(page, 'mobile-2x2', containerSelector);
}

export interface RuntimeErrorEntry {
  kind: 'pageerror' | 'console.error';
  message: string;
  location?: string;
}

export interface RuntimeErrorCollector {
  errors: RuntimeErrorEntry[];
  clear: () => void;
  assertClean: (ignorePatterns?: RegExp[]) => void;
  detach: () => void;
}

export function attachRuntimeErrorCollector(page: Page): RuntimeErrorCollector {
  const errors: RuntimeErrorEntry[] = [];

  const onPageError = (err: Error) => {
    errors.push({
      kind: 'pageerror',
      message: err.stack || err.message || String(err),
    });
  };

  const onConsole = (msg: { type: () => string; text: () => string; location: () => { url: string; lineNumber: number } }) => {
    if (msg.type() === 'error') {
      const loc = msg.location();
      errors.push({
        kind: 'console.error',
        message: msg.text(),
        location: loc?.url ? `${loc.url}:${loc.lineNumber}` : undefined,
      });
    }
  };

  page.on('pageerror', onPageError);
  page.on('console', onConsole);

  return {
    errors,
    clear: () => {
      errors.length = 0;
    },
    assertClean: (ignorePatterns = []) => {
      const remaining = errors.filter(
        (entry) => !ignorePatterns.some((re) => re.test(entry.message)),
      );
      expect(
        remaining,
        `Unexpected runtime/console errors:\n${remaining.map((e) => `[${e.kind}] ${e.message} (${e.location ?? ''})`).join('\n')}`,
      ).toEqual([]);
    },
    detach: () => {
      page.off('pageerror', onPageError);
      page.off('console', onConsole);
    },
  };
}

export interface NetworkAuditCollector {
  externalRequests: string[];
  failedResponses: Array<{ url: string; status: number }>;
  assertSameOriginAndHealthy: () => void;
  detach: () => void;
}

export function attachNetworkOriginAuditor(page: Page): NetworkAuditCollector {
  const externalRequests: string[] = [];
  const failedResponses: Array<{ url: string; status: number }> = [];

  const onRequest = (req: Request) => {
    const url = req.url();
    if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('about:')) {
      return;
    }
    try {
      const parsed = new URL(url);
      if (parsed.hostname !== '127.0.0.1' && parsed.hostname !== 'localhost') {
        externalRequests.push(url);
      }
    } catch {
      externalRequests.push(url);
    }
  };

  const onResponse = (res: Response) => {
    const url = res.url();
    if (url.startsWith('data:') || url.startsWith('blob:')) return;
    if (res.status() >= 400) {
      failedResponses.push({ url, status: res.status() });
    }
  };

  page.on('request', onRequest);
  page.on('response', onResponse);

  return {
    externalRequests,
    failedResponses,
    assertSameOriginAndHealthy: () => {
      expect(
        externalRequests,
        `Unexpected external network requests: ${JSON.stringify(externalRequests)}`,
      ).toEqual([]);
      expect(
        failedResponses,
        `Failed network responses (>=400): ${JSON.stringify(failedResponses)}`,
      ).toEqual([]);
    },
    detach: () => {
      page.off('request', onRequest);
      page.off('response', onResponse);
    },
  };
}

export async function grantClipboardPermissions(
  context: BrowserContext,
  origin = 'http://127.0.0.1:4173',
): Promise<void> {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
}

export async function installClipboardSpy(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const win = window as unknown as {
      __ppxClipboardLog?: string[];
      __ppxClipboardOrigWrite?: (text: string) => Promise<void>;
    };
    win.__ppxClipboardLog = [];

    const origClipboard = navigator.clipboard;
    if (origClipboard && typeof origClipboard.writeText === 'function') {
      const origWrite = origClipboard.writeText.bind(origClipboard);
      win.__ppxClipboardOrigWrite = origWrite;
      try {
        Object.defineProperty(origClipboard, 'writeText', {
          configurable: true,
          value: async (text: string) => {
            win.__ppxClipboardLog!.push(String(text));
            try {
              return await origWrite(text);
            } catch {
              return undefined;
            }
          },
        });
      } catch {
        // Ignore if non-configurable
      }
    }

    const origExecCommand = document.execCommand?.bind(document);
    if (typeof origExecCommand === 'function') {
      document.execCommand = (commandId: string, showUI?: boolean, value?: string) => {
        if (commandId.toLowerCase() === 'copy') {
          const active = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
          const selected = window.getSelection()?.toString() || active?.value || '';
          if (selected) {
            win.__ppxClipboardLog!.push(selected);
          }
        }
        return origExecCommand(commandId, showUI, value);
      };
    }
  });
}

export async function clearClipboardSpy(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const win = window as unknown as {
      __ppxClipboardLog?: string[];
      __ppxClipboardOrigWrite?: (text: string) => Promise<void>;
    };
    win.__ppxClipboardLog = [];
    try {
      if (win.__ppxClipboardOrigWrite) {
        await win.__ppxClipboardOrigWrite('');
      } else if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText('');
        win.__ppxClipboardLog = [];
      }
    } catch {
      // Ignore if native clipboard write is blocked in context
    }
  });
}

export async function readClipboardWithFallback(page: Page): Promise<string> {
  const result = await page.evaluate(async () => {
    let nativeText: string | null = null;
    try {
      nativeText = await navigator.clipboard.readText();
    } catch {
      nativeText = null;
    }
    const log = (window as unknown as { __ppxClipboardLog?: string[] }).__ppxClipboardLog ?? [];
    const spyLast = log.length > 0 ? log[log.length - 1] : null;
    return { nativeText, spyLast };
  });

  const value = result.nativeText || result.spyLast;
  if (!value || value.trim().length === 0) {
    throw new Error('Clipboard read returned empty from both navigator.clipboard.readText() and spy log');
  }
  return value;
}

export async function assertDarkBackground(page: Page, targetSelector = 'body'): Promise<void> {
  const lum = await page.evaluate((sel) => {
    const el = document.querySelector(sel) || document.body;
    const style = window.getComputedStyle(el);
    const bg = style.backgroundColor;
    const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!m) return 0;
    const [r, g, b] = [Number(m[1]) / 255, Number(m[2]) / 255, Number(m[3]) / 255];
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }, targetSelector);
  expect(lum, `Expected dark-mode background luminance < 0.2, got ${lum}`).toBeLessThan(0.2);
}
