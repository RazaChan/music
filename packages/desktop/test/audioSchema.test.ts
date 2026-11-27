import { describe, expect, it } from 'vitest'
import { AUDIO_LEVEL_MIGRATION_SQL, needsAudioLevelMigration } from '../main/utils/audioSchema'

describe('needsAudioLevelMigration', () => {
  it('旧 schema（无 level 列）需要升级', () => {
    const legacy = [
      { name: 'id' },
      { name: 'bitRate' },
      { name: 'format' },
      { name: 'source' },
      { name: 'queriedAt' },
    ]
    expect(needsAudioLevelMigration(legacy)).toBe(true)
  })

  it('新 schema（有 level 列）不需要升级', () => {
    const current = [
      { name: 'id' },
      { name: 'level' },
      { name: 'bitRate' },
      { name: 'format' },
      { name: 'source' },
      { name: 'queriedAt' },
    ]
    expect(needsAudioLevelMigration(current)).toBe(false)
  })

  it('升级 SQL 是事务包裹的建表-拷贝-换名', () => {
    expect(AUDIO_LEVEL_MIGRATION_SQL).toContain('BEGIN')
    expect(AUDIO_LEVEL_MIGRATION_SQL).toContain('COMMIT')
    expect(AUDIO_LEVEL_MIGRATION_SQL).toContain('PRIMARY KEY ("id", "level")')
    // legacy 行补 level='exhigh'（与历史请求一致）
    expect(AUDIO_LEVEL_MIGRATION_SQL).toContain("'exhigh'")
    expect(AUDIO_LEVEL_MIGRATION_SQL).toContain('RENAME TO "Audio"')
  })
})
