import path from 'path'
import { app } from 'electron'
import fs from 'fs'
import SQLite3 from 'better-sqlite3'
import log from './log'
import { createFileIfNotExist, dirname } from './utils'
import { isProd } from './env'
import { AUDIO_LEVEL_MIGRATION_SQL, needsAudioLevelMigration } from './utils/audioSchema'
import pkg from '../../../package.json'
import { compare, validate } from 'compare-versions'
import os from 'os'

log.info('[electron] db.ts')

export const enum Tables {
  Track = 'Track',
  Album = 'Album',
  Artist = 'Artist',
  Playlist = 'Playlist',
  ArtistAlbum = 'ArtistAlbum',
  Lyrics = 'Lyrics',
  Audio = 'Audio',
  AccountData = 'AccountData',
  CoverColor = 'CoverColor',
  AppData = 'AppData',
  AppleMusicAlbum = 'AppleMusicAlbum',
  AppleMusicArtist = 'AppleMusicArtist',
  Unblock = 'unblock',
}
interface CommonTableStructure {
  id: number
  json: string
  updatedAt: number
}
export interface TablesStructures {
  [Tables.Track]: CommonTableStructure
  [Tables.Album]: CommonTableStructure
  [Tables.Unblock]: CommonTableStructure
  [Tables.Artist]: CommonTableStructure
  [Tables.Playlist]: CommonTableStructure
  [Tables.ArtistAlbum]: CommonTableStructure
  [Tables.Lyrics]: CommonTableStructure
  [Tables.AccountData]: {
    id: string
    json: string
    updatedAt: number
  }
  [Tables.Audio]: {
    id: number
    /** 请求的音质档位（与 shared/api/Track.ts 的 level 联合类型一致）；与 id 组成复合主键 */
    level: 'standard' | 'higher' | 'exhigh' | 'lossless' | 'hires'
    bitRate: number
    format: 'mp3' | 'flac' | 'ogg' | 'wav' | 'm4a' | 'aac' | 'unknown' | 'opus'
    source:
      | 'unknown'
      | 'netease'
      | 'migu'
      | 'kuwo'
      | 'kugou'
      | 'youtube'
      | 'qq'
      | 'bilibili'
      | 'joox'
    /** 毫秒时间戳（Date.now()），命中缓存时更新，作为 LRU 依据 */
    queriedAt: number
  }
  [Tables.CoverColor]: {
    id: number
    color: string
    queriedAt: number
  }
  [Tables.AppData]: {
    id: 'appVersion' | 'skippedVersion'
    value: string
  }
  [Tables.AppleMusicAlbum]: CommonTableStructure
  [Tables.AppleMusicArtist]: CommonTableStructure
}

type TableNames = keyof TablesStructures

const readSqlFile = (filename: string) => {
  return fs.readFileSync(path.join(dirname, `./migrations/${filename}`), 'utf8')
}

class DB {
  sqlite!: SQLite3.Database
  dbFilePath: string = path.resolve(app.getPath('userData'), './api_cache/db.sqlite')

  constructor() {
    log.info('[db] Initializing database...')

    try {
      createFileIfNotExist(this.dbFilePath)

      this.sqlite = new SQLite3(this.dbFilePath, {
        nativeBinding: this.getBinPath(),
      })
      this.sqlite.pragma('auto_vacuum = FULL')
      this.initTables()
      this.migrate()

      log.info('[db] Database initialized.')
    } catch (e) {
      log.error('[db] Database initialization failed.')
      log.error(e)
    }
  }

  private getBinPath() {
    console
    const devBinPath = path.resolve(
      app.getPath('userData'),
      `../../bin/better_sqlite3_${os.platform}_${os.arch}.node`
    )
    const prodBinPaths = {
      darwin: path.resolve(app.getPath('exe'), `../../Resources/bin/better_sqlite3.node`),
      win32: path.resolve(app.getPath('exe'), `../resources/bin/better_sqlite3.node`),
      linux: path.resolve(app.getPath('exe'), `../resources/bin/better_sqlite3.node`),
    }
    return isProd
      ? prodBinPaths[os.platform as unknown as 'darwin' | 'win32' | 'linux']
      : devBinPath
  }

  initTables() {
    log.info('[db] Initializing database tables...')
    const init = readSqlFile('init.sql')
    this.sqlite.exec(init)
    this.upgradeAudioTableSchema()
    this.sqlite.pragma('journal_mode=WAL')
    log.info('[db] Database tables initialized.')
  }

  /**
   * Audio 表升级：新增 level 列、主键改为 (id, level)。
   * SQLite 不能 ALTER 主键，需重建表；用 table_info 特性检测而非 migrate()
   * 机制（后者的版本语义从未被实测过）。
   */
  private upgradeAudioTableSchema() {
    const tableInfo = this.sqlite.pragma('table_info(Audio)') as { name: string }[]
    if (!needsAudioLevelMigration(tableInfo)) return
    log.info('[db] Upgrading Audio table schema (add level, composite primary key)...')
    this.sqlite.exec(AUDIO_LEVEL_MIGRATION_SQL)
    log.info('[db] Audio table schema upgraded.')
  }

