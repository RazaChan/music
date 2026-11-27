import settings from '@/web/states/settings'
import player from '@/web/states/player'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { useSnapshot } from 'valtio'
import { BlockDescription, BlockTitle, Button, Option, OptionText, Select, Switch } from './Controls'
import { motion, AnimatePresence } from 'framer-motion'
import { useState } from 'react'

type AudioQualityLevel = 'standard' | 'exhigh' | 'lossless' | 'hires'

function Player() {
  return (
    <div className='iterms-center flex w-full justify-between'>
      <div className='flex w-full flex-col justify-between'>
        <AudioQuality />
        <FindTrackOnYouTube />
      </div>
    </div>
  )
}

/**
 * 音质选择。上游会按账号权益自动降级（要无损但无权益时给实际可用档位），
 * 实际播放档位展示在桌面播放器的曲目信息卡上。
 */
function AudioQuality() {
  const { t } = useTranslation()
  const { audioQuality } = useSnapshot(settings)

  const options: { name: string; value: AudioQualityLevel }[] = [
    { name: t`settings.quality-standard`, value: 'standard' },
    { name: t`settings.quality-exhigh`, value: 'exhigh' },
    { name: t`settings.quality-lossless`, value: 'lossless' },
    { name: t`settings.quality-hires`, value: 'hires' },
  ]

  return (
    <div className='mb-8'>
      <BlockTitle>{t`settings.title-audio-quality`}</BlockTitle>
      <BlockDescription>{t`settings.audio-quality-description`}</BlockDescription>
      <Option>
        <OptionText>{t`settings.audio-quality`}</OptionText>
        <div data-testid='settings-audio-quality'>
          <Select
            options={options}
            value={(audioQuality === 'higher' ? 'exhigh' : audioQuality) as AudioQualityLevel}
            onChange={value => {
              settings.audioQuality = value
              // 正在播放时立即按新档位重载当前曲目（保持进度与播放状态）
              player.reloadAudioSource()
            }}
          />
        </div>
      </Option>
    </div>
  )
}

