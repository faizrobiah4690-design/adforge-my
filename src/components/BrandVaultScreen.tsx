import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Check, FolderPlus, Save, Shield, Sparkles, Trash2, Upload } from 'lucide-react';
import { SEEDED_DEMO_BRAND, THEME_COLOR_PRESETS } from '../data/seedVault';
import { useI18n } from '../i18n/I18nContext';
import { normalizeWhatsappDigits, useWorkbench } from '../state/WorkbenchContext';
import type { UiLanguage } from '../types/campaign';
import { normalizeLogoFile } from '../utils/imageNormalize';

const LOCAL_COPY: Record<
  UiLanguage,
  {
    blankFolderError: string;
    blankBrandNameError: string;
    invalidWhatsappError: string;
    invalidLogoError: string;
    savedFormatPrefix: string;
    activeFolderLabel: string;
  }
> = {
  ms: {
    blankFolderError: 'Sila masukkan nama folder jenama yang sah sebelum mencipta folder.',
    blankBrandNameError: 'Nama jenama tidak boleh dibiarkan kosong.',
    invalidWhatsappError:
      'Nombor WhatsApp tidak sah. Masukkan 9–15 digit nombor Malaysia (cth: 012-345 6789).',
    invalidLogoError: 'Fail logo tidak sah. Sila muat naik imej PNG (.png) yang sah.',
    savedFormatPrefix: 'Format disimpan:',
    activeFolderLabel: 'Folder Aktif',
  },
  en: {
    blankFolderError: 'Please enter a valid brand folder name before creating a folder.',
    blankBrandNameError: 'Brand name cannot be blank.',
    invalidWhatsappError:
      'Invalid WhatsApp number. Enter 9–15 Malaysian digits (e.g. 012-345 6789).',
    invalidLogoError: 'Invalid logo file. Please upload a valid PNG (.png) image.',
    savedFormatPrefix: 'Saved format:',
    activeFolderLabel: 'Active Folder',
  },
};

type BrandErrorCode = 'empty_folder' | 'empty_brand_name' | 'invalid_wa' | 'invalid_logo';

export function validateMalaysianWhatsapp(raw: string): {
  valid: boolean;
  normalized: string;
} {
  const trimmed = raw.trim();
  if (!trimmed || !/^[\d\s+\-()]+$/.test(trimmed)) {
    return { valid: false, normalized: '' };
  }
  const normalized = normalizeWhatsappDigits(trimmed);
  if (normalized.startsWith('0') || normalized.length < 9 || normalized.length > 15) {
    return { valid: false, normalized: '' };
  }
  return { valid: true, normalized };
}

