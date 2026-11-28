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

## 13. 阶段 2 第一批落地记录（2026-11-27）—— 音频缓存契约收敛

路线文档阶段 2 前置批次（用户决策：缓存契约优先、桌面优先）。为批次 2（音质选择 UI）铺路。

### 交付内容

**Audio 表 schema 升级（两端 db.ts + init.sql）**：新增 `level` 列、主键改为 `(id, level)`。不走 `migrate()` 机制（其版本语义从未被实测），改在 `initTables()` 内做 table_info 特性检测 + 事务内重建表；legacy 行补 `level='exhigh'`（与历史请求一致）。判定与 SQL 抽为纯函数 `utils/audioSchema.ts`（desktop 有单测）。

**DB.update() 实装（desktop 原为空实现）**：参数化 SET、过滤 undefined；命中缓存时 `queriedAt` 更新从此生效（LRU 地基）。新增 `findAudio(id, level)` 精确查询与 `findBestAudio(id)` 降级查询。**注意**：`upsert/upsertMany` 改为显式列名——原位置 VALUES 在复合主键新列序下会把数据写错列。

**缓存查找与 DTO（两端路由）**：按 `(id, level)` 精确命中，未命中降级到该曲目最高码率缓存；命中 DTO 的 `level` 用真实存储值（原硬编码 `'standard'`）。桌面失败回退 `send(undefined)`（空响应体）对齐为服务端的 `?? {code:500,...}` 兜底。

**真实 Range 流式（两端 cache.ts）**：`parseRangeHeader` 纯函数（desktop 10 个单测）+ `fs.createReadStream`；200 全量 / 206 分段（正确 Content-Range/Content-Length）/ 416。替换原"整文件 readFileSync + 假 206"。`resolveCacheAudioPath` 安全红线保持在校验链最前。

**流式落盘（两端 setAudio）**：multipart 流 → 临时文件 → `parseFile` → 重命名 → 写库（含 level），不再 `toBuffer()` 整文件驻留内存；元数据解析失败按 unknown 容错（两端对齐）；**bitrate 四舍五入取整**——原浮点码率会生成 `{id}-320000.04.mp3` 这类文件名，读取时过不了白名单正则（潜在 bug 修复）。

**Unblock 缓存读修复（两端）**：调用方改传 `{id}`（原传 number 永不命中）；命中 DTO 改为 `{code, data:[{url}]}`（原返回 `album` 字段的错形状）。此前该表只写不读、持续累积死数据。

**IPC 与缓存管理**：`GetAudioCacheSize` 从 `on`+异步 `returnValue`（sendSync 拿不到值）改为 `handle` 返回 string；新增 `ClearAudioCache`（删 audio_cache 全部文件 + 清 Audio 表）；`ClearAPICache` 不再 truncate Audio（消除孤儿文件来源）；IpcChannels 三处同步。设置页 General 新增「缓存」区块（仅 Electron 渲染）：音频缓存占用显示 + 清除、API 缓存清除。

**level 写入链**：`player._cacheAudio` 从音源响应取实际 level → `r3play.cacheAudio` 加参数 → POST query → 入库。

### 验证

- desktop vitest：4 文件 / 22 用例全绿（+audioRange 10、audioSchema 3）；web 96 用例不回归
- 类型：web 0 error；desktop 维持 34 基线（新增的两个 findAudio/findBestAudio 已补 as 断言回落）；server `tsc --noEmit` 0 error
- lint：全部改动文件零新增，其中 4 个文件因删死代码反而减少
- **curl 端到端（桌面 dev，vite 代理 → appServer）**：POST 流式缓存写入 200；`level=exhigh` 命中且如实上报；`level=standard` 降级命中 exhigh 并如实上报；Range 0-1023 → 206/1024 字节/Content-Range 正确；无 Range → 200 全量；后缀 -100 → 206/100 字节；越界 → 416 `bytes */8192`；全量与分段内容均与源字节一致；命中后 DB `queriedAt` 实际更新；dev DB 的 schema 升级在 Electron 重启时自动完成
- CDP 冒烟 24/24 回归通过

### 注意事项

- dev 环境 vite 代理路径是 `/r3playx/`（appName 小写），桌面 appServer 在 dev 下由 30001 承载——curl 验证时别打成 `/r3play/`
- 双实现新漂移点已消除：桌面回退兜底、元数据容错；仍为平台差异的：源列表 / cookie 来源 / YouTube 链（见 §12 前的对照表，桌面优先决策下保留）
- server 端无测试基建，audioRange/audioSchema 为 desktop 测试覆盖的同构副本，改动需两端同步

