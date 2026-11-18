import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { ImagePlus, Images, Rocket, Trash2 } from 'lucide-react';
import {
  SAMPLE_BUSINESS_PHOTOS,
  SAMPLE_OFFER_CHIP,
  SME_OFFER_PRESETS,
} from '../data/seedVault';
import { useI18n } from '../i18n/I18nContext';
import { useCampaign } from '../state/CampaignContext';
import { useWorkbench } from '../state/WorkbenchContext';
import type { PhotoAsset, UiLanguage } from '../types/campaign';
import { normalizePhotoFile } from '../utils/imageNormalize';

const EMPTY_PHOTO_ASSET: PhotoAsset = {
  id: '',
  label: '',
  src: '',
  isSample: false,
};

const LOCAL_COPY: Record<
  UiLanguage,
  {
    pickSampleBtn: string;
    clearPhotoBtn: string;
    noPhotoAttached: string;
    sampleBadge: string;
    uploadedBadge: string;
    emptyOfferError: string;
    missingPhotosError: string;
    invalidPhotoError: string;
  }
> = {
  ms: {
    pickSampleBtn: 'Pilih Foto Sampel Bisnes',
    clearPhotoBtn: 'Padam',
    noPhotoAttached: 'Tiada foto dipilih',
    sampleBadge: 'Sampel',
    uploadedBadge: 'Dimuat naik',
    emptyOfferError: 'Sila masukkan ayat tawaran kempen sebelum klik Bina Kempen.',
    missingPhotosError:
      'Sila lampirkan kedua-dua Foto 1 dan Foto 2 (muat naik atau pilih foto sampel bisnes).',
    invalidPhotoError: 'Fail foto tidak sah. Sila muat naik imej PNG, JPG, atau WEBP.',
  },
  en: {
    pickSampleBtn: 'Pick Sample Business Photo',
    clearPhotoBtn: 'Clear',
    noPhotoAttached: 'No photo attached',
    sampleBadge: 'Sample',
    uploadedBadge: 'Uploaded',
    emptyOfferError: 'Please enter a campaign offer sentence before clicking Build Campaign.',
    missingPhotosError:
      'Please attach both Photo 1 and Photo 2 (upload or pick sample business photos).',
    invalidPhotoError: 'Invalid photo file. Please upload a PNG, JPG, or WEBP image.',
  },
};

type CampaignFormErrorCode = 'empty_offer' | 'missing_photos' | 'invalid_photo';

