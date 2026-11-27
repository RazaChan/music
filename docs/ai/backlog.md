# 已知债、已知红、已知禁区 — R3PLAYX (music)

> 生成：2026-11-25，只读测绘。
> **用途**：防止 agent（或未来的你）去"修"一个没人打算修的东西，或者在不知情的情况下踩红线。
> **未验证**：本次没有执行 `pnpm build` / `pnpm test` / 启动应用，所以"本来就红"的部分只记录了**结构事实**，实际红灯状态待第一次跑测试后补。

产品定位、体验设计原则与分阶段特性路线见 [`../product/vision-design-and-roadmap.md`](../product/vision-design-and-roadmap.md)。本文继续负责具体技术债、验证记录与工程禁区，避免两处重复维护。

## 1. `CLAUDE.md` 版本信息全线过时（最高优先级）

根 `CLAUDE.md` 是每次会话都会加载的常驻上下文，它的技术栈描述与现实严重不符：

| CLAUDE.md 写的 | `package.json` 实际 | 依据 |
|---|---|---|
| Electron 28 | **^43.4.0** | `packages/desktop/package.json` devDeps |
| React 18 | **^19.2.8** | `packages/web/package.json` deps |
| Vite 4 | **^7.3.6** | 同上 devDeps |
| Fastify 4 | **^5.12.0** | desktop / server 两处 |
| Prisma（无版本） | **^6.19.3** | `packages/server/package.json` |
| Tailwind CSS（无版本） | **^4.3.3**，CSS-first，走 `@tailwindcss/vite` | `packages/web/package.json` |
| Node >= 16，推荐 18.12.1 | **>= 22.12** | 根 `package.json` engines |
| v2.7.6 Beta | **2.8.0** | 根 `package.json` |
| shared 是最先构建的包 | **shared 没有 package.json，无构建步骤** | `packages/shared/` |

**处理建议**：不要"顺手重写整份 CLAUDE.md"。只改事实层（版本、命令、目录地图），保持结构不动；改完在文件头加一行"最后校准：2026-11-25，以 `packages/*/package.json` 为准"。

**为什么不能放任**：模型会拿 Electron 28 / Fastify 4 的 API 给你写代码——这在升级后的大版本上是实打实的错误来源。

## 2. 双份路由实现需要同步修改

`desktop/main/appServer/routes/` 与 `server/src/routes/` 同构但**不共享代码**（详见 `architecture.md` 第 6 节）。改其中一个接口的形状，另一个大概率要跟。

**这是本项目最容易漏的地方**：没有编译期约束能提醒你，只有跑起来才发现另一头 404。

**安全做法**：任何触及 `routes/netease/*` 或 `routes/apple-music/*` 的改动，影响面清单里必须显式列出"另一个实现是否要同步"。

## 3. 跨包依赖主版本不一致

| 依赖 | desktop | web | 风险 |
|---|---|---|---|
| `@tanstack/react-query` | ^4.44.0 | ^5.101.4 | **v5 有破坏性 API 变更**（`useQuery` 签名、`cacheTime`→`gcTime` 等）。两套语义并存，从 web 抄代码到 desktop 会静默错 |
| `vitest` | ^0.26.3 | ^4.1.10 | 配置项、mock API、`--ui` 行为差异大；desktop 的测试写法不能照搬到 web |

**处理建议**：暂时别动。要统一就单独开一个 PR 只做这件事，且必须先补测试——现在测试总量只有 5 个文件，没有护栏的升级等于赌博。

## 4. 测试覆盖极薄

> **基线实测（2026-11-25 20:51）**：两个包现有测试**全绿**，但覆盖极薄。

| 包 | 测试结果 | 说明 |
|---|---|---|
| `web` | **3 文件 / 25 用例，全绿**（2.03s） | 只覆盖工具函数，**零组件/零业务逻辑测试** |
| `desktop` | **2 文件 / 11 用例，全绿**（1.83s） | 都是安全相关的小函数 |
| `server` | **0 个，且 package.json 里没有 test 脚本** | 未验证 |