## 14. 阶段 2 第二批落地记录（2026-11-27）—— 音质选择与真实音质展示

### 交付内容

**音质设置**：`settings.audioQuality`（默认 `exhigh` 保持既有行为），Settings → Player 新增选择器（标准 128K / 极高 320K / 无损 / Hi-Res；不含上游不认识的 `higher`）。切换时调 `player.reloadAudioSource()` **立即生效**：重新按新档位取流，经 pendingSeek 机制恢复进度，保持播放/暂停状态。

**level 全链路**：`player._fetchAudioSource` 按 `settings.audioQuality` 请求（React Query 的 queryKey 含 params 整体，切档位不会命中旧响应缓存）；`_cacheAudio` 的二次取流带相同档位，保证入库的 br/level 是该文件的真实值（批 1 的 `(id, level)` 缓存键从此真正分档）。

**真实音质展示**：`_fetchAudioSource` 返回新增 `quality: { level, br, source }`（上游按权益自动降级后的真实档位；缓存命中时为缓存档位；替代源无 level）；成功取流后落到 `player.audioQuality`，切歌时清空。桌面播放器曲目卡（NowPlaying/Info）新增音质徽标：`320K · 320kbps` 样式，无 level 时显示"替代音源"。

**权益回退策略**：依赖上游天然行为（请求无损但无权益时返回实际可用档位），产品侧如实展示实际档位而非请求档位——这正是徽标的价值。网络状况自动降级不做（过度工程）。

### 验证

- 单测 **11 文件 / 102 用例**全绿：新增 `player.quality.test.ts` 6 用例（档位传递、权益降级如实记录、切歌清空、播放中重载保持进度与状态、暂停中重载不自动播、无曲目不做事）；`_fetchAudioSource` 既有断言补 quality 字段
- `test:types` 0 error；lint 零新增
- CDP 冒烟 **27/27**：新增场景 5——设置页选择器渲染、默认 exhigh、切换 lossless 持久化到 localStorage（分类名随语言变化，选择器需兼容 zh/en）
- 三个 player 测试文件补 settings mock（player.ts 新增 settings 依赖）

### 注意

- 缓存命中响应的 `source` 字段（netease/youtube/unknown）目前只进 player.audioQuality，徽标暂不展示来源——留待后续按需展示
- 移动端播放器无音质徽标（空间受限，桌面优先）

## 15. 阶段 2 第三批落地记录（2026-11-27）—— 显式下载管理（阶段 2 完成）

### 交付内容

**真实格式文件名**：`download.ts` 重写——扩展名取音源响应的 `type`（真实编码），缺失时从 URL 推断，兜底 mp3；不再一律 `.mp3`。请求带 `settings.audioQuality` 档位。

**任务管理（`states/downloads.ts`，valtio）**：任务以 trackID 为键（同曲目去重），状态机 downloading/completed/failed/cancelled，进度 loaded/total，完成后记录 savedPath。纯函数动作（upsert/progress/status/clear）有 7 个单测。

**桌面端（主进程流式下载）**：新增 `main/downloader.ts`——Electron `net.request` 流式写盘到 `userData/downloads`，PassThrough 计数 + 200ms 节流推送 `AudioDownloadProgress` IPC；取消经 `CancelAudioDownload` → abort + 清理部分文件；完成可 `ShowItemInFolder` 定位 / `OpenDownloadsFolder` 打开目录。文件名经 `sanitizeDownloadFilename`（控制字符/保留字符/结尾点/长度）+ `resolveDownloadPath`（目录逃逸兜底）双重校验，9 个单测。**红线同款模式：校验先于任何 fs 写操作。**

**Web 端**：fetch reader 流式读取（进度可见）→ blob → 浏览器接管保存；AbortController 取消；跨域失败退化为裸链（标记完成）。进度经 `ipcRenderer.ts` 的 AudioDownloadProgress 监听进 store（桌面）。

**UI**：顶栏新增下载按钮（进行中任务数角标）+ 任务面板（进度条 / 取消 / 重试 / 打开所在文件夹[桌面] / 打开下载目录[桌面] / 清空已完成）。i18n 新增 `downloads` 节。

### 验证

