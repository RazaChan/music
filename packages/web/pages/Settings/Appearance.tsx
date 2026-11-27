import settings from '@/web/states/settings'
import { useSnapshot } from 'valtio'
import { cx, css } from '@emotion/css'
import { Option, OptionText, Select, Switch } from './Controls'
import { useTranslation } from 'react-i18next'
import AccentColor from '@/web/components/Appearence/AccentColor'
import persistedUiStates from '@/web/states/persistedUiStates'
import { changeTheme, resolveTheme } from '@/web/utils/theme'
import { syncTheme } from '@/web/utils/ipcRender'

type ThemeSetting = 'dark' | 'light' | 'system'

const Theme = () => {
  const { t } = useTranslation()
  const { theme } = useSnapshot(settings)

  const options: { name: string; value: ThemeSetting }[] = [
    { name: t`settings.theme-dark`, value: 'dark' },
    { name: t`settings.theme-light`, value: 'light' },
    { name: t`settings.theme-system`, value: 'system' },
  ]

  return (
    <>
      <div className='text-xl font-medium text-gray-800 dark:text-white'>{t`settings.theme`}</div>
      {/* 深浅色/跟随系统 —— 移动端唯一的主题切换入口（顶栏切换按钮是桌面专属） */}
      <Option>
        <OptionText>{t`settings.theme-mode`}</OptionText>
        <div data-testid='settings-theme-mode'>
          <Select
            options={options}
            value={(['dark', 'light', 'system'].includes(theme) ? theme : 'dark') as ThemeSetting}
            onChange={value => {
              settings.theme = value
              changeTheme(resolveTheme(value))
              syncTheme(value)
            }}
          />
        </div>
      </Option>
      <AccentColor />
    </>
  )
}

const ChangeLyricBackground = () => {
  const { showBackgroundImage } = useSnapshot(settings)
  const { t, i18n } = useTranslation()
  return (
    <>
      <div>
        <Option>
          <OptionText>{t`settings.show-lyric-background-img`}</OptionText>
          <Switch
            enabled={showBackgroundImage}
            onChange={value => (settings.showBackgroundImage = value)}
          />
        </Option>
      </div>
    </>
  )
}

const LayoutBackground = () => {
  const { t, i18n } = useTranslation()
  return (
    <>
      <div className='mb-2 dark:text-white'>
        <ChangeLyricBackground />
      </div>
    </>
  )
}

const ShowDesktopLyrics = () => {
  const { t, i18n } = useTranslation()
  const { showDeskttopLyrics } = useSnapshot(persistedUiStates)
  return (
    <>
      <Option>
        <div className='flex flex-col'>
          <OptionText>{t`common.showDeskttopLyrics`}</OptionText>
        </div>
        <Switch
          enabled={showDeskttopLyrics}
          onChange={value => (persistedUiStates.showDeskttopLyrics = value)}
        ></Switch>
      </Option>
    </>
  )
}

const ShowDevices = () => {
  const { t, i18n } = useTranslation()
  const { showDevices } = useSnapshot(persistedUiStates)
  return (
    <>
      <Option>
        <div className='flex flex-col'>
          <OptionText>{t`common.showDevices`}</OptionText>
        </div>
        <Switch
          enabled={showDevices}
          onChange={value => (persistedUiStates.showDevices = value)}
        ></Switch>
      </Option>
    </>
  )
}
const LyricsBlur = () => {
  const { t, i18n } = useTranslation()
  const { lyricsBlur } = useSnapshot(persistedUiStates)
  return (
    <>
      <Option>
        <div className='flex flex-col'>
          <OptionText>{t`common.lyricsBlur`}</OptionText>
        </div>
        <Switch
          enabled={lyricsBlur}
          onChange={value => (persistedUiStates.lyricsBlur = value)}
        ></Switch>
      </Option>
    </>
  )
}

const BreathingEffect = () => {
  const { t } = useTranslation()
  const { enableBreathingEffect } = useSnapshot(settings)
  return (
    <>
      <Option>
        <div className='flex flex-col'>
          <OptionText>{t`settings.breathing-effect`}</OptionText>
        </div>
        <Switch
          enabled={enableBreathingEffect}
          onChange={value => (settings.enableBreathingEffect = value)}
        ></Switch>
      </Option>
    </>
  )
}

const AutoLowPowerMode = () => {
  const { t } = useTranslation()
  const { autoLowPowerMode } = useSnapshot(settings)
  return (
    <>
      <Option>
        <div className='flex flex-col'>
          <OptionText>{t`settings.auto-low-power-mode`}</OptionText>
        </div>
        <Switch
          enabled={autoLowPowerMode}
          onChange={value => (settings.autoLowPowerMode = value)}
        ></Switch>
      </Option>
    </>
  )
}

const Browse = () => {
  const { showTrackListName } = useSnapshot(settings)
  const { t } = useTranslation()
  return (
    <>
      <div>
        <Option>
          <OptionText>{t`settings.show-track-list-name`}</OptionText>
          <Switch
            enabled={showTrackListName}
            onChange={value => (settings.showTrackListName = value)}
          />
        </Option>
      </div>
    </>
  )
}

const Appearance = () => {
  return (
    <div
      className={cx(css`
        display: flex;
        flex-direction: column;
      `)}
    >
      <Theme />
      <LayoutBackground />
      <ShowDesktopLyrics />
      <ShowDevices />
      <LyricsBlur />
      <BreathingEffect />
      <AutoLowPowerMode />
      <Browse />
    </div>
  )
}

export default Appearance
