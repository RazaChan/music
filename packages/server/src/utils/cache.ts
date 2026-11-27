import { db, Tables, TablesStructures } from './db'
import type { FetchTracksResponse } from '../../../shared/api/Track'
import log from './log'
import fs from 'fs'
import { IAudioMetadata } from 'music-metadata'
import { CacheAPIs, CacheAPIsParams } from '../../../shared/CacheAPIs'
import { FastifyReply } from 'fastify'
import { dirname } from './utils'
import { parseRangeHeader } from './audioRange'
import { pipeline } from 'stream/promises'
import path from 'path'

log.info('[electron] cache.ts')

// 读写共用同一个音频缓存目录，避免写入与读取路径不一致导致缓存永远未命中
export const AUDIO_CACHE_DIR = path.join(process.env.DATA_DIR || dirname, 'audio_cache')

class Cache {
  constructor() {
    //
  }

  async set(api: string, data: any, query: any = {}) {
    switch (api) {
      case CacheAPIs.UserPlaylist:
      case CacheAPIs.UserAccount:
      case CacheAPIs.Personalized:
      case CacheAPIs.RecommendResource:
      case CacheAPIs.UserAlbums:
      case CacheAPIs.UserArtists:
      case CacheAPIs.ListenedRecords:
      case CacheAPIs.Likelist: {
        if (!data) return
        db.upsert(Tables.AccountData, {
          id: api,
          json: JSON.stringify(data),
          updatedAt: Date.now(),
        })
        break
      }
      case CacheAPIs.Track: {
        const res = data as FetchTracksResponse
        if (!res.songs) return
        const tracks = res.songs.map(t => ({
          id: t.id,
          json: JSON.stringify(t),
          updatedAt: Date.now(),
        }))
        db.upsertMany(Tables.Track, tracks)
        break
      }
      case CacheAPIs.Unblock: {
        if (!data.id || !data.url) return
        db.upsert(Tables.Unblock, {
          id: data.id,
          json: JSON.stringify(data),
          updatedAt: Date.now(),
        })
        break
      }
      case CacheAPIs.Album: {
        if (!data.album) return
        data.album.songs = data.songs
        db.upsert(Tables.Album, {
          id: data.album.id,
          json: JSON.stringify(data.album),
          updatedAt: Date.now(),
        })
        break
      }
      case CacheAPIs.Playlist: {
        if (!data.playlist) return
        db.upsert(Tables.Playlist, {
          id: data.playlist.id,
          json: JSON.stringify(data),
          updatedAt: Date.now(),
        })
        break
      }
      case CacheAPIs.Artist: {
        if (!data.artist) return
        db.upsert(Tables.Artist, {
          id: data.artist.id,
          json: JSON.stringify(data),
          updatedAt: Date.now(),
        })
        break
      }
      case CacheAPIs.ArtistAlbum: {
        if (!data.hotAlbums) return
        db.createMany(
          Tables.Album,
          // data.hotAlbums.map((a: Album) => ({
          data.hotAlbums.map((a: any) => ({
            id: a.id,
            json: JSON.stringify(a),
            updatedAt: Date.now(),
          }))
        )
        const modifiedData = {
          ...data,
          // hotAlbums: data.hotAlbums.map((a: Album) => a.id),
          hotAlbums: data.hotAlbums.map((a: any) => a.id),
        }
        db.upsert(Tables.ArtistAlbum, {
          id: data.artist.id,
          json: JSON.stringify(modifiedData),
          updatedAt: Date.now(),
        })
        break
      }
      case CacheAPIs.Lyric: {
        if (!data.lrc) return
        db.upsert(Tables.Lyrics, {
          id: query.id,
          json: JSON.stringify(data),
          updatedAt: Date.now(),
        })
        break
      }
      case CacheAPIs.CoverColor: {
        if (!data.id || !data.color) return
        if (/^#([a-fA-F0-9]){3}$|[a-fA-F0-9]{6}$/.test(data.color) === false) {
          return
        }
        db.upsert(Tables.CoverColor, {
          id: data.id,
          color: data.color,
          queriedAt: Date.now(),
        })
        break
      }
      case CacheAPIs.AppleMusicAlbum: {
        if (!data.id) return
        db.upsert(Tables.AppleMusicAlbum, {
          id: data.id,
          json: data.album ? JSON.stringify(data.album) : 'no',
          updatedAt: Date.now(),
        })
        break
      }
      case CacheAPIs.AppleMusicArtist: {
        if (!data) return
        db.upsert(Tables.AppleMusicArtist, {
          id: data.id,
          json: data.artist ? JSON.stringify(data.artist) : 'no',
          updatedAt: Date.now(),
        })
        break
      }
    }
  }