- 单测：web **12 文件 / 109 用例**（+downloads 7）、desktop **6 文件 / 40 用例**（+downloadFilename 9）全绿
- 类型：web 0 error；desktop 34 基线（Electron IncomingMessage 类型不完整需 as Readable，已注）；lint 零新增
- CDP 冒烟 **29/29**：新增场景 6——桌面视口下顶栏下载按钮渲染、面板展开空态
- 冒烟经验（两条，后续写脚本注意）：
  1. **headless Edge 默认窗口宽 750px ≤ 768 断点 → 落入移动布局**，桌面顶栏类断言必须先 `setDeviceMetricsOverride`
  2. **应用布局在文档加载时定型**（useIsMobile 非响应式），改视口后 hash 导航不会重挂载——需带 query 强制整页重载

### 阶段 2 完成度对照

- ✅ 音质：选择器 + 实际音质展示 + 权益降级如实上报（§14）
- ✅ 自动缓存：缓存键含音质、真实 Range、queriedAt/LRU 地基、容量可见与清理入口（§13）
- ✅ 显式下载：任务列表、进度、取消、重试、真实格式、存储位置与文件定位（本节）
- ⏭ 桌面离线播放：缓存 + 下载均已落盘，离线识别与展示留待后续批次（路线图中本就是"以上稳定后"）

## 16. 阶段 3 第一批落地记录（2026-11-27）—— 响应式壳层

### 交付内容

**布局断点 768 → 1023（对齐 Tailwind lg）**：`MOBILE_BREAKPOINT` 提升。此前 769–1023px 落入"桌面壳层但没有播放器"的死区（侧栏/右栏播放器都定义在 lg 以上）——该宽度现在使用移动布局，播放器恒可达。布局选择与触屏交互规则共用此真源（`useIsMobile` / `isMobileViewport`）。

**useIsMobile 响应式化**：非响应式的 `window.innerWidth` 读取改为 react-use `useMedia`（matchMedia change 订阅）——窗口缩放跨断点即时切换布局，不再脱节。注意：react-use 17.6 **没有 `useMediaQuery`**，用 `useMedia(query, defaultState)`。

**移动视口高度**：4 处虚拟列表 `calc(100vh - …)` → `100dvh`（CoverRowVirtual / TrackListVirtual / Search / Browse），跟随移动浏览器动态工具栏。

### 验证

- 单测 109 全绿；`test:types` 0 error；lint 零新增
- CDP 冒烟 **32/32**：新增场景 7——900px（旧死区）为移动布局且播放器可达；**不重载**缩放到 1280 即时切桌面布局；缩回 900 切回移动布局
- 排障记录：S7 首次失败是 vite 按需重编译竞态（改完源码立刻跑冒烟，首个导航吃到编译中的模块），复跑即绿；独立复现证明 matchMedia change 在 CDP 视口覆盖下正常触发

### 已知边界（后续批次）

- 跨断点切换会重挂载 Layout（页面局部 state/滚动位置重置）——低频操作，可接受
- 769–1023 的移动布局在大屏上偏稀疏（内容拉伸）——第三批组件收敛时处理容器宽度
- 移动布局底栏高度与 `-132px` 的减法近似抵消，未做精确的布局变量（第三批）

## 17. 阶段 3 第二批落地记录（2026-11-27）—— 移动端导航完整性

### 交付内容

**移动顶栏全页面化**：此前 `TopbarMobile` 只在 `/` 渲染——Discover/Browse/Search/Settings/详情页都没有搜索、设置和用户入口。现在除 `/lyrics`（沉浸页）外全页面渲染；二级页面（非 `/` `/discover` `/browse` `/lyrics`）顶栏左侧显示返回按钮（`navigate(-1)`）。

**主题三态（Light / Dark / System）**：
- `resolveTheme()`：设置值（含 `system`）→ 实际主题；`theme.ts` 模块级订阅 `prefers-color-scheme` change，跟随系统时即时切换（直接读 localStorage，避免在 store 初始化前引入依赖）
- Settings → Appearance 新增「外观模式」Select（深色/浅色/跟随系统）——移动端唯一的主题切换入口（顶栏太阳按钮是桌面专属）
- 桌面顶栏切换按钮改为按解析后的实际主题取反（system 状态下行为可预期）
- IPC `SyncTheme` 统一经 `resolveTheme` 应用

### 验证

