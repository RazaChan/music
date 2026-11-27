/**
 * Audio 表 schema 升级判定（纯函数）。
 * 与 desktop/main/utils/audioSchema.ts 为同构双实现，改动需两端同步。
 *
 * 背景：Audio 表主键从 id 单键升级为 (id, level) 复合键并新增 level 列。
 * SQLite 无法 ALTER 主键，需要重建表；是否重建通过 table_info 特性检测，
 * 不依赖 migrate() 机制（其"文件版本高于应用版本才执行"的语义从未被实测）。
 */
export interface TableInfoRow {
  name: string
}

/** table_info 中没有 level 列 → 旧 schema，需要重建升级 */
export function needsAudioLevelMigration(tableInfo: TableInfoRow[]): boolean {
  return !tableInfo.some(column => column.name === 'level')
}

/** 升级 SQL：建新表 → 拷贝（legacy 行 level 记为 'exhigh'，与历史请求一致）→ 换名 */
export const AUDIO_LEVEL_MIGRATION_SQL = `
BEGIN;
CREATE TABLE IF NOT EXISTS "Audio_new" (
    "id" INTEGER NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'exhigh',
    "bitRate" INTEGER NOT NULL,
    "format" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "queriedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("id", "level")
);
INSERT OR IGNORE INTO "Audio_new" ("id", "level", "bitRate", "format", "source", "queriedAt")
    SELECT "id", 'exhigh', "bitRate", "format", "source", "queriedAt" FROM "Audio";
DROP TABLE "Audio";
ALTER TABLE "Audio_new" RENAME TO "Audio";
COMMIT;
`