export function BrandVaultScreen() {
  const { locale, t } = useI18n();
  const {
    isDemoMode,
    activeScreen,
    brands,
    activeBrand,
    selectBrand,
    createBrand,
    updateBrand,
    deleteBrand,
  } = useWorkbench();
  const copy = LOCAL_COPY[locale];

  const [newFolderName, setNewFolderName] = useState('');
  const [nameDraft, setNameDraft] = useState(activeBrand.name);
  const [waDraft, setWaDraft] = useState(activeBrand.whatsappNumber);
  const [brandErrorCode, setBrandErrorCode] = useState<BrandErrorCode | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const logoUploadSeqRef = useRef(0);

  const brandErrorMessage =
    brandErrorCode === 'empty_folder'
      ? copy.blankFolderError
      : brandErrorCode === 'empty_brand_name'
        ? copy.blankBrandNameError
        : brandErrorCode === 'invalid_wa'
          ? copy.invalidWhatsappError
          : brandErrorCode === 'invalid_logo'
            ? copy.invalidLogoError
            : null;

  useEffect(() => {
    logoUploadSeqRef.current += 1;
    setIsUploadingLogo(false);
    setNameDraft(activeBrand.name);
    setWaDraft(activeBrand.whatsappNumber);
    setBrandErrorCode(null);
    setSavedNotice(false);
  }, [activeBrand.id]);

  const handleCreateFolder = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = newFolderName.trim();
    if (!trimmed) {
      setBrandErrorCode('empty_folder');
      setSavedNotice(false);
      return;
    }
    setBrandErrorCode(null);
    setSavedNotice(false);
    createBrand({ name: trimmed });
    setNewFolderName('');
  };

  const handleLogoUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    const targetBrandId = activeBrand.id;
    const uploadSeq = ++logoUploadSeqRef.current;
    setIsUploadingLogo(true);
    setBrandErrorCode((prev) => (prev === 'invalid_logo' ? null : prev));
    setSavedNotice(false);
    try {
      const normalized = await normalizeLogoFile(file);
      if (logoUploadSeqRef.current !== uploadSeq) {
        return;
      }
      updateBrand(targetBrandId, { logoDataUrl: normalized.dataUrl });
      setBrandErrorCode((prev) => (prev === 'invalid_logo' ? null : prev));
      setSavedNotice(false);
    } catch {
      if (logoUploadSeqRef.current !== uploadSeq) {
        return;
      }
      setBrandErrorCode('invalid_logo');
      setSavedNotice(false);
    } finally {
      if (logoUploadSeqRef.current === uploadSeq) {
        setIsUploadingLogo(false);
      }
    }
  };

  const handleNameChange = (value: string) => {
    setNameDraft(value);
    setSavedNotice(false);
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      setBrandErrorCode((prev) => (prev === 'empty_brand_name' ? null : prev));
      updateBrand(activeBrand.id, { name: trimmed });
    }
  };

  const handleWhatsappChange = (value: string) => {
    setWaDraft(value);
    setSavedNotice(false);
    const check = validateMalaysianWhatsapp(value);
    if (check.valid) {
      setBrandErrorCode((prev) => (prev === 'invalid_wa' ? null : prev));
      updateBrand(activeBrand.id, { whatsappNumber: check.normalized });
    }
  };

  const handleWhatsappBlur = () => {
    const check = validateMalaysianWhatsapp(waDraft);
    if (!check.valid) {
      setBrandErrorCode('invalid_wa');
      return;
    }
    setBrandErrorCode((prev) => (prev === 'invalid_wa' ? null : prev));
    setWaDraft(check.normalized);
    updateBrand(activeBrand.id, { whatsappNumber: check.normalized });
  };

  const handleSaveBrand = () => {
    const trimmedName = nameDraft.trim();
    if (!trimmedName) {
      setBrandErrorCode('empty_brand_name');
      setSavedNotice(false);
      return;
    }

    const check = validateMalaysianWhatsapp(waDraft);
    if (!check.valid) {
      setBrandErrorCode('invalid_wa');
      setSavedNotice(false);
      return;
    }

    updateBrand(activeBrand.id, {
      name: trimmedName,
      whatsappNumber: check.normalized,
    });
    setNameDraft(trimmedName);
    setWaDraft(check.normalized);
    setBrandErrorCode(null);
    setSavedNotice(true);
  };

  return (
    <section
      data-testid="brand-vault-screen"
      className="rounded-2xl border border-slate-800 bg-[#111827] p-4 sm:p-5 min-w-0"
    >
      <div className="flex flex-wrap items-start justify-between gap-2 mb-4 min-w-0">
        <div className="min-w-0">
          <h2 className="text-base sm:text-lg font-semibold text-slate-100 break-words">
            {t('vault.title')}
          </h2>
          <p className="text-xs text-slate-400 break-words">{t('vault.subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          {isDemoMode ? (
            <span
              data-testid={
                activeScreen === 'onboarding' ? 'vault-demo-badge' : 'onboarding-demo-badge'
              }
              className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-300"
            >
              <Sparkles className="h-3 w-3 shrink-0" />
              {t('app.demoBadge')}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-[#0B0F19] px-2.5 py-1 text-[11px] text-slate-300 max-w-full">
            <Shield className="h-3 w-3 text-sky-400 shrink-0" />
            <span className="break-words whitespace-normal leading-tight">
              {t('vault.seededBadge')}: {brands.find((b) => b.isSeeded)?.name ?? SEEDED_DEMO_BRAND.name}
            </span>
          </span>
        </div>
      </div>

      <div data-testid="brand-folders-container" className="flex flex-wrap gap-2 mb-4 min-w-0">
        {brands.map((brand) => {
          const isActive = brand.id === activeBrand.id;
          return (
            <button
              key={brand.id}
              type="button"
              data-testid={`brand-folder-${brand.id}`}
              aria-pressed={isActive}
              onClick={() => selectBrand(brand.id)}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition cursor-pointer max-w-full min-w-0 ${
                isActive
                  ? 'border-sky-500 bg-sky-500/15 text-sky-200'
                  : 'border-slate-700 bg-[#0B0F19] text-slate-300 hover:border-slate-600'
              }`}
            >
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: brand.themeColor }}
              />
              <span className="break-words whitespace-normal text-left leading-tight max-w-full">
                {brand.name}
              </span>
            </button>
          );
        })}
      </div>

      <form onSubmit={handleCreateFolder} className="flex flex-col sm:flex-row gap-2 mb-4 min-w-0">
        <input
          type="text"
          data-testid="new-brand-name-input"
          value={newFolderName}
          onChange={(e) => {
            setNewFolderName(e.target.value);
            if (brandErrorCode === 'empty_folder') {
              setBrandErrorCode(null);
            }
          }}
          placeholder={t('vault.newFolderPlaceholder')}
          className="flex-1 min-w-0 rounded-lg border border-slate-700 bg-[#0B0F19] px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
        />
        <button
          type="submit"
          data-testid="create-brand-btn"
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-700 transition cursor-pointer shrink-0"
        >
          <FolderPlus className="h-3.5 w-3.5 shrink-0" />
          {t('vault.createBtn')}
        </button>
      </form>

      <div className="rounded-xl border border-slate-800 bg-[#0B0F19] p-3.5 space-y-3 min-w-0">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 min-w-0">
          <div className="min-w-0">
            <label
              htmlFor="brand-name-input"
              className="block text-xs font-medium text-slate-400 mb-1"
            >
              {t('vault.brandNameLabel')}
            </label>
            <input
              id="brand-name-input"
              data-testid="brand-name-input"
              type="text"
              value={nameDraft}
              onChange={(e) => handleNameChange(e.target.value)}
              className="w-full min-w-0 rounded-lg border border-slate-700 bg-[#111827] px-2.5 py-1.5 text-xs text-slate-100 focus:border-sky-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-3 min-w-0">
            <img
              data-testid="brand-logo-preview"
              src={activeBrand.logoDataUrl}
              alt={activeBrand.name}
              className="h-12 w-12 rounded-lg border border-slate-700 bg-slate-900 object-contain p-1 shrink-0"
            />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-slate-400 mb-1 break-words leading-tight">
                {t('vault.logoLabel')}
              </div>
              <input
                id="brand-logo-input"
                data-testid="brand-logo-input"
                type="file"
                accept="image/png"
                aria-label={t('vault.logoUploadBtn')}
                className="peer sr-only"
                onChange={(e) => {
                  void handleLogoUpload(e);
                }}
              />
              <label
                htmlFor="brand-logo-input"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-[11px] font-medium text-slate-200 hover:bg-slate-700 peer-focus-visible:ring-2 peer-focus-visible:ring-sky-400 transition cursor-pointer max-w-full"
              >
                <Upload className="h-3.5 w-3.5 shrink-0" />
                <span className="whitespace-normal leading-tight break-words">
                  {isUploadingLogo
                    ? locale === 'ms'
                      ? 'Memproses logo...'
                      : 'Processing logo...'
                    : t('vault.logoUploadBtn')}
                </span>
              </label>
            </div>
          </div>

          <div className="min-w-0">
            <label
              htmlFor="brand-color-input"
              className="block text-xs font-medium text-slate-400 mb-1"
            >
              {t('vault.themeColorLabel')}
            </label>
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <input
                id="brand-color-input"
                data-testid="brand-color-input"
                type="color"
                value={activeBrand.themeColor}
                onChange={(e) => {
                  setSavedNotice(false);
                  updateBrand(activeBrand.id, { themeColor: e.target.value });
                }}
                className="h-8 w-10 rounded border border-slate-700 bg-transparent cursor-pointer shrink-0"
              />
              <div className="flex flex-wrap gap-1.5 min-w-0">
                {THEME_COLOR_PRESETS.map((hex) => {
                  const selected = activeBrand.themeColor.toLowerCase() === hex.toLowerCase();
                  return (
                    <button
                      key={hex}
                      type="button"
                      aria-label={hex}
                      aria-pressed={selected}
                      onClick={() => {
                        setSavedNotice(false);
                        updateBrand(activeBrand.id, { themeColor: hex });
                      }}
                      className={`h-5 w-5 rounded-full border cursor-pointer shrink-0 transition ${
                        selected ? 'border-white ring-2 ring-sky-400/70' : 'border-slate-700'
                      }`}
                      style={{ backgroundColor: hex }}
                    />
                  );
                })}
              </div>
            </div>
          </div>

          <div className="min-w-0">
            <span className="block text-xs font-medium text-slate-400 mb-1">
              {t('vault.toneLabel')}
            </span>
            <div className="grid grid-cols-2 gap-1.5 min-w-0">
              <button
                type="button"
                data-testid="brand-tone-casual"
                aria-pressed={activeBrand.tone === 'casual'}
                data-active={activeBrand.tone === 'casual' ? 'true' : 'false'}
                onClick={() => {
                  setSavedNotice(false);
                  updateBrand(activeBrand.id, { tone: 'casual' });
                }}
                className={`rounded-lg border px-2 py-1.5 text-[11px] font-medium transition cursor-pointer whitespace-normal leading-tight text-center min-w-0 ${
                  activeBrand.tone === 'casual'
                    ? 'border-sky-500 bg-sky-500/20 text-sky-200'
                    : 'border-slate-700 bg-[#111827] text-slate-300 hover:border-slate-600'
                }`}
              >
                {t('vault.toneCasual')}
              </button>
              <button
                type="button"
                data-testid="brand-tone-professional"
                aria-pressed={activeBrand.tone === 'professional'}
                data-active={activeBrand.tone === 'professional' ? 'true' : 'false'}
                onClick={() => {
                  setSavedNotice(false);
                  updateBrand(activeBrand.id, { tone: 'professional' });
                }}
                className={`rounded-lg border px-2 py-1.5 text-[11px] font-medium transition cursor-pointer whitespace-normal leading-tight text-center min-w-0 ${
                  activeBrand.tone === 'professional'
                    ? 'border-sky-500 bg-sky-500/20 text-sky-200'
                    : 'border-slate-700 bg-[#111827] text-slate-300 hover:border-slate-600'
                }`}
              >
                {t('vault.toneProfessional')}
              </button>
            </div>
          </div>

          <div className="min-w-0">
            <label
              htmlFor="brand-whatsapp-input"
              className="block text-xs font-medium text-slate-400 mb-1"
            >
              {t('vault.whatsappLabel')}
            </label>
            <input
              id="brand-whatsapp-input"
              data-testid="brand-whatsapp-input"
              type="text"
              value={waDraft}
              onChange={(e) => handleWhatsappChange(e.target.value)}
              onBlur={handleWhatsappBlur}
              placeholder={t('vault.whatsappHint')}
              className="w-full min-w-0 rounded-lg border border-slate-700 bg-[#111827] px-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
            />
            <p className="mt-1 text-[10px] text-slate-500 break-words leading-tight">
              {copy.savedFormatPrefix} {activeBrand.whatsappNumber}
            </p>
          </div>
        </div>

        {brandErrorMessage ? (
          <p
            role="alert"
            data-testid="brand-error"
            className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-300 break-words"
          >
            {brandErrorMessage}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-800/80 min-w-0">
          <p className="text-[11px] text-slate-400 break-words [overflow-wrap:anywhere] max-w-full min-w-0">
            {copy.activeFolderLabel}: <strong className="text-slate-200">{activeBrand.name}</strong> —{' '}
            {t('vault.isolationNote')}
          </p>
          <div className="flex flex-wrap items-center gap-2 max-w-full min-w-0">
            {savedNotice ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-300">
                <Check className="h-3.5 w-3.5 shrink-0" />
                {t('vault.savedToast')}
              </span>
            ) : null}
            {!activeBrand.isSeeded && brands.length > 1 ? (
              <button
                type="button"
                data-testid="delete-brand-btn"
                disabled={isUploadingLogo}
                onClick={() => {
                  setSavedNotice(false);
                  setBrandErrorCode(null);
                  deleteBrand(activeBrand.id);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-200 hover:bg-rose-500/20 disabled:opacity-60 disabled:cursor-not-allowed transition cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5 shrink-0" />
                {t('vault.deleteFolderBtn')}
              </button>
            ) : null}
            <button
              type="button"
              data-testid="brand-save-btn"
              disabled={isUploadingLogo}
              onClick={handleSaveBrand}
              className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-sky-400 disabled:opacity-60 disabled:cursor-not-allowed transition cursor-pointer"
            >
              <Save className="h-3.5 w-3.5 shrink-0" />
              {t('vault.saveChangesBtn')}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