- 单测 109 全绿；`test:types` 0 error；lint 零新增（TopbarMobile 2→0、Appearance 7→6）
- CDP 冒烟 **39/39**：新增场景 8——Discover 页有顶栏（此前仅首页）、一级页无返回按钮、设置页有返回且点击回到上一页、主题切"跟随系统"持久化且 body class 已解析为具体主题

## 18. 阶段 3 第三批落地记录（2026-11-27）—— 令牌收敛与安全的组件归并

### 交付内容

**令牌修复**：
- `accentColor.css` 两处 `var-(-brand-color-*)` 笔误 → `var(--brand-color-*)`（`bg-brand-50/100` 此前完全失效）
- 默认强调色一致：`theme.ts` 无存储时的 fallback 从 `lime` 改为 `yellow`，与 `states/settings.ts` 默认值对齐（此前首次启动实际显示 lime、设置页却选中 yellow）
- 死类清理：`bg-background`（Browse，从未生效，移除保持现状视觉）、`btn-hover-animation`（Search，hover 背景本就由 `after:` 类承担）
- `PlayingNext` 序号 `text-accent-color`（无定义）→ `text-accent-color-500`，还原"序号用强调色"的原始意图（轻微视觉变化，符合强调色=状态语言的设计 DNA）

**组件归并（安全范围）**：`TrackListVirtual` 删除约 100 行内部行组件复制（189→74 行），改用共享 `Track.tsx`（统一 props：`playingTrackID` 替代 `isPlaying`）。共享行顺带获得两个小改进：封面 `loading=lazy decoding=async`、艺人 Fragment 的稳定 key（原 `Math.random()` key 每次渲染强制重挂载）。

### 明确不做（决策记录）

- **MediaGrid / CoverWall / CoverRowVirtual / MediaDetailHeader 大归并**：这些组件带性能调优历史（ImageManager 预载、虚拟化参数、容器查询），当前无新需求驱动，回归风险大于收益。触发条件：新增内容区块需求出现时，以共享 `MediaCard` 为目标顺手收敛
- **gray 色阶"全同值"**：global.css 注释明确是 Tailwind v4 迁移时的刻意选择（整个命名空间替换为近黑），非 bug，不动
- **brand / accent-color 双轨合并**：涉及全局类名替换，留待有视觉回归手段（截图对比）时做

### 验证

- 单测 109 全绿；`test:types` 0 error；lint 零新增（TrackListVirtual 1→0）
- CDP 冒烟 **39/39** 回归通过

## 19. 阶段 3 第四批落地记录（2026-11-27）—— 可访问性（阶段 3 完成）

### 交付内容

**恢复用户缩放**：`index.html` viewport 移除 `user-scalable=no / maximum-scale=1`。

**减少动效（prefers-reduced-motion）**：
- App 根部 `MotionConfig reducedMotion="user"`——framer-motion 的位移/缩放动画全局降级为透明度过渡
- `global.css` 媒体查询压制 CSS 动画/过渡时长与平滑滚动
- `BreathingBackground` 在减少动效下不订阅音量驱动（`--vol` 恒 0，停留在静态安静层）

**控件语义与键盘**：
- `Slider`：`role="slider"` + `tabIndex` + `aria-value*`/`aria-orientation`/`aria-label` + 方向键/Home/End（纯函数 `nextSliderValue` 抽出并配 4 个单测，步长默认量程 1/20）
- 设置 `Switch`：div → `motion.button role="switch" aria-checked`
- `Tabs`：`tablist/tab` + `aria-selected` + roving tabindex + 左右方向键移动
- `SearchModal`：`role="dialog" aria-modal` + 关闭时焦点还原到打开前的元素

**焦点环**：`global.css` 新增全局 `:focus-visible` 强调色环（保留 `outline-hidden` 使鼠标点击不出环）。

### 验证

- 单测 **12 文件 / 113 用例**全绿（+sliderKeyboard 4）；`test:types` 0 error；lint 零新增
- CDP 冒烟 **43/43**：新增场景 9——viewport 无 user-scalable=no、播放器 slider 带 role 与 aria-valuenow、Switch 点击翻转 aria-checked、搜索弹窗 role=dialog 且 Escape 可关

### 冒烟基建的重要排障记录（后续写长套件必读）