**含义**：`player.ts`（772 行）、`ipcMain.ts`（393 行）、`CoverRowVirtual.tsx`（510 行）这三个高危文件**没有一行测试**。任何重构前必须先补特征测试，否则没有验证手段。

**优先级建议**：`player.ts` 的队列推进与音质回退逻辑 > `IpcChannels` 三处一致性 > `cache.ts` 的写入/清理路径。

### 4b. 类型检查基线：web 干净，desktop 本来就红

> 这是最重要的一条"本来就红"——不记下来，下一步一定有人去"修"它。

| 包 | `pnpm test:types` 结果 |
|---|---|
| `web` | **0 error**（干净，可作为回归基线） |
| `desktop` | **34 error / 6 文件**（失败） |

desktop 的 34 个错误分布：

| 文件 | 数量 | 性质 |
|---|---|---|
| `main/youtube.ts` | 16 | 第三方库类型缺失/API 漂移 |
| `scripts/build.main.ts` | 9 | 构建脚本，esbuild 类型收紧 + 隐式 any |
| `main/touchBar.ts` | 3 | 隐式 any（回调参数） |
| `main/db.ts` | 3 | 泛型推断退化（`unknown` 赋给 `TablesStructures[T]`） |
| `scripts/build.sqlite3.ts` | 2 | 隐式 any |
| `main/ipcMain.ts` | **1** | **真实缺陷，见下** |

**不要做的事**：不要为了让 desktop 变绿而顺手改这 34 处。它们是既存状态，改动的风险不等于收益。要修就单独开一个 PR，一次只修一类。

### 4c. `ipcMain.ts:376` 是一处真实的静默失效（类型基线抓到的）

```ts
// packages/desktop/main/ipcMain.ts:375-377
handle(IpcChannels.GetPlatform, event => {
  event.returnValue = getPlatform()
})
```

- 用的是 `handle`（对应渲染端的 `invoke`），但写的是 `event.returnValue`——`returnValue` 属于 `ipcMain.on` 的 `IpcMainEvent`，`IpcMainInvokeEvent` 上没有这个属性。`handle` 的返回值只取回调的 `return`，而这里回调没有 `return`。
- 渲染端 `web/hooks/useOSPlatform.ts:21` 确实在等返回值：`await window.ipcRenderer?.invoke(IpcChannels.GetPlatform)`。

**影响面**：`useOSPlatform()` 在桌面端会拿到 `undefined`，然后回落到 `detectPlatform()`（UA 判断，`:7-18`）。所以**不崩、不报错，只是静默降级**。UA 判断在 Electron 43 下大概率仍能猜对，因此这个 bug 至今没被发现。

**建议改法**（低风险，一处）：

```ts
handle(IpcChannels.GetPlatform, () => getPlatform())
```

**验证方式**：改完 `pnpm test:types --filter desktop` 的该条错误消失；再在桌面端打印 `useOSPlatform()` 确认拿到 `win32`。注意此时 desktop 仍有 33 个既存错误，不要误以为"修好了就全绿"。

## 5. 安全红线（近期修复确立，不要回退）

来自提交 `b19cdb4 fix(security): sanitize description HTML and contain local audio-cache route`：

| 红线 | 守护测试 | 别做什么 |
|---|---|---|
| 歌单/专辑 `description` 的 HTML 必须净化后再渲染 | `web/test/utils/sanitizeHtml.test.ts` | 不要为了"显示更完整"去掉 `DOMPurify` 那层 |
| 本地音频缓存路由必须收敛在指定目录内 | `desktop/test/cacheAudioPath.test.ts` | 不要放开路径拼接，不要接受前端传入的任意路径 |
| 本地服务只接受 loopback 主机 | `desktop/test/loopbackHostCheck.test.ts` | 不要把 `registerLoopbackHostCheck` 去掉或放宽到 `0.0.0.0` |

