export const POLLINATIONS_TEXT_ENDPOINT = 'https://text.pollinations.ai/openai';
export const POLLINATIONS_IMAGE_BASE_URL = 'https://image.pollinations.ai/prompt/';
export const POLLINATIONS_COOLDOWN_MS = 45_000;

let pollinationsCooldownUntilMs = 0;

export function getPollinationsCooldownUntil(): number {
  return pollinationsCooldownUntilMs;
}

export function resetPollinationsCooldown(): void {
  pollinationsCooldownUntilMs = 0;
}

export function canCallBuiltInAiNetwork(): boolean {
  const g = globalThis as { __ADFORGE_ALLOW_LIVE_AI_IN_TESTS__?: boolean };
  if (g.__ADFORGE_ALLOW_LIVE_AI_IN_TESTS__ === true) {
    return true;
  }
  if (typeof navigator !== 'undefined' && navigator.webdriver === true) {
    return false;
  }
  if (
    typeof import.meta !== 'undefined' &&
    (import.meta as { env?: { MODE?: string } }).env?.MODE === 'test'
  ) {
    return false;
  }
  return true;
}

export function stripJsonCodeFenceAndExtract(rawText: string): string {
  const trimmed = rawText.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenceMatch ? fenceMatch[1].trim() : trimmed;
  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return candidate.slice(firstBrace, lastBrace + 1);
  }
  return candidate;
}

export function formatByokErrorReason(params: {
  provider: string;
  status?: number;
  detail?: string;
  timedOut?: boolean;
}): string {
  if (params.timedOut) {
    return `Timeout: ${params.provider} tidak membalas dalam had masa.`;
  }
  if (params.status === 401 || params.status === 403) {
    return `HTTP ${params.status}: Kunci API ${params.provider} tidak sah atau tiada kebenaran.`;
  }
  if (params.status === 429) {
    return `HTTP 429: Had kuota ${params.provider} penuh buat sementara.`;
  }
  if (params.status && params.status >= 500) {
    return `HTTP ${params.status}: Pelayan ${params.provider} sedang sibuk.`;
  }
  if (params.status && params.status >= 400) {
    return `HTTP ${params.status}: Permintaan ke ${params.provider} ditolak.`;
  }
  if (params.detail === 'invalid_json') {
    return `Format JSON daripada ${params.provider} tidak lengkap.`;
  }
  if (params.detail) {
    return `${params.provider}: ${params.detail}`;
  }
  return `Ralat rangkaian semasa menghubungi ${params.provider}.`;
}

function linkPollinationsAbortSignals(
  externalSignal: AbortSignal | undefined,
  timeoutMs: number
): { controller: AbortController; wasTimeout: () => boolean; cleanup: () => void } {
  const controller = new AbortController();
  let timedOut = false;

  const onExternalAbort = () => {
    controller.abort();
  };

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  const timerId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, Math.max(200, timeoutMs));

  return {
    controller,
    wasTimeout: () => timedOut,
    cleanup: () => {
      clearTimeout(timerId);
      if (externalSignal) {
        externalSignal.removeEventListener('abort', onExternalAbort);
      }
    },
  };
}

export interface PollinationsTextResponse<T> {
  ok: true;
  data: T;
  cooldownUntilMs: number;
}

export interface PollinationsTextFailure {
  ok: false;
  reason: string;
  status?: number;
  cooldownUntilMs: number | null;
  skippedByGuard?: boolean;
}