  get<T extends keyof CacheAPIsParams>(api: T, params: any): any {
    switch (api) {
      case CacheAPIs.UserPlaylist:
      case CacheAPIs.UserAccount:
      case CacheAPIs.Personalized:
      case CacheAPIs.RecommendResource:
      case CacheAPIs.UserArtists:
      case CacheAPIs.ListenedRecords:
      case CacheAPIs.Likelist: {
        const data = db.find(Tables.AccountData, api)
        if (data?.json) return JSON.parse(data.json)
        break
      }
      case CacheAPIs.Track: {
        const ids: number[] = params?.ids.split(',').map((id: string) => Number(id))
        if (ids.length === 0) return

        if (ids.includes(NaN)) return

        const tracksRaw = db.findMany(Tables.Track, ids)

        if (tracksRaw.length !== ids.length) {
          return
        }
        const tracks = ids.map(id => {
          const track = tracksRaw.find(t => t.id === Number(id)) as any
          return JSON.parse(track.json)
        })
        return {
          code: 200,
          songs: tracks,
          privileges: {},
        }
      }
      case CacheAPIs.Unblock: {
        if (isNaN(Number(params?.id))) return
        const data = db.find(Tables.Unblock, Number(params.id))
        if (data?.json)
          // 与 /song/url/v1 消费方期望的形状一致：{ code, data: [{ url, ... }] }
          return {
            code: 200,
            data: [JSON.parse(data.json)],
          }
        break
      }
      case CacheAPIs.Album: {
        if (isNaN(Number(params?.id))) return
        const data = db.find(Tables.Album, params.id)
        if (data?.json)
          return {
            resourceState: true,
            songs: [],
            code: 200,
            album: JSON.parse(data.json),
          }
        break
      }
      case CacheAPIs.Playlist: {
        if (isNaN(Number(params?.id))) return
        const data = db.find(Tables.Playlist, params.id)
        if (data?.json) return JSON.parse(data.json)
        break
      }
      case CacheAPIs.Artist: {
        if (isNaN(Number(params?.id))) return
        const data = db.find(Tables.Artist, params.id)
        const fromAppleData = db.find(Tables.AppleMusicArtist, params.id)
        const fromApple = fromAppleData?.json && JSON.parse(fromAppleData.json)
        const fromNetease = data?.json && JSON.parse(data.json)
        if (fromNetease && fromApple && fromApple !== 'no') {
          fromNetease.artist.img1v1Url = fromApple.attributes.artwork.url
          fromNetease.artist.briefDesc = fromApple.attributes.artistBio
        }
        return fromNetease ? fromNetease : undefined
      }
      case CacheAPIs.ArtistAlbum: {
        if (isNaN(Number(params?.id))) return

        const artistAlbumsRaw = db.find(Tables.ArtistAlbum, params.id)
        if (!artistAlbumsRaw?.json) return
        const artistAlbums = JSON.parse(artistAlbumsRaw.json)

        const albumsRaw = db.findMany(Tables.Album, artistAlbums.hotAlbums)
        if (albumsRaw.length !== artistAlbums.hotAlbums.length) return
        const albums = albumsRaw.map(a => JSON.parse(a.json))

        artistAlbums.hotAlbums = artistAlbums.hotAlbums.map((id: number) =>
          albums.find(a => a.id === id)
        )
        return artistAlbums
      }
      case CacheAPIs.Lyric: {
        if (isNaN(Number(params?.id))) return
        const data = db.find(Tables.Lyrics, params.id)
        if (data?.json) return JSON.parse(data.json)
        break
      }
      case CacheAPIs.CoverColor: {
        if (isNaN(Number(params?.id))) return
        return db.find(Tables.CoverColor, params.id)?.color
      }
      case CacheAPIs.AppleMusicAlbum: {
        if (isNaN(Number(params?.id))) return
        const data = db.find(Tables.AppleMusicAlbum, params.id)
        if (data?.json && data.json !== 'no') return JSON.parse(data.json)
        break
      }
      case CacheAPIs.AppleMusicArtist: {
        if (isNaN(Number(params?.id))) return
        const data = db.find(Tables.AppleMusicArtist, params.id)
        if (data?.json && data.json !== 'no') return JSON.parse(data.json)
        break
      }
    }
  }