**这三处属于"改之前先问"级别**，不是"顺手优化"级别。

## 6. 遗留物与噪音目录

| 项 | 状态 | 建议 |
|---|---|---|
| `package-lock.json`（96KB） | 与 `pnpm-lock.yaml` 并存 | 疑似遗留。**先确认没有 CI 依赖它**再删，删的时候单独一个 commit |
| `.zread/wiki/` | 旧工具生成的文档快照 | 事实不可信。要么删，要么在目录里放个 README 标明"历史快照，勿引用" |
| `.qoder/repowiki/wiki_plan.yaml` | 只有规划，没有生成产物 | 想用 Repo Wiki 就按规划跑一次；不想用就删，别留着误导 |
| `tmp/`（722 文件） | better-sqlite3 二进制 + Electron userData | 已在 `.gitignore`，不要提交 |
| `CLAUDE.md` 与 `.qoder/repowiki/wiki_plan.yaml` 并存 | 两份都在描述架构 | 以 `docs/ai/` 为准，`CLAUDE.md` 收敛为"命令 + 禁区 + 指针" |

## 7. 脆弱的外部依赖

- `@neteasecloudmusicapienhanced/api`：网易 API 的非官方增强版，接口形状随上游变。
- `@unblockneteasemusic/server`：用于绕过区域限制，随时可能失效。
- `ytdl-core ^4.11.5`：YouTube 下载库，上游长期不稳定，且与 YouTube 侧变更强耦合。

**含义**：这三处出问题，大概率不是本项目的 bug。排查顺序应该是"上游变了 → 降级/替换"，而不是"改我们的调用代码"。

## 8. 基线记录（2026-11-25 20:51 实测）

已执行：

```bash
pnpm --filter web exec vitest run          # 3 文件 / 25 用例 全绿  2.03s
pnpm --filter desktop exec vitest run      # 2 文件 / 11 用例 全绿  1.83s
pnpm --filter web test:types               # 0 error
pnpm --filter desktop test:types           # 34 error（既存，见 4b/4c）
```

未执行（下次开工补）：

- [ ] `pnpm install` 在 Node 22.22.2 下是否干净通过（`post-install` 会编译 better-sqlite3 + 生成 Prisma client）
- [ ] `pnpm build` 全链路是否绿
- [ ] `pnpm dev`（桌面）能否起来、`42710` 是否可访问
- [ ] `server` 包在无 test 脚本下的实际验证方式（可能只能手工启动）
- [ ] `pnpm lint` 的实际红灯情况

**两个操作层面的坑（实测）**：

1. `pnpm test --filter <包>` 会进 watch 模式，在脚本/CI 里必须写 `pnpm --filter <包> exec vitest run`。
2. `vitest run --reporter=basic` 在 vitest 4 下会直接崩（`basic` reporter 已移除），用默认 reporter 或 `--reporter=dot`。

跑完之后，把结果回填到第 4 节与本节——这才是 `docs/ai/` 应有的闭环。

## 9. 特征测试落地记录（2026-11-25 20:54）

新增 `packages/web/test/utils/player.queue.test.ts`，**25 个用例**，锁住 `player.ts` 的纯逻辑部分：

| 覆盖范围 | 用例数 | 锁住了什么 |
|---|---|---|
| 队列推进（Off / On / One / 边界） | 8 | `_nextTrackIndex` / `_prevTrackIndex` 的全部现有语义，含"第一首的上一首返回 0 而不是 undefined"这种反直觉行为 |
| trackID 读写 | 4 | TrackList 与 FM 两种模式的取值来源；写入时**同时改两处**的既有约定 |
| progress / volume | 3 | Loading 态 progress 恒为 0；volume clamp 到 0–1 |
| `_fetchAudioSource` | 4 | 126.net 的 http→https；非 126.net 不动；两条失败路径 |
| 队列编辑 | 6 | `addToNextPlay` / `addToFirstPlay` 的插入位置与去重 |

