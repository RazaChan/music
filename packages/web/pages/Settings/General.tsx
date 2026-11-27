import { SupportedLanguage } from '@/web/i18n/i18n'
import persistedUiStates from '@/web/states/persistedUiStates'
import settings from '@/web/states/settings'
import { useTranslation } from 'react-i18next'
import { useSnapshot } from 'valtio'
import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { IpcChannels } from '@/shared/IpcChannels'
import { BlockTitle, Button, OptionText, Select, Option, Switch } from './Controls'

function General() {
  return (
    <div>
      <Language />
      <AppleMusic />
      <NeteaseMusic />
      <Download />
      <CloseWindow />
      <Cache />
    </div>
  )
}

function Language() {
  const { t } = useTranslation()
  const supportedLanguages: { name: string; value: SupportedLanguage }[] = [
    { name: 'English', value: 'en-US' },
    { name: '简体中文', value: 'zh-CN' },
  ]
  const { language } = useSnapshot(settings)
  const setLanguage = (language: SupportedLanguage) => {
    settings.language = language
  }

  return (
    <div className='mb-12'>
      <BlockTitle>{t`settings.title-language`}</BlockTitle>
      <Option>
        <OptionText>{t`settings.general-choose-language`}</OptionText>
        <Select options={supportedLanguages} value={language} onChange={setLanguage} />
      </Option>
    </div>
  )
}

function AppleMusic() {
  const { t } = useTranslation()

  const { playAnimatedArtworkFromApple, priorityDisplayOfAlbumArtistDescriptionFromAppleMusic } =
    useSnapshot(settings)

  return (
    <div className='mt-7 mb-12'>
      <BlockTitle>Apple Music</BlockTitle>
      <Option>
        <OptionText>{t`settings.play-animated-artwork-from-apple-music`}</OptionText>
        <Switch
          enabled={playAnimatedArtworkFromApple}
          onChange={v => (settings.playAnimatedArtworkFromApple = v)}
        />
      </Option>
      <Option>
        <OptionText>{t`settings.priority-display-description-from-apple-music`}</OptionText>
        <Switch
          enabled={priorityDisplayOfAlbumArtistDescriptionFromAppleMusic}
          onChange={v => (settings.priorityDisplayOfAlbumArtistDescriptionFromAppleMusic = v)}
        />
      </Option>
    </div>
  )
}

function NeteaseMusic() {
  const { t } = useTranslation()

  const { displayPlaylistsFromNeteaseMusic } = useSnapshot(settings)
  return (
    <div className='mt-7 mb-12'>
      <BlockTitle>{t`settings.title-netease-music`}</BlockTitle>
      <Option>
        <OptionText>{t`settings.display-playlists-from-netease-music`}</OptionText>
        <Switch
          enabled={displayPlaylistsFromNeteaseMusic}
          onChange={v => {
            settings.displayPlaylistsFromNeteaseMusic = v
            if (persistedUiStates.librarySelectedTab === 'playlists') {
              persistedUiStates.librarySelectedTab = 'albums'
            }
          }}
        />
      </Option>
    </div>
  )
}

function Download() {
  const { t } = useTranslation()

  const { showDownloadActions } = useSnapshot(settings)
  return (
    <div className='mt-7 mb-12'>
      <BlockTitle>{t`settings.title-download`}</BlockTitle>
      <Option>
        <OptionText>{t`settings.show-download-actions`}</OptionText>
        <Switch
          enabled={showDownloadActions}
          onChange={v => (settings.showDownloadActions = v)}
        />
      </Option>
    </div>
  )
}

function CloseWindow() {
  const { t } = useTranslation()

  const { closeWindowInMinimize } = useSnapshot(settings)
  return (
    <div className='mt-7 mb-12'>
      <BlockTitle>{t`settings.minimize-window`}</BlockTitle>
      <Option>
        <OptionText>{t`settings.minimize-window-to-tray-when-close`}</OptionText>
        <Switch
          enabled={closeWindowInMinimize}
          onChange={v => (settings.closeWindowInMinimize = v)}
        />
      </Option>
    </div>
  )
}

/**
 * 缓存管理（仅桌面端：音频缓存只存在于 Electron 的本地服务里）。
 */
function Cache() {
  const { t } = useTranslation()
  const isElectron = !!window.ipcRenderer
  const [audioCacheSize, setAudioCacheSize] = useState('')

  const refreshAudioCacheSize = useCallback(async () => {
    const size = await window.ipcRenderer?.invoke(IpcChannels.GetAudioCacheSize)
    if (typeof size === 'string') setAudioCacheSize(size)
  }, [])

  useEffect(() => {
    if (isElectron) refreshAudioCacheSize()
  }, [isElectron, refreshAudioCacheSize])

  if (!isElectron) return null

  return (
    <div className='mt-7 mb-12' data-testid='settings-cache'>
      <BlockTitle>{t`settings.title-cache`}</BlockTitle>
      <Option>
        <OptionText>
          {t`settings.audio-cache`}
          {audioCacheSize ? ` · ${audioCacheSize}` : ''}
        </OptionText>
        <Button
          onClick={async () => {
            await window.ipcRenderer?.invoke(IpcChannels.ClearAudioCache)
            toast.success(t`settings.cache-cleared`)
            refreshAudioCacheSize()
          }}
        >
          {t`settings.clear-cache`}
        </Button>
      </Option>
      <Option>
        <OptionText>{t`settings.api-cache`}</OptionText>
        <Button
          onClick={() => {
            window.ipcRenderer?.send(IpcChannels.ClearAPICache)
            toast.success(t`settings.cache-cleared`)
          }}
        >
          {t`settings.clear-cache`}
        </Button>
      </Option>
    </div>
  )
}

export default General
