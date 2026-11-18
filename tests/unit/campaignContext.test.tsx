import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrandVaultScreen } from '../../src/components/BrandVaultScreen';
import { QuickCampaignForm } from '../../src/components/QuickCampaignForm';
import { StrategyTab } from '../../src/components/tabs/StrategyTab';
import { I18nProvider, useI18n } from '../../src/i18n/I18nContext';
import { CampaignProvider, useCampaign } from '../../src/state/CampaignContext';
import { WorkbenchProvider, useWorkbench } from '../../src/state/WorkbenchContext';

function CampaignProbe() {
  const { locale, setLocale, t } = useI18n();
  const { createBrand, activeBrandId } = useWorkbench();
  const {
    input,
    setInput,
    isLaunched,
    launchCampaign,
    editedCopyByAngle,
    updateChannelCopy,
    slides,
    updateSlide,
    jingle,
    setJingle,
    video,
    setVideo,
  } = useCampaign();

  return (
    <div>
      <span data-testid="locale">{locale}</span>
      <span data-testid="cta-label">{t('form.launchCta')}</span>
      <span data-testid="launched">{String(isLaunched)}</span>
      <span data-testid="active-brand-id">{activeBrandId}</span>
      <span data-testid="input-brand-id">{input.brandId}</span>
      <span data-testid="offer-val">{input.offerSentence}</span>
      <span data-testid="fb-headline">{editedCopyByAngle.urgency?.facebook.headline ?? ''}</span>
      <span data-testid="fb-wa">{editedCopyByAngle.urgency?.facebook.whatsappUrl ?? ''}</span>
      <span data-testid="value-wa">{editedCopyByAngle.value?.facebook.whatsappUrl ?? ''}</span>
      <span data-testid="social-wa">{editedCopyByAngle.social_proof?.facebook.whatsappUrl ?? ''}</span>
      <span data-testid="fb-primary">{editedCopyByAngle.urgency?.facebook.primaryText ?? ''}</span>
      <span data-testid="slide-0-headline">{slides[0]?.headline ?? ''}</span>
      <span data-testid="jingle-lyrics">{jingle.lyrics}</span>
      <span data-testid="video-confirmed">{String(video.isStoryboardConfirmed)}</span>

      <button
        type="button"
        data-testid="edit-offer"
        onClick={() =>
          setInput((prev) => ({
            ...prev,
            offerSentence: 'Diskaun Kombo RM29 Khas Minggu Gaji',
          }))
        }
      >
        editOffer
      </button>
      <button
        type="button"
        data-testid="launch"
        onClick={() => launchCampaign()}
      >
        launch
      </button>
      <button
        type="button"
        data-testid="same-tick-functional"
        onClick={() => {
          const folderB = createBrand({
            name: 'Kafe Kopi Damai',
            whatsappNumber: '60191112222',
            tone: 'professional',
          });
          setInput((prev) => ({
            ...prev,
            brandId: folderB.id,
            offerSentence: 'Same Tick Offer Functional',
          }));
          launchCampaign();
        }}
      >
        sameTickFunctional
      </button>
      <button
        type="button"
        data-testid="same-tick-direct"
        onClick={() => {
          const folderD = createBrand({
            name: 'Butik Anggun Sejahtera',
            whatsappNumber: '60183334444',
          });
          setInput({
            ...input,
            brandId: folderD.id,
            offerSentence: 'Same Tick Offer Direct',
          });
          launchCampaign();
        }}
      >
        sameTickDirect
      </button>
      <button
        type="button"
        data-testid="same-tick-create-launch"
        onClick={() => {
          const created = createBrand({
            name: 'Brand C Immediate',
            whatsappNumber: '60117778888',
            themeColor: '#10B981',
            tone: 'professional',
          });
          launchCampaign({
            brandId: created.id,
            offerSentence: 'Immediate Brand C Offer',
          });
        }}
      >
        sameTickCreateLaunch
      </button>
      <button
        type="button"
        data-testid="edit-copy"
        onClick={() =>
          updateChannelCopy('urgency', 'facebook', {
            headline: 'Headline Suntingan Khas',
          })
        }
      >
        editCopy
      </button>
      <button
        type="button"
        data-testid="edit-slide"
        onClick={() =>
          updateSlide('slide-1', {
            headline: 'Slaid Pertama Disunting',
            editedByUser: true,
          })
        }
      >
        editSlide
      </button>
      <button
        type="button"
        data-testid="edit-lyrics"
        onClick={() =>
          setJingle((prev) => ({
            ...prev,
            lyrics: 'Lirik Tersuai Sendiri',
            lyricsEditedByUser: true,
          }))
        }
      >
        editLyrics
      </button>
      <button
        type="button"
        data-testid="confirm-video"
        onClick={() =>
          setVideo((prev) => ({
            ...prev,
            isStoryboardConfirmed: true,
          }))
        }
      >
        confirmVideo
      </button>
      <button type="button" data-testid="toggle-en" onClick={() => setLocale('en')}>
        EN
      </button>
      <button type="button" data-testid="toggle-ms" onClick={() => setLocale('ms')}>
        BM
      </button>
    </div>
  );
}