export async function callPollinationsJson<T>(params: {
  isDemoMode: boolean;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<PollinationsTextResponse<T> | PollinationsTextFailure> {
  if (params.isDemoMode) {
    return {
      ok: false,
      reason: 'demo_mode',
      cooldownUntilMs: null,
      skippedByGuard: true,
    };
  }

  if (!canCallBuiltInAiNetwork()) {
    return {
      ok: false,
      reason: 'test_network_guard',
      cooldownUntilMs: null,
      skippedByGuard: true,
    };
  }

  if (params.signal?.aborted) {
    return {
      ok: false,
      reason: 'aborted',
      cooldownUntilMs: pollinationsCooldownUntilMs > Date.now() ? pollinationsCooldownUntilMs : null,
    };
  }

  const now = Date.now();
  if (now < pollinationsCooldownUntilMs) {
    return {
      ok: false,
      reason: 'cooldown',
      cooldownUntilMs: pollinationsCooldownUntilMs,
      skippedByGuard: true,
    };
  }

  // Enforce 45s anonymous rate-limit cooldown immediately upon request dispatch
  const nextCooldown = now + POLLINATIONS_COOLDOWN_MS;
  pollinationsCooldownUntilMs = nextCooldown;

  const { controller, wasTimeout, cleanup } = linkPollinationsAbortSignals(
    params.signal,
    params.timeoutMs ?? 24_000
  );

  try {
    const response = await fetch(POLLINATIONS_TEXT_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai-fast',
        reasoning_effort: 'low',
        temperature: params.temperature ?? 0.75,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: params.systemPrompt },
          { role: 'user', content: params.userPrompt },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      if (response.status === 429) {
        const retryAfterRaw = response.headers?.get?.('retry-after');
        const retryAfterSec = retryAfterRaw ? Number.parseInt(retryAfterRaw, 10) : NaN;
        if (Number.isFinite(retryAfterSec) && retryAfterSec > 0) {
          const cappedMs = Math.min(120_000, retryAfterSec * 1000);
          pollinationsCooldownUntilMs = Math.max(
            pollinationsCooldownUntilMs,
            Date.now() + cappedMs
          );
        }
      }
      return {
        ok: false,
        reason: formatByokErrorReason({
          provider: 'AI Terbina Dalam',
          status: response.status,
        }),
        status: response.status,
        cooldownUntilMs: pollinationsCooldownUntilMs,
      };
    }

    const json = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string | Array<{ text?: string }>;
        };
      }>;
    };

    const rawContent = json?.choices?.[0]?.message?.content;
    const textContent = Array.isArray(rawContent)
      ? rawContent.map((part) => (typeof part?.text === 'string' ? part.text : '')).join('\n')
      : typeof rawContent === 'string'
        ? rawContent
        : '';

    if (!textContent.trim()) {
      return {
        ok: false,
        reason: formatByokErrorReason({
          provider: 'AI Terbina Dalam',
          detail: 'invalid_json',
        }),
        cooldownUntilMs: pollinationsCooldownUntilMs,
      };
    }

    const parsed = JSON.parse(stripJsonCodeFenceAndExtract(textContent)) as T;
    if (!parsed || typeof parsed !== 'object') {
      return {
        ok: false,
        reason: formatByokErrorReason({
          provider: 'AI Terbina Dalam',
          detail: 'invalid_json',
        }),
        cooldownUntilMs: pollinationsCooldownUntilMs,
      };
    }

    return {
      ok: true,
      data: parsed,
      cooldownUntilMs: pollinationsCooldownUntilMs,
    };
  } catch (err) {
    if (wasTimeout()) {
      return {
        ok: false,
        reason: formatByokErrorReason({
          provider: 'AI Terbina Dalam',
          timedOut: true,
        }),
        cooldownUntilMs: pollinationsCooldownUntilMs,
      };
    }
    if (err instanceof Error && err.name === 'AbortError') {
      return {
        ok: false,
        reason: 'aborted',
        cooldownUntilMs: pollinationsCooldownUntilMs,
      };
    }
    return {
      ok: false,
      reason: formatByokErrorReason({
        provider: 'AI Terbina Dalam',
        detail: err instanceof Error && err.message ? err.message : undefined,
      }),
      cooldownUntilMs: pollinationsCooldownUntilMs,
    };
  } finally {
    cleanup();
  }
}