**结果**：web 包测试从 `3 文件 / 25 用例` → `4 文件 / 50 用例`，全绿；`test:types` 仍 0 error。

**反向验证已做**：把 `RepeatMode.Off` 的 `return this._trackIndex + 1` 改成 `return this._trackIndex`，测试立刻 3 处失败（含 `addToNextPlay` 的连带影响），还原后恢复全绿。**说明这组测试真的能抓到回归，不是摆设。**

### 9a. 三个开放问题（测出来了，但不擅自改）

> **2026-11-27 更新：①②③ 已全部按目标行为修复**，见第 10 节。下面保留原始记录作为决策依据。

#### ① Shuffle 模式没有在队列推进里处理

`_nextTrackIndex` / `_prevTrackIndex` 的 `switch` 只写了 `Off` / `On` / `One`，`RepeatMode.Shuffle` 和 `RepeatMode.ShuffleOff` 落空 → 返回 `undefined`。

但 UI 侧的 shuffle 按钮（`web/components/PlayingNext.tsx:96`）只调用 `shufflePlayList()`，**并不设 `repeatMode`**；只有 IPC 的 `Repeat` 通道（`web/ipcRenderer.ts:57-62`）会在收到 Shuffle 时调 `shufflePlayList()`。

**两条路径不一致**：如果 `repeatMode` 真的被设成 `Shuffle`，`nextTrack()` 会走「没有下一首了 + 暂停」分支。需要人工确认哪个是意图：是"shuffle 只重排列表、repeatMode 保持 Off/On/One"，还是"repeatMode 应该设成 Shuffle、队列推进需要补 case"。

现状已被测试锁定（`Shuffle / ShuffleOff 未被 switch 处理，返回 undefined`），改之前先看那条用例。

#### ② `addToNextPlay` 在最后一首时会插到队首

```ts
// player.ts:566 / :569
this.trackList.splice(Number(this._nextTrackIndex), 0, trackID)
```

列表末位时 `_nextTrackIndex` 是 `undefined`，`Number(undefined)` 为 `NaN`，而 `splice(NaN, 0, x)` 等价于插到下标 0 —— **"下一首播放"变成了"置顶播放"**。

期望行为大概是追加到末尾。已有用例锁住现状（`addToNextPlay 在最后一首时被插到队首`），修的时候让它先失败。

#### ③ `_fetchAudioSource` 两条失败路径返回不同 falsy 值

- 接口无数据 → `{ audio: undefined }`
- 接口抛错 → `{ audio: null }`

调用方统一用 `if (!audio)` 判断（`player.ts:343`），所以目前无影响。但**任何改成 `audio === null` 的判断都会漏掉前者**。两条路径都已锁定。

### 9b. 还没测的部分（下一批候选）

`player.ts` 还剩这些高风险但耦合较深、需要先做接缝的区域：

- `_playTrack` / `_playAudio`：依赖 `fetchTracksWithReactQuery` + Howler 实例，需要把"取元数据 → 取流 → 播放"三段拆开才能单测
- `_scrobble` 的阈值判定（`progress > dt/1000/3`）——逻辑可测，但要伪造 `track.dt` 与 `trackListSource`
- `nextTrack()` 的完整副作用链（`_setStateToLoading` → `_scrobble` → `pause` → `_playTrack`）
- `shufflePlayList()`：依赖 `lodash.random`，需要固定随机源才能断言洗牌结果；当前只断言了"能来回切换"

## 10. 播放器三件套落地记录（2026-11-27）

产品路线 `docs/product/vision-design-and-roadmap.md` 阶段 1 第一批：状态可靠恢复、队列边界修复、音源失败生命周期。

### 交付内容