  /**
   * 流式返回缓存的音频文件，支持真实 Range 请求。与 desktop 侧同构。
   * filename 白名单校验先于任何 fs 操作（防路径穿越）。
   */
  getAudio(fileName: string, reply: FastifyReply, rangeHeader?: string) {
    if (!fileName) {
      return reply.status(400).send({ error: 'No filename provided' })
    }
    // setAudio 只会写入 `${id}-${bitRate}.${type}`（type 取值见其 codec 映射）；
    // filename 来自路由参数，必须先校验，防止 `..%2F` 之类的路径穿越
    if (!/^\d+-\d+\.(mp3|flac|m4a|ogg|opus|unknown)$/.test(fileName)) {
      return reply.status(400).send({ error: 'Invalid filename' })
    }
    const id = Number(fileName.split('-')[0])
    const filePath = `${AUDIO_CACHE_DIR}/${fileName}`

    let size: number
    try {
      size = fs.statSync(filePath).size
    } catch {
      // 表里有记录但文件已丢失 —— 清掉记录，按未命中处理
      db.delete(Tables.Audio, id)
      return reply.status(404).send({ error: 'Audio not found' })
    }
    if (size === 0) {
      db.delete(Tables.Audio, id)
      try {
        fs.unlinkSync(filePath)
      } catch {
        /* ignore */
      }
      return reply.status(404).send({ error: 'Audio not found' })
    }

    // 命中即触碰 queriedAt（作为 LRU 依据）
    db.update(Tables.Audio, id, { queriedAt: Date.now() })

    const range = parseRangeHeader(rangeHeader, size)
    if (range === 'invalid') {
      return reply
        .status(416)
        .header('Content-Range', `bytes */${size}`)
        .send({ error: 'Requested range not satisfiable' })
    }
    if (range === null) {
      return reply
        .status(200)
        .header('Accept-Ranges', 'bytes')
        .header('Content-Length', size)
        .header('Content-Type', 'application/octet-stream')
        .send(fs.createReadStream(filePath))
    }
    return reply
      .status(206)
      .header('Accept-Ranges', 'bytes')
      .header('Content-Range', `bytes ${range.start}-${range.end}/${size}`)
      .header('Content-Length', range.end - range.start + 1)
      .header('Content-Type', 'application/octet-stream')
      .send(fs.createReadStream(filePath, { start: range.start, end: range.end }))
  }

  /**
   * 流式落盘缓存音频：multipart 流 → 临时文件 → 解析元数据 → 重命名 → 写库。
   * 不再 toBuffer() 整文件驻留内存；元数据解析失败按 unknown 容错落盘。
   */
  async setAudio(
    file: NodeJS.ReadableStream,
    {
      id,
      url,
      level,
    }: { id: number; url: string; level: TablesStructures[Tables.Audio]['level'] }
  ) {
    await fs.promises.mkdir(AUDIO_CACHE_DIR, { recursive: true })

    const tempPath = path.join(AUDIO_CACHE_DIR, `${id}.download`)
    try {
      await pipeline(file, fs.createWriteStream(tempPath))

      const { parseFile } = await import('music-metadata')
      let meta: IAudioMetadata | undefined
      try {
        meta = await parseFile(tempPath)
      } catch (e) {
        log.error('[cache] parse audio metadata failed', e)
      }
      // bitrate 是浮点（VBR），四舍五入取整 —— 文件名必须是 `{id}-{整数}.{ext}`
      // 才能通过读取侧的白名单校验
      const bitRate = meta?.format?.codec === 'OPUS' ? 165000 : Math.round(meta?.format?.bitrate ?? 0)
      const type =
        {
          'MPEG 1 Layer 3': 'mp3',
          'Ogg Vorbis': 'ogg',
          AAC: 'm4a',
          FLAC: 'flac',
          OPUS: 'opus',
        }[meta?.format?.codec ?? ''] ?? 'unknown'

      let source: TablesStructures[Tables.Audio]['source'] = 'unknown'
      if (url.includes('googlevideo.com')) source = 'youtube'
      if (url.includes('126.net')) source = 'netease'

      const fileName = `${id}-${bitRate}.${type}`
      await fs.promises.rename(tempPath, path.join(AUDIO_CACHE_DIR, fileName))

      db.upsert(Tables.Audio, {
        id,
        level,
        bitRate,
        format: type as TablesStructures[Tables.Audio]['format'],
        source,
        queriedAt: Date.now(),
      })
      log.info(`[cache] audio cached: ${fileName} (level=${level})`)
    } catch (error) {
      try {
        await fs.promises.unlink(tempPath)
      } catch {
        /* ignore */
      }
      log.error(`[cache] cacheAudio failed: ${error}`)
      throw error
    }
  }
}
const cache = new Cache()

export default cache