function FindTrackOnYouTube() {
  const { t, i18n } = useTranslation()

  const { enableFindTrackOnYouTube, qqCookie, miguCookie, jooxCookie, httpProxyForYouTube } =
    useSnapshot(settings)
  const [proxy, setProxy] = useState<string>(httpProxyForYouTube?.proxy as string)
  const [nqqCookie, setQQCookie] = useState<string>(qqCookie)
  const [nmiguCookie, setMIGUCookie] = useState<string>(miguCookie)
  const [njooxCookie, setJOOXCookie] = useState<string>(jooxCookie)

  return (
    <div className='flex w-full flex-col justify-between'>
      <div>
        <BlockTitle>{t`settings.player-youtube-unlock`}</BlockTitle>
        <BlockDescription>{'此功能仅在桌面端支持 | Only support desktop'}</BlockDescription>
      </div>
      <div>
        {
          <>
            {window.env?.isElectron && (
              <div className='mb-5'>
                <BlockDescription>
                  {t`settings.player-find-alternative-track-on-youtube-if-not-available-on-netease`}
                  {i18n.language === 'zh-CN' && (
                    <>
                      <br />
                      此功能需要开启 Clash for Windows 的 TUN Mode 或 ClashX Pro 的增强模式。
                    </>
                  )}
                </BlockDescription>
                {/* Switch */}
                <Option>
                  <OptionText>Enable YouTube Unlock</OptionText>
                  <Switch
                    enabled={enableFindTrackOnYouTube}
                    onChange={value => (settings.enableFindTrackOnYouTube = value)}
                  />
                </Option>
                {/* Proxy */}
                <Option>
                  <OptionText>
                    HTTP Proxy config for connecting to YouTube{' '}
                    {httpProxyForYouTube?.host && '(Configured)'}
                  </OptionText>
                  <Button
                    onClick={() => {
                      // todo: check regex
                      if (proxy === '') {
                        toast.error('proxy is empty')
                        return
                      }
                      settings.httpProxyForYouTube!.proxy = proxy
                      toast.success('proxy is' + proxy)
                    }}
                  >
                    Submit
                  </Button>
                </Option>
                <Option>
                  <OptionText>{t`settings.proxy`}</OptionText>
                  <AnimatePresence>
                    <motion.div initial='hidden' animate='show' exit='hidden' className='w-1/2'>
                      <input
                        onChange={e => {
                          setProxy(e.target.value)
                        }}
                        className='w-full grow appearance-none rounded-md px-1 text-lg placeholder:pl-1
                        placeholder:text-black/30 bg-black/10
                        dark:placeholder:text-white/30 dark:bg-white/10'
                        placeholder={'ext. https://192.168.10.1:8080'}
                        type='proxy'
                        value={proxy}
                      />
                    </motion.div>
                  </AnimatePresence>
                </Option>
              </div>
            )}
          </>
        }
        <Option>
          <div>
            <OptionText>{t`settings.qqCookie`}</OptionText>
            <div>
              {' '}
              <a
                className='underline'
                href='https://github.com/UnblockNeteaseMusic/server-rust/tree/main/engines#qq-cookie-設定說明'
                target='_blank'
              >
                {t`settings.cookieSettingRefrence`}
              </a>
              {t`settings.cookieDesc`}
            </div>
          </div>
          <AnimatePresence>
            <motion.div initial='hidden' animate='show' exit='hidden' className='w-1/2'>
              <textarea
                onChange={e => {
                  setQQCookie(e.target.value)
                  settings.qqCookie = e.target.value
                }}
                className='w-full grow appearance-none rounded-md px-1 text-lg placeholder:pl-1
                placeholder:text-black/30 bg-black/10
                dark:placeholder:text-white/30 dark:bg-white/10'
                placeholder={'uin=..; qm_keyst=..;'}
                value={nqqCookie}
              />
            </motion.div>
          </AnimatePresence>
        </Option>
        <Option>
          <div>
            <OptionText>{t`settings.miguCookie`}</OptionText>
            <div>
              {' '}
              <a
                className='underline'
                href='https://github.com/UnblockNeteaseMusic/server'
                target='_blank'
              >
                {t`settings.cookieSettingRefrence`}
              </a>
              {t`settings.cookieDesc`}
            </div>
          </div>
          <AnimatePresence>
            <motion.div initial='hidden' animate='show' exit='hidden' className='w-1/2'>
              <textarea
                onChange={e => {
                  setMIGUCookie(e.target.value)
                  settings.miguCookie = e.target.value
                }}
                className='w-full grow appearance-none rounded-md px-1 text-lg placeholder:pl-1
                placeholder:text-black/30 bg-black/10
                dark:placeholder:text-white/30 dark:bg-white/10'
                placeholder={'uin=..; migu=..;'}
                value={nmiguCookie}
              />
            </motion.div>
          </AnimatePresence>
        </Option>
        <Option>
          <div>
            <OptionText>{t`settings.jooxCookie`}</OptionText>
            <div>
              {' '}
              <a
                className='underline'
                href='https://github.com/UnblockNeteaseMusic/server-rust/tree/main/engines#joox-cookie-設定說明'
                target='_blank'
              >
                {t`settings.cookieSettingRefrence`}
              </a>
              {t`settings.cookieDesc`}
            </div>
          </div>
          <AnimatePresence>
            <motion.div initial='hidden' animate='show' exit='hidden' className='w-1/2'>
              <textarea
                onChange={e => {
                  setJOOXCookie(e.target.value)
                  settings.jooxCookie = e.target.value
                }}
                className='w-full grow appearance-none rounded-md px-1 text-lg placeholder:pl-1
                placeholder:text-black/30 bg-black/10
                dark:placeholder:text-white/30 dark:bg-white/10'
                placeholder={'wmid=..; session_key=..'}
                value={njooxCookie}
              />
            </motion.div>
          </AnimatePresence>
        </Option>
      </div>

      {/* Proxy */}
      <Option>
        <OptionText>
          HTTP Proxy config for connecting to YouTube {httpProxyForYouTube?.host && '(Configured)'}
        </OptionText>
        <Button
          onClick={() => {
            settings.httpProxyForYouTube!.proxy = proxy
            toast.success('proxy is' + proxy)
          }}
        >
          Submit
        </Button>
      </Option>
    </div>
  )
}

export default Player
