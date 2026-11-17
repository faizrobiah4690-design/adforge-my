import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { I18nProvider, useI18n } from '../../src/i18n/I18nContext';
import { LABELS } from '../../src/i18n/labels';

function I18nProbe() {
  const { locale, setLocale, t } = useI18n();
  return (
    <div>
      <span data-testid="probe-locale">{locale}</span>
      <span data-testid="probe-cta">{t('form.launchCta')}</span>
      <span data-testid="probe-unknown">{t('missing.key.check')}</span>
      <button type="button" data-testid="switch-en" onClick={() => setLocale('en')}>
        EN
      </button>
      <button type="button" data-testid="switch-ms" onClick={() => setLocale('ms')}>
        BM
      </button>
    </div>
  );
}

describe('i18n dictionary & I18nContext', () => {
  it('maintains exact sorted key parity between ms and en with non-empty values', () => {
    const msKeys = Object.keys(LABELS.ms).sort();
    const enKeys = Object.keys(LABELS.en).sort();
    expect(msKeys).toEqual(enKeys);

    for (const key of msKeys) {
      expect(LABELS.ms[key as keyof typeof LABELS.ms].trim().length).toBeGreaterThan(0);
      expect(LABELS.en[key as keyof typeof LABELS.en].trim().length).toBeGreaterThan(0);
    }
  });

  it('defaults to ms, toggles cleanly to en and back, and falls back for unknown keys', () => {
    render(
      <I18nProvider>
        <I18nProbe />
      </I18nProvider>
    );

    expect(screen.getByTestId('probe-locale')).toHaveTextContent('ms');
    expect(screen.getByTestId('probe-cta')).toHaveTextContent('Bina Kempen');
    expect(screen.getByTestId('probe-unknown')).toHaveTextContent('missing.key.check');
    expect(document.documentElement.lang).toBe('ms');

    fireEvent.click(screen.getByTestId('switch-en'));
    expect(screen.getByTestId('probe-locale')).toHaveTextContent('en');
    expect(screen.getByTestId('probe-cta')).toHaveTextContent('Build Campaign');
    expect(document.documentElement.lang).toBe('en');

    fireEvent.click(screen.getByTestId('switch-ms'));
    expect(screen.getByTestId('probe-locale')).toHaveTextContent('ms');
    expect(screen.getByTestId('probe-cta')).toHaveTextContent('Bina Kempen');
    expect(document.documentElement.lang).toBe('ms');
  });
});