**新增 `web/utils/playerState.ts`**：持久化状态的逐字段校验（sanitize）。非法字段单独丢弃而非整体拒绝；音量 0（静音）合法保留；无 `__v` 的 legacy 数据与更新版本的数据按字段形状尽力恢复。`Player` 新增 `__v` 字段随序列化写入。

**`web/utils/player.ts` 修复**：

| 问题 | 原行为 | 现行为 |
|---|---|---|
| init() truthy 检查 | 音量 0 丢失、进度/原始队列不恢复 | 经 sanitize 逐字段恢复，音量走 setter 同步 Howler |
| init() 笔误 | `if (params.state) this.trackList = params.state` | 已删除（sanitize 不读 state） |
| shuffle 恢复 | 调 `shufflePlayList()` 重洗，originTrackList 未恢复时**清空队列** | 直接还原已洗好的 trackList + originTrackList，不重洗 |
| 进度恢复 | `_playAudio` 开头清零，从不恢复 | `_pendingSeek` 机制：load 后一次性 seek，保持只加载不自动播 |
| RepeatMode.Shuffle/ShuffleOff | next/prev switch 落空返回 undefined | Shuffle 按 On 环绕、ShuffleOff 按 Off 不环绕（9a① 的决策：列表已被物理洗牌） |
| addToNextPlay 末首 | `splice(NaN,0,x)` 插到队首 | 追加到队尾（9a②） |
| playTrack 找不到歌曲 | `_trackIndex=-1`，state 永久卡 Loading | 前置检查，toast 后直接 return，不打断当前播放 |
| _fetchAudioSource 失败 | 无数据 → undefined，抛错 → null | 统一返回 null（9a③） |
| Howler 错误回调 | 只注册 onend，加载失败无兜底 | onloaderror/onplayerror → 每曲目重试一次（重取 URL 应对过期）→ 连续失败计数（成功 load 清零）→ 达 min(列表长度,10) 上限后 pause + 提示，不再无限跳歌 |
| _playTrack fetch 失败 | state 停留 Loading | 回到 Ready |
| 无音源分支 | toast + 裸 nextTrack()（On 模式整列不可播会无限循环） | 走统一 `_handlePlaybackFailure` 入口（含竞态守卫：过期回调按 trackID 忽略） |

**注意**：`_playAudioViaHowler` 里 Howl 的 `volume: 1` 是**正确**的——Howler 全局音量 × 实例音量相乘，音量经 setter 写入全局；实例若再设为用户音量会变成 v²。不要"修"它。

### 测试与基线变化

- web 测试：`4 文件 / 50 用例` → **`7 文件 / 86 用例`，全绿**。
  - 新增 `playerState.test.ts`（19）、`player.restore.test.ts`（6）、`player.failure.test.ts`（11）。
  - `player.queue.test.ts` 中 3 个"锁定错误行为"用例改为锁定目标行为，新增 1 个末首去重用例。
- `pnpm --filter web test:types`：**0 error**（保持基线）。
- lint：`player.ts` / `states/player.ts` 维持 HEAD 既存错误（10 + 2 个），本次改动**零新增**。
- 既存 lint 错误按计划不在本批处理。

### 浏览器冒烟（2026-11-27，17/17 通过）

MCP 浏览器桥不可用，改用**零依赖方案**：headless Edge + Node 内置 WebSocket 直连 CDP（脚本在 `%TEMP%/smoke-player-restore.mjs`，可复用）。两个场景：

1. **legacy（无 `__v`）数据恢复**：音量 0、进度 42、shuffle 队列与 originTrackList、repeatMode 全部恢复；不自动播放；`__v=1` 实例与持久化写回均生效。
2. **损坏 JSON 启动**：应用正常启动、默认状态、无未捕获异常。

**冒烟抓到并已修复的两个单测盲区**：