套件拉长后出现"隔离复现全过、套件内假失败"，逐层定位到三个渲染器退化源：
1. **headless 窗口被视为遮挡 → 渲染器后台化**（rAF/定时器节流，framer-motion 退出动画永不完成）→ 启动参数加 `--disable-backgrounding-occluded-windows --disable-renderer-backgrounding --disable-background-timer-throttling`
2. **长生命周期渲染器的 matchMedia change 事件投递退化**（matches 值正确但事件不派发）→ 套件中段重启浏览器（脚本已内置 S6 前重连）
3. **hash 导航的文档上下文里合成 keydown 投递退化** → 键盘类断言用独立整页加载的文档

 Escape/焦点类功能本身经 4 种隔离路径验证正常，非应用 bug。

## 20. 阶段 4 第一批落地记录（2026-11-27）—— 搜索升级

### 交付内容

**搜索建议接入**（`useSearchSuggestions` 此前已实现但零消费）：SearchModal 输入防抖 300ms 后请求建议，按上游 order 分组扁平化（歌曲 3 / 艺人 2 / 专辑 2 / 歌单 2，上限 8 条）；单曲建议点击**直接播放**，艺人/专辑/歌单进对应详情页；键盘 ↑↓ 在建议间移动（含"无选中"态的完整循环）、Enter 激活选中项或跳转完整搜索；清空输入立即清建议（不等防抖）。

**搜索历史**（`utils/searchHistory.ts` + 6 单测）：localStorage 存最近 10 条、去重置顶、损坏数据降级为空；空查询时显示在历史区（热词上方）带清空按钮，点击词条直接搜索；提交时记录。

**按 Tab 懒加载**：`useSearchBestMatch` / `useSearchResults` / `useSearchTracksInfinite` 增加 `enabled` 参数；Search 页 All 页发全部查询（各组预览需要），分类页只发本类——消除进页 5 并发，切 Tab 复用 React Query 缓存。

### 验证

- 单测 **13 文件 / 119 用例**全绿（+searchHistory 6）；`test:types` 0 error；lint 零新增（Search.tsx 5→0）
- CDP 冒烟 **46/46 连续两轮**：新增场景 10——真实 suggest API 返回 8 条建议、Enter 跳搜索页、历史区含刚提交词条（注意 Spotlight 行为保留上次查询，断言历史前需清空输入）

### 冒烟基建排障（§19 的补充，四条新经验）

1. **固定 sleep 断言在高负载下必 flaky**：布局切换/弹窗退出是整树重挂载，机器繁忙时远超 1s——所有"异步达到某状态"的断言必须用条件轮询（脚本内置 `waitFor`）
2. **headless 下 document 可能无焦点**：自动聚焦失效导致可信键盘事件无接收者——键盘断言前 `Page.bringToFront` + 显式 `focus()`
3. **JS 合成 keydown 对 React 根监听器投递不可靠**：键盘事件用 CDP `Input.dispatchKeyEvent`（可信管道）；鼠标交互用 DOM `.click()` 依然可靠
4. 重连时关闭全部旧 page target（遗留页面的 vite HMR 客户端持续耗渲染预算）

## 21. 阶段 4 第二批落地记录（2026-11-27）—— Discover 可控化

### 交付内容

**方向筛选**：精选（原有人工歌单池，行为不变）+ 华语/欧美/日语/韩语/粤语/纯音乐六个方向——经 `/top/playlist?cat=` 动态取真实热门歌单，**不硬编码可能失效的歌单 ID**（精选池之外的分类零硬编码）。

**换一批**：nonce 递增触发重新抽样；nonce>0 跳过 localStorage 缓存直取新数据；fetching 中按钮禁用 + 图标旋转。

**播放全部**：抽样管线保留曲目 ID（`DiscoverData.trackIDs`，顺序即随机顺序），一键 `playAList` 整组播放。

**缓存兼容**：仅默认方向首次加载走旧的 2 小时 localStorage 节奏；旧裸数组缓存格式经 `normalizeCached` 兼容；方向/换一批的数据不落 localStorage（React Query staleTime 内存缓存）。

### 验证

- 单测 119 全绿；`test:types` 0 error；lint 零新增
- CDP 冒烟 **49/49**：新增场景 11——页头渲染（7 方向 + 换一批 + 播放）、切"华语"经真实 top/playlist 到达定义态、换一批后仍定义态

## 22. 阶段 4 第三批落地记录（2026-11-27）—— 歌单管理

### 交付内容

**API 与 mutations**：`createPlaylist` / `deletePlaylist` / `updatePlaylistName` 封装（上游 `/playlist/create|delete|name/update`，代理自动注册无需服务端改动）；三个 mutation 成功后失效用户歌单查询（重命名同时失效歌单详情），toast 反馈。