  migrate() {
    log.info('[db] Migrating database..')

    const key = 'appVersion'
    const appVersion = this.find(Tables.AppData, key)
    const updateAppVersionInDB = () => {
      this.upsert(Tables.AppData, {
        id: key,
        value: pkg.version,
      })
    }

    if (!appVersion?.value) {
      updateAppVersionInDB()
      return
    }

    const sqlFiles = fs.readdirSync(path.join(dirname, './migrations'))
    sqlFiles.forEach((sqlFile: string) => {
      const version = sqlFile.split('.').shift() || ''
      if (!validate(version)) return
      if (compare(version, pkg.version, '>')) {
        const file = readSqlFile(sqlFile)
        this.sqlite.exec(file)
      }
    })

    updateAppVersionInDB()

    log.info('[db] Database migrated.')
  }

  find<T extends TableNames>(
    table: T,
    key: TablesStructures[T]['id']
  ): TablesStructures[T] | undefined {
    return this.sqlite.prepare(`SELECT * FROM ${table} WHERE id = ? LIMIT 1`).get(key)
  }

  findMany<T extends TableNames>(
    table: T,
    keys: TablesStructures[T]['id'][]
  ): TablesStructures[T][] {
    const idsQuery = keys.map(key => `id = ${key}`).join(' OR ')
    return this.sqlite.prepare(`SELECT * FROM ${table} WHERE ${idsQuery}`).all()
  }

  findAll<T extends TableNames>(table: T): TablesStructures[T][] {
    return this.sqlite.prepare(`SELECT * FROM ${table}`).all()
  }

  create<T extends TableNames>(table: T, data: TablesStructures[T], skipWhenExist: boolean = true) {
    if (skipWhenExist && db.find(table, data.id)) return
    return this.sqlite.prepare(`INSERT INTO ${table} VALUES (?)`).run(data)
  }

  createMany<T extends TableNames>(
    table: T,
    data: TablesStructures[T][],
    skipWhenExist: boolean = true
  ) {
    const valuesQuery = Object.keys(data[0])
      .map(key => `:${key}`)
      .join(', ')
    const insert = this.sqlite.prepare(
      `INSERT ${skipWhenExist ? 'OR IGNORE' : ''} INTO ${table} VALUES (${valuesQuery})`
    )
    const insertMany = this.sqlite.transaction((rows: any[]) => {
      rows.forEach((row: any) => insert.run(row))
    })
    insertMany(data)
  }

  /**
   * 按主键 id 更新部分字段（参数化）。Audio 表为 (id, level) 复合主键，
   * WHERE id = ? 会同时触及该曲目所有音质档位的行 —— 对"触碰 queriedAt"
   * 的语义是正确的。
   */
  update<T extends TableNames>(
    table: T,
    key: TablesStructures[T]['id'],
    data: Partial<TablesStructures[T]>
  ) {
    const entries = Object.entries(data).filter(([, value]) => value !== undefined)
    if (!entries.length) return
    const setQuery = entries.map(([column]) => `${column} = :${column}`).join(', ')
    return this.sqlite
      .prepare(`UPDATE ${table} SET ${setQuery} WHERE id = :__id`)
      .run({ ...Object.fromEntries(entries), __id: key })
  }

  /** Audio 表按 (id, level) 精确查询 */
  findAudio(id: number, level: string): TablesStructures[Tables.Audio] | undefined {
    return this.sqlite
      .prepare(`SELECT * FROM ${Tables.Audio} WHERE id = ? AND level = ? LIMIT 1`)
      .get(id, level) as TablesStructures[Tables.Audio] | undefined
  }

  /** Audio 表按 id 取最高码率的缓存（请求的档位未命中时降级用） */
  findBestAudio(id: number): TablesStructures[Tables.Audio] | undefined {
    return this.sqlite
      .prepare(`SELECT * FROM ${Tables.Audio} WHERE id = ? ORDER BY bitRate DESC LIMIT 1`)
      .get(id) as TablesStructures[Tables.Audio] | undefined
  }

  upsert<T extends TableNames>(table: T, data: TablesStructures[T]) {
    // 显式列名：不依赖对象键序与表列序一致（Audio 升级为复合主键后列序已变）
    const columns = Object.keys(data)
    const valuesQuery = columns.map(key => `:${key}`).join(', ')
    return this.sqlite
      .prepare(`INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES (${valuesQuery})`)
      .run(data)
  }

  upsertMany<T extends TableNames>(table: T, data: TablesStructures[T][]) {
    // 显式列名：不依赖对象键序与表列序一致
    const columns = Object.keys(data[0])
    const valuesQuery = columns.map(key => `:${key}`).join(', ')
    const upsert = this.sqlite.prepare(
      `INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES (${valuesQuery})`
    )
    const upsertMany = this.sqlite.transaction((rows: any[]) => {
      rows.forEach((row: any) => upsert.run(row))
    })
    upsertMany(data)
  }

  delete<T extends TableNames>(table: T, key: TablesStructures[T]['id']) {
    return this.sqlite.prepare(`DELETE FROM ${table} WHERE id = ?`).run(key)
  }

  deleteMany<T extends TableNames>(table: T, keys: TablesStructures[T]['id'][]) {
    const idsQuery = keys.map(key => `id = ${key}`).join(' OR ')
    return this.sqlite.prepare(`DELETE FROM ${table} WHERE ${idsQuery}`).run()
  }

  truncate<T extends TableNames>(table: T) {
    return this.sqlite.prepare(`DELETE FROM ${table}`).run()
  }

  vacuum() {
    return this.sqlite.prepare('VACUUM').run()
  }
}

export const db = new DB()