| 问题 | 修复 |
|---|---|
| 损坏的 localStorage JSON 会让模块级 `JSON.parse` 抛异常**打爆启动**（既存缺陷） | `parsePersistedPlayerState()` 包裹解析，损坏返回 `{}`；`states/player.ts` 接入 |
| 恢复加载（autoplay=false）失败后的失败推进走 `nextTrack()` 默认 autoplay=true，**启动时自动出声**；且静默加载完成后 state 卡 Loading | autoplay 意图贯穿 `nextTrack → _playTrack → _playAudio`（含 FM 分支）；load 回调中 `!autoplay && Loading → Ready` |

冒烟注意事项：种子数据必须在**同源静态页面**（favicon.svg）上写入再导航进应用——直接在应用页写 localStorage 会被 `beforeunload` 的 persist flush 覆盖。

### 9a 开放问题的最终决策

1. **Shuffle 语义**：列表已被 `shufflePlayList()` 物理洗牌，队列推进把 Shuffle 当 On（环绕）、ShuffleOff 当 Off（不环绕）。IPC Repeat 通道设 Shuffle 后按下一首不再坏。
2. **末首"下一首播放"**：追加队尾。
3. **falsy 不一致**：统一 null。

### 下一步候选（阶段 1 剩余 P0）

- 移动队列打开入口（`PlayerMobile.tsx:78` 渲染条件写反）
- 曲目激活规则统一（仅 `TrackList.tsx` 有移动端单击分支，其余 8 处硬编码双击）
- 账号切换 / 登出的 React Query 缓存清理（`useUser.ts` logout 只 refetch 账号 query）
- 301 未登录的 logout 接线（`request.ts:37` 被注释）
- 无效设置清理（`unlock`、`keyboardShortcuts.localEnabled`）

## 11. 阶段 1 第二批落地记录（2026-11-27）

路线文档阶段 1 剩余 P0：移动队列入口、曲目激活规则统一、会话清理、301 接线、无效设置清理。

### 交付内容

**移动队列断链修复**：`PlayerMobile.tsx` 把手渲染条件写反（只在队列已打开时渲染、点击仍是设为 true），改为 `!mobileShowPlayingNext` 时渲染 + 点击打开；`PlayingNextMobile` 加 `data-testid` 供验证。

**曲目激活规则统一**（新增 `web/utils/trackActivation.ts`）：

- 规则（产品决策）：触屏/移动布局单击播放；桌面双击播放；键盘 Enter 播放；右键统一菜单
- 应用到全部 8 处曲目行：`TrackList`、`TrackListVirtual`、`Track`（My 三页共用行）、`PlayingNext`（含移动抽屉）、`Daily`、`Recent`、`Cloud`、`ArtistSongs`、`Popular`、`Search`
- 行元素补 `tabIndex` + `onKeyDown` + `focus-visible` 底色；`PlayingNext` 右键补上了缺失的 `preventDefault`
- 断点 768 收敛为单一真源：`common.ts` 的 `MOBILE_BREAKPOINT` / `isMobileViewport()`，`useIsMobile` 与激活规则共用

**会话清理**（新增 `web/utils/session.ts`）：

- `teardownLocalSession()`：清 Cookie + 结算感知地清空 React Query 缓存 + 桌面端账号，3s 节流防并发 301 风暴
- `useUser.logout` 改走该模块（原来只 refetch 账号 query，用户数据缓存全残留）
- `request.ts` 的 301 拦截器接线（原 logout 被注释）：**异步延迟**执行，避免在查询自己的 rejection 链里清理自己

**无效设置清理**：删除 `settings.unlock`（含 i18n 两个 key）与 `keyboardShortcuts.localEnabled`（interface.d.ts + defaultSettings）——两者均零消费方。

### 冒烟抓到并已修复的实现陷阱（重要，勿回退）