export function QuickCampaignForm() {
  const { locale, t } = useI18n();
  const { brands, selectBrand } = useWorkbench();
  const { input, setInput, launchCampaign, isLaunched } = useCampaign();
  const copy = LOCAL_COPY[locale];

  const [openGallerySlot, setOpenGallerySlot] = useState<0 | 1 | null>(null);
  const [formErrorCode, setFormErrorCode] = useState<CampaignFormErrorCode | null>(null);
  const [uploadingSlots, setUploadingSlots] = useState<[boolean, boolean]>([false, false]);
  const uploadSeqRef = useRef<[number, number]>([0, 0]);
  const isUploadingAnyPhoto = uploadingSlots[0] || uploadingSlots[1];

  const formErrorMessage =
    formErrorCode === 'empty_offer'
      ? copy.emptyOfferError
      : formErrorCode === 'missing_photos'
        ? copy.missingPhotosError
        : formErrorCode === 'invalid_photo'
          ? copy.invalidPhotoError
          : null;

  const updateSlotPhoto = (slotIndex: 0 | 1, asset: PhotoAsset) => {
    setInput((prev) => {
      const nextPhotos: [PhotoAsset, PhotoAsset] =
        slotIndex === 0 ? [asset, prev.photos[1]] : [prev.photos[0], asset];
      return { ...prev, photos: nextPhotos };
    });
  };

  const handlePhotoUpload = async (slotIndex: 0 | 1, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }

    const seq = ++uploadSeqRef.current[slotIndex];
    setUploadingSlots((prev) =>
      slotIndex === 0 ? [true, prev[1]] : [prev[0], true]
    );
    setFormErrorCode(null);

    try {
      const normalized = await normalizePhotoFile(file);
      if (uploadSeqRef.current[slotIndex] !== seq) {
        return;
      }
      updateSlotPhoto(slotIndex, {
        id: `upload-${slotIndex}-${Date.now()}`,
        label: file.name || `Foto ${slotIndex + 1}`,
        src: normalized.dataUrl,
        isSample: false,
      });
      setFormErrorCode(null);
      setOpenGallerySlot(null);
    } catch {
      if (uploadSeqRef.current[slotIndex] !== seq) {
        return;
      }
      setFormErrorCode('invalid_photo');
    } finally {
      if (uploadSeqRef.current[slotIndex] === seq) {
        setUploadingSlots((prev) =>
          slotIndex === 0 ? [false, prev[1]] : [prev[0], false]
        );
      }
    }
  };

  const handleSamplePickerClick = (slotIndex: 0 | 1) => {
    if (uploadingSlots[slotIndex]) {
      return;
    }
    const current = input.photos[slotIndex];
    if (!current?.src?.trim()) {
      updateSlotPhoto(slotIndex, SAMPLE_BUSINESS_PHOTOS[slotIndex === 0 ? 0 : 1]);
      setFormErrorCode(null);
    }
    setOpenGallerySlot((prev) => (prev === slotIndex ? null : slotIndex));
  };

  const handleSelectSamplePhoto = (slotIndex: 0 | 1, sample: PhotoAsset) => {
    if (uploadingSlots[slotIndex]) {
      return;
    }
    updateSlotPhoto(slotIndex, sample);
    setFormErrorCode(null);
    setOpenGallerySlot(null);
  };

  const handleClearPhoto = (slotIndex: 0 | 1) => {
    if (uploadingSlots[slotIndex]) {
      return;
    }
    updateSlotPhoto(slotIndex, { ...EMPTY_PHOTO_ASSET });
    setOpenGallerySlot(null);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (isUploadingAnyPhoto) {
      return;
    }
    const hasPhoto1 = Boolean(input.photos[0]?.src?.trim());
    const hasPhoto2 = Boolean(input.photos[1]?.src?.trim());
    const hasOffer = input.offerSentence.trim().length > 0;

    if (!hasPhoto1 || !hasPhoto2) {
      setFormErrorCode('missing_photos');
      return;
    }

    if (!hasOffer) {
      setFormErrorCode('empty_offer');
      return;
    }

    setFormErrorCode(null);
    launchCampaign();
  };

  const renderPhotoSlot = (slotIndex: 0 | 1) => {
    const photo = input.photos[slotIndex];
    const hasPhoto = Boolean(photo?.src?.trim());
    const isSlotUploading = uploadingSlots[slotIndex];
    const slotNum = slotIndex + 1;
    const uploadInputId = `campaign-photo-${slotNum}-input`;

    return (
      <div
        key={slotIndex}
        data-testid={`photo-slot-${slotIndex}`}
        data-photo-slot={String(slotNum)}
        className="flex flex-col gap-2.5 rounded-xl border border-slate-800 bg-[#0B0F19] p-3 min-w-0"
      >
        <div className="flex items-center gap-3 min-w-0">
          {hasPhoto ? (
            <img
              src={photo.src}
              alt={photo.label || (slotIndex === 0 ? t('form.photo1Label') : t('form.photo2Label'))}
              className="h-14 w-11 rounded object-cover border border-slate-700 shrink-0"
            />
          ) : (
            <div className="flex h-14 w-11 items-center justify-center rounded border border-dashed border-slate-700 bg-slate-900/70 text-[10px] text-slate-500 shrink-0">
              —
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 min-w-0">
              <span className="text-xs font-medium text-slate-200 break-words leading-tight">
                {slotIndex === 0 ? t('form.photo1Label') : t('form.photo2Label')}
              </span>
              {hasPhoto ? (
                <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300 shrink-0">
                  {photo.isSample ? copy.sampleBadge : copy.uploadedBadge}
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 text-[11px] text-slate-400 break-words [overflow-wrap:anywhere] leading-tight">
              {isSlotUploading
                ? locale === 'ms'
                  ? 'Memproses foto...'
                  : 'Processing photo...'
                : hasPhoto
                  ? photo.label
                  : copy.noPhotoAttached}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          <input
            id={uploadInputId}
            data-testid={`campaign-photo-${slotNum}-input`}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={isSlotUploading}
            aria-label={t('form.uploadPhotoBtn')}
            className="peer sr-only"
            onChange={(e) => {
              void handlePhotoUpload(slotIndex, e);
            }}
          />
          <label
            htmlFor={uploadInputId}
            className={`inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] font-medium text-slate-200 hover:bg-slate-700 peer-focus-visible:ring-2 peer-focus-visible:ring-sky-400 transition cursor-pointer ${
              isSlotUploading ? 'opacity-60 pointer-events-none' : ''
            }`}
          >
            <ImagePlus className="h-3 w-3 shrink-0" />
            <span>
              {isSlotUploading
                ? locale === 'ms'
                  ? 'Memuat naik...'
                  : 'Uploading...'
                : t('form.uploadPhotoBtn')}
            </span>
          </label>

          <button
            type="button"
            data-testid={`sample-photo-picker-${slotIndex}`}
            aria-expanded={openGallerySlot === slotIndex}
            disabled={isSlotUploading}
            onClick={() => handleSamplePickerClick(slotIndex)}
            className="inline-flex items-center gap-1 rounded-md border border-sky-500/40 bg-sky-500/10 px-2 py-1 text-[11px] font-medium text-sky-300 hover:bg-sky-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer max-w-full text-left"
          >
            <Images className="h-3 w-3 shrink-0" />
            <span className="whitespace-normal break-words leading-tight">{copy.pickSampleBtn}</span>
          </button>

          <button
            type="button"
            data-testid={`campaign-photo-${slotNum}-clear`}
            disabled={!hasPhoto || isSlotUploading}
            onClick={() => handleClearPhoto(slotIndex)}
            className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-[#111827] px-2 py-1 text-[11px] font-medium text-slate-300 hover:border-rose-500/50 hover:text-rose-300 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
          >
            <Trash2 className="h-3 w-3 shrink-0" />
            <span>{copy.clearPhotoBtn}</span>
          </button>
        </div>

        {openGallerySlot === slotIndex ? (
          <div className="space-y-1.5 rounded-lg border border-slate-800 bg-[#111827] p-2 min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              {t('form.sampleGalleryTitle')}
            </div>
            <div className="grid grid-cols-3 gap-2 min-w-0">
              {SAMPLE_BUSINESS_PHOTOS.map((sample) => {
                const isSelected = photo.src === sample.src;
                return (
                  <button
                    key={sample.id}
                    type="button"
                    onClick={() => handleSelectSamplePhoto(slotIndex, sample)}
                    className={`group flex flex-col gap-1 rounded-md border p-1 text-left transition cursor-pointer min-w-0 ${
                      isSelected
                        ? 'border-sky-500 bg-sky-500/15'
                        : 'border-slate-700 bg-[#0B0F19] hover:border-slate-500'
                    }`}
                  >
                    <img
                      src={sample.src}
                      alt={sample.label}
                      className="w-full aspect-[4/5] rounded object-cover"
                    />
                    <span className="text-[10px] text-slate-300 break-words leading-tight w-full">
                      {sample.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <section
      data-testid="quick-campaign-form"
      className="rounded-2xl border border-slate-800 bg-[#111827] p-4 sm:p-5 min-w-0"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3 min-w-0">
        <div className="min-w-0">
          <h2 className="text-base sm:text-lg font-semibold text-slate-100 break-words">
            {t('form.title')}
          </h2>
          <p className="text-xs text-slate-400 break-words">{t('form.subtitle')}</p>
        </div>
        {isLaunched ? (
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 shrink-0">
            {t('form.launchedBadge')}
          </span>
        ) : null}
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-4 min-w-0">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 min-w-0">
          <div className="min-w-0 md:col-span-2 lg:col-span-1">
            <label
              htmlFor="campaign-brand-select"
              className="block text-xs font-medium text-slate-400 mb-1"
            >
              {t('form.brandSelectLabel')}
            </label>
            <select
              id="campaign-brand-select"
              data-testid="campaign-brand-select"
              value={input.brandId}
              onChange={(e) => {
                const nextBrandId = e.target.value;
                selectBrand(nextBrandId);
                setInput((prev) => ({ ...prev, brandId: nextBrandId }));
              }}
              className="w-full min-w-0 rounded-lg border border-slate-700 bg-[#0B0F19] px-3 py-2 text-xs text-slate-100 focus:border-sky-500 focus:outline-none"
            >
              {brands.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </select>
          </div>

          {renderPhotoSlot(0)}
          {renderPhotoSlot(1)}
        </div>

        <div className="min-w-0">
          <label
            htmlFor="offer-input"
            className="block text-xs font-medium text-slate-400 mb-1"
          >
            {t('form.offerLabel')}
          </label>
          <textarea
            id="offer-input"
            data-testid="offer-input"
            rows={2}
            value={input.offerSentence}
            onChange={(e) => {
              const value = e.target.value;
              setInput((prev) => ({ ...prev, offerSentence: value }));
              if (formErrorCode && value.trim().length > 0) {
                setFormErrorCode(null);
              }
            }}
            placeholder={t('form.offerPlaceholder')}
            className="w-full min-w-0 max-w-full rounded-lg border border-slate-700 bg-[#0B0F19] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
          />

          {formErrorMessage ? (
            <p
              role="alert"
              data-testid="campaign-form-error"
              className="mt-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-300 break-words"
            >
              {formErrorMessage}
            </p>
          ) : null}

          <div className="mt-2.5 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 min-w-0">
            <div className="flex flex-col gap-2 min-w-0 flex-1">
              <button
                type="button"
                data-testid="offer-sample-chip"
                onClick={() => {
                  setInput((prev) => ({ ...prev, offerSentence: SAMPLE_OFFER_CHIP }));
                  setFormErrorCode(null);
                }}
                className="text-left rounded-xl border border-slate-700 bg-[#0B0F19] px-3 py-1.5 text-[11px] text-slate-300 hover:border-sky-500/60 transition cursor-pointer max-w-full whitespace-normal break-words leading-snug"
              >
                {t('form.offerChipPrefix')} {SAMPLE_OFFER_CHIP}
              </button>
              <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                {SME_OFFER_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    data-testid={`offer-preset-${preset.id}`}
                    onClick={() => {
                      setInput((prev) => ({ ...prev, offerSentence: preset.offer }));
                      setFormErrorCode(null);
                    }}
                    className="rounded-lg border border-slate-700/80 bg-[#0B0F19] px-2.5 py-1 text-[11px] font-medium text-sky-300 hover:border-sky-500/60 hover:bg-sky-500/10 transition cursor-pointer max-w-full whitespace-normal break-words text-left leading-tight"
                  >
                    + {locale === 'ms' ? preset.labelMs : preset.labelEn}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              data-testid="launch-campaign-btn"
              disabled={isUploadingAnyPhoto}
              className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-sky-400 disabled:opacity-60 disabled:cursor-not-allowed transition cursor-pointer shrink-0"
            >
              <Rocket className="h-4 w-4 shrink-0" />
              {t('form.launchCta')}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