describe('CampaignContext isolation and hydration', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('hydrates all 4 tabs on launchCampaign and preserves user edits across BM/EN toggles', () => {
    render(
      <I18nProvider>
        <WorkbenchProvider>
          <CampaignProvider>
            <CampaignProbe />
          </CampaignProvider>
        </WorkbenchProvider>
      </I18nProvider>
    );

    expect(screen.getByTestId('launched')).toHaveTextContent('false');
    expect(screen.getByTestId('cta-label')).toHaveTextContent('Bina Kempen');

    fireEvent.click(screen.getByTestId('edit-offer'));
    fireEvent.click(screen.getByTestId('launch'));

    expect(screen.getByTestId('launched')).toHaveTextContent('true');
    expect(screen.getByTestId('offer-val')).toHaveTextContent(
      'Diskaun Kombo RM29 Khas Minggu Gaji'
    );
    expect(screen.getByTestId('fb-wa').textContent).toContain('https://wa.me/60123456789');
    expect(screen.getByTestId('jingle-lyrics').textContent).toContain('Demo Bisnes Saya');
    expect(screen.getByTestId('jingle-lyrics').textContent).toContain(
      'Diskaun Kombo RM29 Khas Minggu Gaji'
    );

    fireEvent.click(screen.getByTestId('edit-copy'));
    fireEvent.click(screen.getByTestId('edit-slide'));
    fireEvent.click(screen.getByTestId('edit-lyrics'));
    fireEvent.click(screen.getByTestId('confirm-video'));

    // Toggle BM -> EN -> BM: static UI chrome translates while all campaign edits stay intact
    fireEvent.click(screen.getByTestId('toggle-en'));
    expect(screen.getByTestId('locale')).toHaveTextContent('en');
    expect(screen.getByTestId('cta-label')).toHaveTextContent('Build Campaign');
    expect(screen.getByTestId('offer-val')).toHaveTextContent(
      'Diskaun Kombo RM29 Khas Minggu Gaji'
    );
    expect(screen.getByTestId('fb-headline')).toHaveTextContent('Headline Suntingan Khas');
    expect(screen.getByTestId('slide-0-headline')).toHaveTextContent('Slaid Pertama Disunting');
    expect(screen.getByTestId('jingle-lyrics')).toHaveTextContent('Lirik Tersuai Sendiri');
    expect(screen.getByTestId('video-confirmed')).toHaveTextContent('true');

    fireEvent.click(screen.getByTestId('toggle-ms'));
    expect(screen.getByTestId('cta-label')).toHaveTextContent('Bina Kempen');
    expect(screen.getByTestId('fb-headline')).toHaveTextContent('Headline Suntingan Khas');
    expect(screen.getByTestId('slide-0-headline')).toHaveTextContent('Slaid Pertama Disunting');
    expect(screen.getByTestId('jingle-lyrics')).toHaveTextContent('Lirik Tersuai Sendiri');
    expect(screen.getByTestId('video-confirmed')).toHaveTextContent('true');
  });

  it('handles same-tick setInput (functional & direct) followed by launchCampaign under React 19 batching', () => {
    render(
      <I18nProvider>
        <WorkbenchProvider>
          <CampaignProvider>
            <CampaignProbe />
          </CampaignProvider>
        </WorkbenchProvider>
      </I18nProvider>
    );

    fireEvent.click(screen.getByTestId('same-tick-functional'));
    expect(screen.getByTestId('input-brand-id')).toHaveTextContent('kafe-kopi-damai');
    expect(screen.getByTestId('active-brand-id')).toHaveTextContent('kafe-kopi-damai');
    expect(screen.getByTestId('offer-val')).toHaveTextContent('Same Tick Offer Functional');
    expect(screen.getByTestId('fb-wa').textContent).toContain('https://wa.me/60191112222');
    expect(screen.getByTestId('fb-headline')).toHaveTextContent('Kafe Kopi Damai');

    fireEvent.click(screen.getByTestId('same-tick-direct'));
    expect(screen.getByTestId('input-brand-id')).toHaveTextContent('butik-anggun-sejahtera');
    expect(screen.getByTestId('active-brand-id')).toHaveTextContent('butik-anggun-sejahtera');
    expect(screen.getByTestId('offer-val')).toHaveTextContent('Same Tick Offer Direct');
    expect(screen.getByTestId('fb-wa').textContent).toContain('https://wa.me/60183334444');
    expect(screen.getByTestId('fb-headline')).toHaveTextContent('Butik Anggun Sejahtera');
  });

  it('resolves newly created brand in the same event tick during createBrand + launchCampaign', () => {
    render(
      <I18nProvider>
        <WorkbenchProvider>
          <CampaignProvider>
            <CampaignProbe />
          </CampaignProvider>
        </WorkbenchProvider>
      </I18nProvider>
    );

    fireEvent.click(screen.getByTestId('same-tick-create-launch'));
    expect(screen.getByTestId('input-brand-id')).toHaveTextContent('brand-c-immediate');
    expect(screen.getByTestId('active-brand-id')).toHaveTextContent('brand-c-immediate');
    expect(screen.getByTestId('offer-val')).toHaveTextContent('Immediate Brand C Offer');
    expect(screen.getByTestId('fb-wa').textContent).toContain('https://wa.me/60117778888');
    expect(screen.getByTestId('fb-headline')).toHaveTextContent('Brand C Immediate');
    expect(screen.getByTestId('jingle-lyrics').textContent).toContain('Brand C Immediate');
  });

  it('keeps BrandVaultScreen, QuickCampaignForm, and StrategyTab synchronized without split-brain', () => {
    render(
      <I18nProvider>
        <WorkbenchProvider>
          <CampaignProvider>
            <BrandVaultScreen />
            <QuickCampaignForm />
            <StrategyTab />
          </CampaignProvider>
        </WorkbenchProvider>
      </I18nProvider>
    );

    fireEvent.change(screen.getByTestId('new-brand-name-input'), {
      target: { value: 'Kopi & Kek Baru' },
    });
    fireEvent.click(screen.getByTestId('create-brand-btn'));
    fireEvent.change(screen.getByTestId('brand-whatsapp-input'), {
      target: { value: '60198887777' },
    });

    const brandSelect = screen.getByTestId('campaign-brand-select') as HTMLSelectElement;
    expect(brandSelect.value).toBe('kopi-kek-baru');

    fireEvent.change(screen.getByTestId('offer-input'), {
      target: { value: 'Tawaran Folder B Test' },
    });
    fireEvent.click(screen.getByTestId('launch-campaign-btn'));

    const strategyTab = screen.getByTestId('strategy-tab');
    expect(strategyTab.textContent).toContain('Kopi & Kek Baru');
    expect(strategyTab.textContent).toContain('https://wa.me/60198887777');
    expect(strategyTab.textContent).not.toContain('https://wa.me/60123456789');

    // Switching back to seeded folder updates QuickCampaignForm select automatically
    fireEvent.click(screen.getByTestId('brand-folder-demo-bisnes-saya'));
    expect(brandSelect.value).toBe('demo-bisnes-saya');
  });

  it('populates SUDUT- angle-tagged wa.me links and compliant tone-aware copy immediately on mount and launch without StrategyTab', () => {
    render(
      <I18nProvider>
        <WorkbenchProvider>
          <CampaignProvider>
            <CampaignProbe />
          </CampaignProvider>
        </WorkbenchProvider>
      </I18nProvider>
    );

    // Immediately on mount (pre-launch), baseline copy already uses canonical SUDUT- tags
    expect(decodeURIComponent(screen.getByTestId('fb-wa').textContent ?? '')).toContain(
      'SUDUT-1-SEGERA'
    );
    expect(decodeURIComponent(screen.getByTestId('value-wa').textContent ?? '')).toContain(
      'SUDUT-2-NILAI'
    );
    expect(decodeURIComponent(screen.getByTestId('social-wa').textContent ?? '')).toContain(
      'SUDUT-3-BUKTISOSIAL'
    );

    // Launching with a professional brand immediately applies SUDUT- tags and professional tone without StrategyTab
    fireEvent.click(screen.getByTestId('same-tick-create-launch'));
    expect(decodeURIComponent(screen.getByTestId('fb-wa').textContent ?? '')).toContain(
      'SUDUT-1-SEGERA'
    );
    expect(decodeURIComponent(screen.getByTestId('value-wa').textContent ?? '')).toContain(
      'SUDUT-2-NILAI'
    );
    expect(decodeURIComponent(screen.getByTestId('social-wa').textContent ?? '')).toContain(
      'SUDUT-3-BUKTISOSIAL'
    );
    expect(screen.getByTestId('fb-headline')).toHaveTextContent('Promosi Masa Terhad');
    expect(screen.getByTestId('fb-primary').textContent).toContain('WhatsApp rasmi');
  });

  it('reactively updates unedited Tabs 1-4 state on mid-campaign Brand Vault edits while preserving user-edited slides and lyrics', () => {
    function MidCampaignProbe() {
      const { activeBrandId, updateBrand } = useWorkbench();
      const {
        launchCampaign,
        editedCopyByAngle,
        slides,
        updateSlide,
        jingle,
        setJingle,
        video,
        setVideo,
      } = useCampaign();

      return (
        <div>
          <span data-testid="mc-fb-headline">
            {editedCopyByAngle.urgency?.facebook.headline ?? ''}
          </span>
          <span data-testid="mc-fb-primary">
            {editedCopyByAngle.urgency?.facebook.primaryText ?? ''}
          </span>
          <span data-testid="mc-slide-0-headline">{slides[0]?.headline ?? ''}</span>
          <span data-testid="mc-slide-3-headline">{slides[3]?.headline ?? ''}</span>
          <span data-testid="mc-slide-3-sub">{slides[3]?.subheadline ?? ''}</span>
          <span data-testid="mc-lyrics">{jingle.lyrics}</span>
          <span data-testid="mc-frame-0">{video.storyboardFrames[0]?.overlayHeadline ?? ''}</span>
          <span data-testid="mc-frame-3">{video.storyboardFrames[3]?.overlayHeadline ?? ''}</span>

          <button type="button" data-testid="mc-launch" onClick={() => launchCampaign()}>
            launch
          </button>
          <button
            type="button"
            data-testid="mc-edit-slide-0"
            onClick={() =>
              updateSlide('slide-1', { headline: 'Slaid 1 Suntingan Kekal', editedByUser: true })
            }
          >
            editSlide0
          </button>
          <button
            type="button"
            data-testid="mc-edit-lyrics"
            onClick={() =>
              setJingle((prev) => ({
                ...prev,
                lyrics: 'Lirik Kekal Disunting',
                lyricsEditedByUser: true,
              }))
            }
          >
            editLyrics
          </button>
          <button
            type="button"
            data-testid="mc-edit-brand"
            onClick={() =>
              updateBrand(activeBrandId, {
                name: 'Bisnes Baharu Pro',
                whatsappNumber: '019-999 8888',
                tone: 'professional',
              })
            }
          >
            editBrand
          </button>
          <button
            type="button"
            data-testid="mc-reset-lyrics-flag"
            onClick={() =>
              setJingle((prev) => ({
                ...prev,
                lyricsEditedByUser: false,
              }))
            }
          >
            resetLyricsFlag
          </button>
          <button
            type="button"
            data-testid="mc-edit-brand-2"
            onClick={() =>
              updateBrand(activeBrandId, {
                name: 'Bisnes Pro Dua',
              })
            }
          >
            editBrand2
          </button>
          <button
            type="button"
            data-testid="mc-ready-video"
            onClick={() =>
              setVideo((prev) => ({
                ...prev,
                isStoryboardConfirmed: true,
                status: 'ready',
              }))
            }
          >
            readyVideo
          </button>
          <span data-testid="mc-video-status">{video.status}</span>
          <span data-testid="mc-video-confirmed">{String(video.isStoryboardConfirmed)}</span>
        </div>
      );
    }

    render(
      <I18nProvider>
        <WorkbenchProvider>
          <CampaignProvider>
            <MidCampaignProbe />
          </CampaignProvider>
        </WorkbenchProvider>
      </I18nProvider>
    );

    fireEvent.click(screen.getByTestId('mc-launch'));
    fireEvent.click(screen.getByTestId('mc-edit-slide-0'));
    fireEvent.click(screen.getByTestId('mc-edit-lyrics'));
    fireEvent.click(screen.getByTestId('mc-ready-video'));
    expect(screen.getByTestId('mc-video-status')).toHaveTextContent('ready');

    fireEvent.click(screen.getByTestId('mc-edit-brand'));

    expect(screen.getByTestId('mc-fb-headline')).toHaveTextContent('Bisnes Baharu Pro');
    expect(screen.getByTestId('mc-fb-headline')).toHaveTextContent('Promosi Masa Terhad');
    expect(screen.getByTestId('mc-fb-primary')).toHaveTextContent('https://wa.me/60199998888');
    expect(screen.getByTestId('mc-slide-0-headline')).toHaveTextContent('Slaid 1 Suntingan Kekal');
    expect(screen.getByTestId('mc-slide-3-headline')).toHaveTextContent('Bisnes Baharu Pro');
    expect(screen.getByTestId('mc-slide-3-sub')).toHaveTextContent('+60199998888');
    expect(screen.getByTestId('mc-lyrics')).toHaveTextContent('Lirik Kekal Disunting');
    expect(screen.getByTestId('mc-frame-0')).toHaveTextContent('Bisnes Baharu Pro');
    expect(screen.getByTestId('mc-frame-3')).toHaveTextContent('+60199998888');
    expect(screen.getByTestId('mc-video-status')).toHaveTextContent('awaiting-confirmation');
    expect(screen.getByTestId('mc-video-confirmed')).toHaveTextContent('false');

    // Unedited lyrics update reactively when brand name changes
    fireEvent.click(screen.getByTestId('mc-reset-lyrics-flag'));
    fireEvent.click(screen.getByTestId('mc-edit-brand-2'));
    expect(screen.getByTestId('mc-lyrics')).toHaveTextContent('Bisnes Pro Dua');
  });

  it('preserves launched offer across unlaunched draft edits, isolates Brand B creation/edits, syncs Brand A on return, and invalidates ready video on themeColor/logoDataUrl change', () => {
    const origRevoke = URL.revokeObjectURL;
    const revokeSpy = vi.fn();
    URL.revokeObjectURL = revokeSpy;

    try {
      function AdversarialContextProbe() {
        const { activeBrandId, createBrand, selectBrand, updateBrand } = useWorkbench();
        const { setInput, launchCampaign, editedCopyByAngle, slides, jingle, video, setVideo } =
          useCampaign();

        return (
          <div>
            <span data-testid="adv-active-brand">{activeBrandId}</span>
            <span data-testid="adv-slide-0-badge">{slides[0]?.badgeText ?? ''}</span>
            <span data-testid="adv-slide-1-head">{slides[1]?.headline ?? ''}</span>
            <span data-testid="adv-fb-primary">
              {editedCopyByAngle.urgency?.facebook.primaryText ?? ''}
            </span>
            <span data-testid="adv-lyrics">{jingle.lyrics}</span>
            <span data-testid="adv-video-status">{video.status}</span>
            <span data-testid="adv-video-url">{video.videoUrl ?? 'none'}</span>
            <span data-testid="adv-video-confirmed">{String(video.isStoryboardConfirmed)}</span>

            <button
              type="button"
              data-testid="adv-launch-a"
              onClick={() => launchCampaign({ offerSentence: 'Tawaran Rasmi A' })}
            >
              launchA
            </button>
            <button
              type="button"
              data-testid="adv-draft-offer"
              onClick={() =>
                setInput((prev) => ({ ...prev, offerSentence: 'Draf Belum Lancar' }))
              }
            >
              draftOffer
            </button>
            <button
              type="button"
              data-testid="adv-edit-a-name"
              onClick={() =>
                updateBrand('demo-bisnes-saya', { name: 'Demo Bisnes Saya V2' })
              }
            >
              editAName
            </button>
            <button
              type="button"
              data-testid="adv-create-edit-b"
              onClick={() => {
                const b = createBrand({ name: 'Brand B', whatsappNumber: '60191112222' });
                updateBrand(b.id, { name: 'Brand B Edited', whatsappNumber: '60193334444' });
              }}
            >
              createEditB
            </button>
            <button
              type="button"
              data-testid="adv-edit-a-while-b"
              onClick={() =>
                updateBrand('demo-bisnes-saya', { name: 'Demo Bisnes Saya V3' })
              }
            >
              editAWhileB
            </button>
            <button
              type="button"
              data-testid="adv-return-a"
              onClick={() => selectBrand('demo-bisnes-saya')}
            >
              returnA
            </button>
            <button
              type="button"
              data-testid="adv-set-video-ready"
              onClick={() =>
                setVideo((prev) => ({
                  ...prev,
                  isStoryboardConfirmed: true,
                  status: 'ready',
                  videoBlob: new Blob(['vid'], { type: 'video/webm' }),
                  videoUrl: 'blob:stale-theme-logo',
                }))
              }
            >
              setVideoReady
            </button>
            <button
              type="button"
              data-testid="adv-change-theme"
              onClick={() => updateBrand('demo-bisnes-saya', { themeColor: '#EF4444' })}
            >
              changeTheme
            </button>
            <button
              type="button"
              data-testid="adv-change-logo"
              onClick={() =>
                updateBrand('demo-bisnes-saya', {
                  logoDataUrl: 'data:image/png;base64,AAAA',
                })
              }
            >
              changeLogo
            </button>
          </div>
        );
      }

      render(
        <I18nProvider>
          <WorkbenchProvider>
            <CampaignProvider>
              <AdversarialContextProbe />
            </CampaignProvider>
          </WorkbenchProvider>
        </I18nProvider>
      );

      // 1. Launch Campaign A, edit draft offer without launching, update Brand A -> launched offer preserved
      fireEvent.click(screen.getByTestId('adv-launch-a'));
      expect(screen.getByTestId('adv-slide-1-head')).toHaveTextContent('Tawaran Rasmi A');

      fireEvent.click(screen.getByTestId('adv-draft-offer'));
      fireEvent.click(screen.getByTestId('adv-edit-a-name'));

      expect(screen.getByTestId('adv-slide-0-badge')).toHaveTextContent('Demo Bisnes Saya V2');
      expect(screen.getByTestId('adv-slide-1-head')).toHaveTextContent('Tawaran Rasmi A');
      expect(screen.getByTestId('adv-slide-1-head')).not.toHaveTextContent('Draf Belum Lancar');
      expect(screen.getByTestId('adv-fb-primary')).toHaveTextContent('Tawaran Rasmi A');
      expect(screen.getByTestId('adv-lyrics')).toHaveTextContent('Tawaran Rasmi A');

      // 2. Create & edit Brand B without launching -> Campaign A untouched
      fireEvent.click(screen.getByTestId('adv-create-edit-b'));
      expect(screen.getByTestId('adv-active-brand')).toHaveTextContent('brand-b');
      expect(screen.getByTestId('adv-slide-0-badge')).toHaveTextContent('Demo Bisnes Saya V2');
      expect(screen.getByTestId('adv-fb-primary')).not.toContainHTML('Brand B Edited');

      // 3. Edit Brand A while Brand B is active, then switch back to Brand A -> syncs Brand A V3!
      fireEvent.click(screen.getByTestId('adv-edit-a-while-b'));
      expect(screen.getByTestId('adv-slide-0-badge')).toHaveTextContent('Demo Bisnes Saya V2');

      fireEvent.click(screen.getByTestId('adv-return-a'));
      expect(screen.getByTestId('adv-active-brand')).toHaveTextContent('demo-bisnes-saya');
      expect(screen.getByTestId('adv-slide-0-badge')).toHaveTextContent('Demo Bisnes Saya V3');
      expect(screen.getByTestId('adv-slide-1-head')).toHaveTextContent('Tawaran Rasmi A');

      // 4. themeColor change invalidates ready video & revokes blob URL
      fireEvent.click(screen.getByTestId('adv-set-video-ready'));
      expect(screen.getByTestId('adv-video-status')).toHaveTextContent('ready');
      fireEvent.click(screen.getByTestId('adv-change-theme'));
      expect(revokeSpy).toHaveBeenCalledWith('blob:stale-theme-logo');
      expect(screen.getByTestId('adv-video-status')).toHaveTextContent('awaiting-confirmation');
      expect(screen.getByTestId('adv-video-confirmed')).toHaveTextContent('false');
      expect(screen.getByTestId('adv-video-url')).toHaveTextContent('none');

      // 5. logoDataUrl change also invalidates ready video & revokes blob URL
      fireEvent.click(screen.getByTestId('adv-set-video-ready'));
      expect(screen.getByTestId('adv-video-status')).toHaveTextContent('ready');
      fireEvent.click(screen.getByTestId('adv-change-logo'));
      expect(revokeSpy).toHaveBeenCalledTimes(2);
      expect(screen.getByTestId('adv-video-status')).toHaveTextContent('awaiting-confirmation');
      expect(screen.getByTestId('adv-video-confirmed')).toHaveTextContent('false');
    } finally {
      URL.revokeObjectURL = origRevoke;
    }
  });

  it('keeps launched Campaign A StrategyTab and editedCopyByAngle isolated when creating/selecting Brand B and typing an unlaunched offer draft', () => {
    function CopyMapProbe() {
      const { editedCopyByAngle, launchedBrand, launchedOfferSentence } = useCampaign();
      return (
        <div>
          <span data-testid="probe-launched-brand">{launchedBrand.name}</span>
          <span data-testid="probe-launched-offer">{launchedOfferSentence}</span>
          <span data-testid="probe-urg-wa">
            {editedCopyByAngle.urgency?.facebook.whatsappUrl ?? ''}
          </span>
          <span data-testid="probe-val-wa">
            {editedCopyByAngle.value?.facebook.whatsappUrl ?? ''}
          </span>
          <span data-testid="probe-soc-wa">
            {editedCopyByAngle.social_proof?.facebook.whatsappUrl ?? ''}
          </span>
        </div>
      );
    }

    render(
      <I18nProvider>
        <WorkbenchProvider>
          <CampaignProvider>
            <CopyMapProbe />
            <BrandVaultScreen />
            <QuickCampaignForm />
            <StrategyTab />
          </CampaignProvider>
        </WorkbenchProvider>
      </I18nProvider>
    );

    // 1. Launch Campaign A (Demo Bisnes Saya)
    fireEvent.change(screen.getByTestId('offer-input'), {
      target: { value: 'Tawaran Rasmi Kempen A' },
    });
    fireEvent.click(screen.getByTestId('launch-campaign-btn'));

    expect(screen.getByTestId('probe-launched-brand')).toHaveTextContent('Demo Bisnes Saya');
    expect(screen.getByTestId('probe-launched-offer')).toHaveTextContent('Tawaran Rasmi Kempen A');
    expect(screen.getByTestId('probe-urg-wa').textContent).toContain('https://wa.me/60123456789?text=');
    expect(screen.getByTestId('probe-val-wa').textContent).toContain('https://wa.me/60123456789?text=');
    expect(screen.getByTestId('probe-soc-wa').textContent).toContain('https://wa.me/60123456789?text=');
    expect(screen.getByTestId('strategy-psychology-panel').textContent).toContain('Demo Bisnes Saya');
    expect(screen.getByTestId('strategy-psychology-panel').textContent).toContain('Tawaran Rasmi Kempen A');
    expect(screen.getByTestId('whatsapp-cta-facebook').getAttribute('href')).toContain(
      'https://wa.me/60123456789?text='
    );

    // 2. Create & select Brand B + type unlaunched offer draft WITHOUT clicking launch-campaign-btn
    fireEvent.change(screen.getByTestId('new-brand-name-input'), {
      target: { value: 'Servis Pantas Beta' },
    });
    fireEvent.click(screen.getByTestId('create-brand-btn'));
    fireEvent.change(screen.getByTestId('brand-whatsapp-input'), {
      target: { value: '60191112222' },
    });
    fireEvent.change(screen.getByTestId('offer-input'), {
      target: { value: 'Draf Tawaran Brand B Belum Lancar' },
    });

    // Context copy map & Tab 1 UI must stay strictly on Campaign A
    expect(screen.getByTestId('probe-launched-brand')).toHaveTextContent('Demo Bisnes Saya');
    expect(screen.getByTestId('probe-launched-offer')).toHaveTextContent('Tawaran Rasmi Kempen A');
    expect(screen.getByTestId('probe-urg-wa').textContent).toContain('https://wa.me/60123456789?text=');
    expect(screen.getByTestId('probe-val-wa').textContent).toContain('https://wa.me/60123456789?text=');
    expect(screen.getByTestId('probe-soc-wa').textContent).toContain('https://wa.me/60123456789?text=');
    expect(screen.getByTestId('probe-urg-wa').textContent).not.toContain('60191112222');

    const strategyPanel = screen.getByTestId('strategy-psychology-panel');
    expect(strategyPanel.textContent).toContain('Demo Bisnes Saya');
    expect(strategyPanel.textContent).toContain('Tawaran Rasmi Kempen A');
    expect(strategyPanel.textContent).not.toContain('Servis Pantas Beta');
    expect(strategyPanel.textContent).not.toContain('Draf Tawaran Brand B Belum Lancar');
    expect(screen.getByTestId('whatsapp-cta-facebook').getAttribute('href')).toContain(
      'https://wa.me/60123456789?text='
    );

    // 3. Switch back to Demo Bisnes Saya -> confirm zero pollution
    fireEvent.click(screen.getByTestId('brand-folder-demo-bisnes-saya'));
    expect(screen.getByTestId('probe-urg-wa').textContent).toContain('https://wa.me/60123456789?text=');
    expect(screen.getByTestId('probe-val-wa').textContent).toContain('https://wa.me/60123456789?text=');
    expect(screen.getByTestId('probe-soc-wa').textContent).toContain('https://wa.me/60123456789?text=');

    // 4. Now select Brand B and explicitly click Bina Kempen -> Tab 1 transitions to Brand B
    fireEvent.click(screen.getByTestId('brand-folder-servis-pantas-beta'));
    fireEvent.click(screen.getByTestId('launch-campaign-btn'));
    expect(screen.getByTestId('probe-launched-brand')).toHaveTextContent('Servis Pantas Beta');
    expect(screen.getByTestId('probe-launched-offer')).toHaveTextContent(
      'Draf Tawaran Brand B Belum Lancar'
    );
    expect(screen.getByTestId('strategy-psychology-panel').textContent).toContain(
      'Servis Pantas Beta'
    );
    expect(screen.getByTestId('whatsapp-cta-facebook').getAttribute('href')).toContain(
      'https://wa.me/60191112222?text='
    );
  }, 15_000);

  it('resets isStoryboardConfirmed on awaiting-confirmation when active brand name, phone, themeColor, or logoDataUrl mutates storyboard/visuals, while leaving tone-only edits confirmed', () => {
    function AwaitingConfirmProbe() {
      const { activeBrandId, updateBrand } = useWorkbench();
      const { launchCampaign, video, setVideo } = useCampaign();
      return (
        <div>
          <span data-testid="ac-status">{video.status}</span>
          <span data-testid="ac-confirmed">{String(video.isStoryboardConfirmed)}</span>
          <span data-testid="ac-frame-0">{video.storyboardFrames[0]?.overlayHeadline ?? ''}</span>
          <span data-testid="ac-frame-3">{video.storyboardFrames[3]?.overlayHeadline ?? ''}</span>

          <button type="button" data-testid="ac-launch" onClick={() => launchCampaign()}>
            launch
          </button>
          <button
            type="button"
            data-testid="ac-confirm"
            onClick={() => setVideo((prev) => ({ ...prev, isStoryboardConfirmed: true }))}
          >
            confirm
          </button>
          <button
            type="button"
            data-testid="ac-edit-all-frames"
            onClick={() =>
              setVideo((prev) => ({
                ...prev,
                isStoryboardConfirmed: true,
                storyboardFrames: prev.storyboardFrames.map((f, idx) => ({
                  ...f,
                  overlayHeadline: `Custom Frame ${idx + 1}`,
                  lyricLine: `Custom Lyric ${idx + 1}`,
                  editedByUser: true,
                })),
              }))
            }
          >
            editAll
          </button>
          <button
            type="button"
            data-testid="ac-edit-name"
            onClick={() => updateBrand(activeBrandId, { name: 'Bisnes Mutasi Sahkan' })}
          >
            editName
          </button>
          <button
            type="button"
            data-testid="ac-edit-phone"
            onClick={() => updateBrand(activeBrandId, { whatsappNumber: '019-111 2222' })}
          >
            editPhone
          </button>
          <button
            type="button"
            data-testid="ac-edit-phone-2"
            onClick={() => updateBrand(activeBrandId, { whatsappNumber: '018-555 6666' })}
          >
            editPhone2
          </button>
          <button
            type="button"
            data-testid="ac-edit-theme"
            onClick={() => updateBrand(activeBrandId, { themeColor: '#10B981' })}
          >
            editTheme
          </button>
          <button
            type="button"
            data-testid="ac-edit-logo"
            onClick={() =>
              updateBrand(activeBrandId, { logoDataUrl: 'data:image/png;base64,BBBB' })
            }
          >
            editLogo
          </button>
          <button
            type="button"
            data-testid="ac-edit-tone"
            onClick={() => updateBrand(activeBrandId, { tone: 'professional' })}
          >
            editTone
          </button>
        </div>
      );
    }

    render(
      <I18nProvider>
        <WorkbenchProvider>
          <CampaignProvider>
            <AwaitingConfirmProbe />
          </CampaignProvider>
        </WorkbenchProvider>
      </I18nProvider>
    );

    fireEvent.click(screen.getByTestId('ac-launch'));
    expect(screen.getByTestId('ac-status')).toHaveTextContent('awaiting-confirmation');

    // 1. Tone-only change does NOT invalidate confirmation
    fireEvent.click(screen.getByTestId('ac-confirm'));
    expect(screen.getByTestId('ac-confirmed')).toHaveTextContent('true');
    fireEvent.click(screen.getByTestId('ac-edit-tone'));
    expect(screen.getByTestId('ac-confirmed')).toHaveTextContent('true');

    // 2. Brand name change updates Frame 1 & resets confirmation
    fireEvent.click(screen.getByTestId('ac-edit-name'));
    expect(screen.getByTestId('ac-frame-0')).toHaveTextContent('Bisnes Mutasi Sahkan');
    expect(screen.getByTestId('ac-confirmed')).toHaveTextContent('false');

    // 3. Re-confirm -> WhatsApp change updates Frame 4 & resets confirmation
    fireEvent.click(screen.getByTestId('ac-confirm'));
    fireEvent.click(screen.getByTestId('ac-edit-phone'));
    expect(screen.getByTestId('ac-frame-3')).toHaveTextContent('+60191112222');
    expect(screen.getByTestId('ac-confirmed')).toHaveTextContent('false');

    // 4. Re-confirm -> themeColor change resets confirmation
    fireEvent.click(screen.getByTestId('ac-confirm'));
    fireEvent.click(screen.getByTestId('ac-edit-theme'));
    expect(screen.getByTestId('ac-confirmed')).toHaveTextContent('false');

    // 5. Re-confirm -> logoDataUrl change resets confirmation
    fireEvent.click(screen.getByTestId('ac-confirm'));
    fireEvent.click(screen.getByTestId('ac-edit-logo'));
    expect(screen.getByTestId('ac-confirmed')).toHaveTextContent('false');

    // 6. When all frames are user-edited, phone-only change doesn't mutate any frame so confirmation stays
    fireEvent.click(screen.getByTestId('ac-edit-all-frames'));
    expect(screen.getByTestId('ac-confirmed')).toHaveTextContent('true');
    fireEvent.click(screen.getByTestId('ac-edit-phone-2'));
    expect(screen.getByTestId('ac-frame-3')).toHaveTextContent('Custom Frame 4');
    expect(screen.getByTestId('ac-confirmed')).toHaveTextContent('true');
  });
});