**React Query 缓存清理不能 cancel 进行中的查询**：`queryClient.clear()` / `cancelQueries()` 会让 in-flight 查询的 retryer promise 以 `CancelledError` 拒绝，且无人接管（读了 query-core 源码确认：`Query.cancel` 只给 `this.promise` 挂 catch，destroy 路径的 rejection 仍可能逃逸）→ 未处理的 rejection 刷屏。正确做法是 session.ts 里的**结算感知移除**：已结算的直接 `cache.remove()`，进行中的订阅 cache 事件等结算后移除。同理，301 拦截器里必须 `setTimeout` 延迟清理，否则会在查询自己的 rejection 链里清理自己。

### 测试与验证

- 单测：`7 文件 / 86 用例` → **`10 文件 / 96 用例` 全绿**（trackActivation 7、session 3）
- CDP 冒烟（复用 `%TEMP%/smoke-player-restore.mjs`）：**20/20**，新增场景 3——移动视口（390px）下队列把手渲染、初始关闭、点击打开
- `test:types` 0 error；lint 全部改动文件**零新增**（request.ts 3→2、useIsMobile 1→0 反而改善）
- 注意：冒烟期间发现 `pnpm dev` 重启后需重新等 42710 起来再跑脚本

## 12. 阶段 1 第三批落地记录（2026-11-27）—— 阶段 1 完成

统一异步状态（加载 / 空 / 错误重试 / 未登录），阶段 1 最后一项。

### 交付内容

**新增 `web/components/AsyncState.tsx`**：`AsyncLoading` / `AsyncEmpty` / `AsyncError`（沉淀自 Search 页 SectionError 模式）/ `PleaseLogin`（按钮打开全局登录弹窗），均带 `data-testid`。i18n `common` 节新增 `loading/empty/error/retry/please-login-hint`，按钮复用 `auth.login`。

**接线**：

| 位置 | 原状 | 现状 |
|---|---|---|
| `My.tsx` | 未登录分支被注释，`PleaseLogin` 是空组件 | `useIsLoggedIn()` 为 false 时渲染真实登录引导；加载中仍渲染内容骨架（该 hook pending 时返回 true），避免登录用户看到引导闪烁 |
| `Discover.tsx` | 无加载/空/错误态，失败时静默空墙 | isPending → AsyncLoading；isError → AsyncError+重试；空数组 → AsyncEmpty |
| `TrackListHeader/Info.tsx` | 加载时**可见**的 "PLACEHOLDER" 文本 | 骨架条（animate-pulse + text-transparent，对齐 ArtistInfo 既有模式） |
| `TrackList.tsx` 占位行 | 可见 "PLACEHOLDER1234567" | 骨架条 |
| `Search.tsx` SectionError | 本地实现 | 改用共享 AsyncError（去重） |
| `Login.tsx` | — | 弹窗加 `data-testid='login-modal'` |

Artist 头部的占位原本就是隐形骨架（text-transparent），未动；VideoPlayer 的占位同理未动。

### 验证

- 单测 10 文件 / 96 用例全绿；`test:types` 0 error
- CDP 冒烟 **24/24**：新增场景 4——未登录 My 页显示登录引导 + 登录弹窗自动打开（既有行为保持）；Discover 到达定义态（实测加载出 97 张封面）；全页无可见 PLACEHOLDER 文本
- lint：改动文件零新增（My.tsx 3→0）
- 冒烟脚本经验：hash 路由导航不触发 `Page.loadEventFired`，用导航 + 定时等待

### 阶段 1 完成度对照（路线文档验收标准）

- ✅ 重启恢复队列/曲目/进度/音量/随机状态（§10，冒烟 S1）
- ✅ 音源失败有定义明确的反馈与回退，不无声卡死、不无限跳歌（§10，失败生命周期）
- ✅ 各页面同一曲目操作符合统一交互契约（§11，移动单击/桌面双击/键盘 Enter）
- ✅ 移动队列可打开、操作、关闭（§11，冒烟 S3）
- ✅ 账号切换不泄漏上一账号 UI 数据（§11，结算感知缓存清理）
- ✅ 统一未登录/加载/空/错误状态（本节，冒烟 S4）