**对话框原语**（`components/Dialogs.tsx`）：`InputDialog`（新建/重命名共用：自动聚焦全选、Enter 提交、空值禁提交、Escape/背板关闭）与 `ConfirmDialog`（破坏性操作红色确认）——`role="dialog" aria-modal`，供后续批次复用。

**UI**：
- Collections → Playlists → "Created BY ME" 区新增「新建歌单」按钮
- 歌单详情页：`TrackListHeader` 新增 `extraActions` 扩展位（Like 按钮后），仅创建者渲染「重命名 / 删除」；删除确认后返回首页
- 所有权判定复用既有逻辑（`account.id === creator.userId`，与隐藏 Like 按钮同一条件）

### 验证

- 单测 119 全绿；`test:types` 0 error；lint 零新增（Collections 10→8）
- CDP 冒烟 **50/50**：新增场景 12——未登录查看公共歌单页正常渲染且无管理按钮（权限门）
- **未覆盖**：新建/重命名/删除的真实链路需要登录账号，留待人工验证（对话框与 mutation 均为薄封装，风险低）

## 23. 阶段 4 第四批落地记录（2026-11-28）—— 继续收听（阶段 4 完成）

### 交付内容

**继续收听卡片**（`pages/My/ContinueListening.tsx`）：消费阶段 1 的持久化恢复成果（trackListSource + 曲目 + 进度）——卡片显示来源（歌单/专辑/艺人）名称与封面（`useSourceInfo` 按类型分发到对应的缓存查询）、当前曲目行、续播/暂停按钮；点击卡片回来源页。**放在登录门槛之外**：反映本地播放器状态，未登录恢复了队列同样可见可用。

**顺带修复的真实缺陷**：`_playTrack` 的 `await _fetchTrack` 无 try/catch，而它常被 fire-and-forget 调用——上游 500 时产生全局未处理 rejection（冒烟的"无未捕获异常"检查在冷启动时抓到）。现在抛错与返回空同样处理（toast + state Ready）。

### 验证

- 单测 119 全绿；`test:types` 0 error；lint 零新增
- CDP 冒烟 **52/52**（冷启动预热后稳定）：新增场景 13——带 trackListSource 的种子恢复后卡片渲染、公共歌单来源名加载（无需登录）、点击卡片回到来源歌单页
- 冒烟经验补充：**dev 冷启动后首跑必预热**（vite 按需编译 + netease API 冷启动 500 会污染首轮结果）

### 阶段 4 完成度对照

- ✅ 搜索：建议、历史、按 Tab 懒加载（§20）
- ✅ Discover：方向筛选、换一批、整组播放（§21）
- ✅ 歌单管理：新建 / 重命名 / 删除（§22，真实链路待登录人工验证）
- ✅ 继续收听：恢复上下文（阶段 1）+ 可见入口与回来源页（本节）
- ⏭ 本地文件库：按路线图约定"真实需求验证后再评估"

## 24. 阶段 5 第一批落地记录（2026-11-28）—— 桌面歌词能力对齐

### 交付内容

**桌面歌词窗复用主歌词页能力**（`LyricsDesktop.tsx`）：
- **YRC 逐词 karaoke**：有逐字歌词时以 YRC 行为行跟踪与渲染基准（与主歌词页同源逻辑）；仅活跃行挂载 word spans，RAF 循环直改 `--p` CSS 变量（零 React 逐帧渲染），复用全局 `.lyric-word` / `.lyrics-row--active` 门控样式
- **罗马音**：`romalrc` 作为主歌词与翻译之间的次级行（两种模式下都显示）
- 行组件新增 `lyrics-row--active` 门控类（karaoke 渐变的作用域开关）
- 保留既有性能设计：memo 行、二分查找、RAF 行跟踪（歌词窗进度经 IPC SyncProgress 驱动）

**共享组件抽取**：`YrcWordSpan` 从 Lyrics.tsx 抽为 `components/Lyrics/YrcWordSpan.tsx`，主歌词页与桌面歌词窗共用（纯展示组件，零行为变化）。

### 验证

- 单测 119 全绿；`test:types` 0 error；lint 零新增
- CDP 冒烟 **54/54**：新增场景 14——`#/desktoplyrics` 真实歌词 API 渲染 35 行、活跃行唯一且带 karaoke 门控类
- 逐词填充的实际观感（YRC 曲目 + 播放中）留待桌面端人工确认——headless 无法驱动真实音频进度
