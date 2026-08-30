---
title: Command Code GOAT Provider for DeepSeek Harness
date: 2026-08-30
tags:
  - deepseek-harness
  - command-code
  - goat
  - llm-provider
summary: Command Code GOATの公式Provider APIをDeepSeek HarnessのWeb profileから利用する外部provider bundleの設計
---

# Command Code GOAT Provider for DeepSeek Harness

## 1. 目的

`commandcode-goat-dsh-provider`は、Command Code GOATの契約をDeepSeek Harness（DSH）のWeb profileから利用する個人用の外部provider bundleである。DSH本体の`packages/`を変更せず、DSHが定義する`LlmAdapter`と設定・認証・モデル探索の拡張点だけを使用する。

プロジェクトの実体は`/home/pi/projects/commandcode-goat-dsh-provider`に置く。既存の`/home/pi/projects/commandcode-goat-provider`は別目的のVS Code Copilot Chat用プロジェクトとして変更しない。

実装は既存の第三者DSHプラグインをコピーせず、Command Codeの公式Provider APIとDSHの公開されたprovider契約を基準に独立して作成する。

## 2. 利用者と対象範囲

対象は、homepiで稼働するDSH Web profileを主に利用する一人の利用者である。provider本体はホスト側のDSHプラグインとして実装し、Web設定画面だけをclient pluginとして提供する。

GOAT契約はリクエスト本文で指定しない。Command Code APIキーに紐づく契約状態をCommand Code側が判定する。GoプランなどAPIアクセス権のない契約では、APIが返す`403 upgrade_required`を利用者向けエラーに変換する。

### 2.1 実装する機能

- `GET /provider/v1/models`によるモデル一覧の動的取得
- API一覧と静的能力表の統合
- OpenAI Chat Completions形式のストリーミング
- Anthropic Messages形式のストリーミング
- テキスト、reasoning、ネイティブツール呼び出し、ツール結果
- 能力表で対応を確認したモデルの画像入力
- キャンセル、リクエストタイムアウト、ストリームアイドルタイムアウト
- DSHのprovider retry policyに接続した再試行
- DSH credential storeと`COMMANDCODE_API_KEY`環境変数参照
- WebのSettings → Plugins → Configurableに表示する設定カード
- 公式Provider APIの`x-cmd-zdr: 1`オプション

### 2.2 実装しない機能

- Command Codeの非公開使用量・残量endpoint
- Command Code CLIのブラウザログインフロー
- 複数アカウント保存・自動ローテーション
- APIキーの独自ファイル読み込み
- ローカルプロキシや常駐中継サーバー
- DSH本体の変更
- Command Code APIの契約外モデルへのアクセスを回避する仕組み

使用量のトークン値は各応答のusageイベントから通常のLLMメタデータとして取り込むが、GOAT契約の残量や5時間・7日・月間枠を推定する機能は持たない。

## 3. 外部APIの前提

公式仕様を実行時の基準とする。

- Provider API: [Command Code Provider API](https://commandcode.ai/docs/provider)
- GOAT契約: [GOAT Plan](https://commandcode.ai/docs/plans/goat)
- モデル一覧: [Available Models](https://commandcode.ai/docs/reference/cli/models)

既定のAPIベースは`https://api.commandcode.ai`とする。エンドポイントは次の通りである。

| 用途 | HTTP | URL | 認証 |
| --- | --- | --- | --- |
| モデル一覧 | GET | `/provider/v1/models` | 可能な限りBearerキーを付ける |
| OpenAI形式 | POST | `/provider/v1/chat/completions` | `Authorization: Bearer <key>` |
| Anthropic形式 | POST | `/provider/v1/messages` | `Authorization: Bearer <key>` |

通常モデルはOpenAI Chat Completions形式、Claude系モデルはAnthropic Messages形式を使う。両方のチャット要求は`stream: true`で送信する。OpenAI形式では`stream_options.include_usage: true`を付け、Anthropic形式では応答のusageフィールドを読む。

ZDRを有効にした場合だけ、モデル一覧を除くProvider APIリクエストへ`x-cmd-zdr: 1`を付ける。ZDR非対応のモデルに対する`422 cmd_zdr_no_providers`は、ZDRを無効化するかモデルを変更するよう案内する。

APIのエラー本文は標準エラー形式とCommand Code固有の`{ success: false, error: ... }`形式の両方を受け入れる。利用者向け本文からAPIキー、Authorization値、リクエスト本文の秘密部分を除去する。

## 4. DSHへの統合方式

パッケージ名は`dsh-commandcode-goat-provider`、provider routeは`commandcode-goat`、設定namespaceは`llm-commandcode-goat`とする。

ホスト側のエントリは、DSHのfunction plugin規約に従って`name`、`inject`、`Config`、`apply`をnamed exportする。default exportは持たない。`apply`は`ctx.llm.registerAdapter(['commandcode-goat'], adapter)`を使い、`ctx.llm.registerConfigurableProviders`と`ctx.llm.registerModelDiscovery`を登録する。

設定変更は次のリクエストへ反映する。設定セクションの生値からリクエスト用の接続情報を明示的に解決し、登録時に必要なretry policyだけを捕捉する。リクエスト中の接続情報は開始時点の一貫したスナップショットを使う。

### 4.1 Bundleとclient plugin

`cordis.patch.yml`はホスト側のprovider行を一つ挿入する。

```yaml
- insert:
    - id: llm-commandcode-goat
      name: dsh-commandcode-goat-provider
      config:
        apiKeyEnv: COMMANDCODE_API_KEY
```

package manifestは`dsh.bundle`と`dsh.client`の両方を宣言し、`./client` exportを提供する。DSHのclient-modulesがホスト行からclient bundleを検出するため、client用の重複Loader行は挿入しない。

Models画面にはproviderのモデル一覧を広告するが、未知の設定namespaceはDSH標準の編集フォームが無効になる。このためAPIキー入力とprovider固有設定は`settings.plugin.item`へ登録するWebカードが所有し、Settings → Plugins → Configurableから編集する。

## 5. 設定と認証

設定の既定値は次の通りとする。

| 設定 | 型 | 既定値 | 用途 |
| --- | --- | --- | --- |
| `apiKeyEnv` | credential reference | `COMMANDCODE_API_KEY` | credential storeまたは信頼された環境層で解決するキー参照 |
| `baseURL` | URL | `https://api.commandcode.ai` | Provider APIのベースURL |
| `defaultContextWindow` | 正の整数 | `262144` | API一覧に容量がないモデルの既定値 |
| `maxTokens` | 正の整数 | `65536` | 明示されない要求の出力上限 |
| `requestTimeoutMs` | 正の整数 | `60000` | 最初の応答までの上限 |
| `streamIdleTimeoutMs` | 正の整数 | 300000 | ストリームの読み取り停止上限 |
| `enableZdr` | boolean | `false` | `x-cmd-zdr: 1`の送信 |
| `protocolOverrides` | model/protocol配列 | 空 | API一覧だけで形式が判別できないモデルの明示指定 |

APIキーは設定namespaceに平文で保存しない。Webカードのwrite-only入力はDSHのcredentials APIを使い、`apiKeyEnv`が示すcredential recordへ保存する。providerは各要求で`ctx.get('credentials')`を通じて参照を解決し、credentials serviceがないcompositionでは信頼された環境層だけをフォールバックとして読む。

APIキー、Authorizationヘッダー、完全なリクエスト本文、credential recordはログとsession eventへ出力しない。`baseURL`は設定値として表示可能だが、既定値以外を使う場合もネットワーク先を診断ログへ自動出力しない。

## 6. モデル一覧と能力解決

`GET /provider/v1/models`で取得したモデルを表示対象の一次情報とする。取得失敗または形式不正の場合は、仕様書作成時点で公式GOATモデルページに掲載された最小のフォールバック一覧を使う。APIから得た未知モデルを静的表にないという理由だけで捨てない。

Provider APIの一覧はモデルID、表示名、context length以外の能力を保証しない。そのため、静的能力表をモデルID単位で管理する。

- protocol: `openai`または`anthropic`
- context window
- 最大出力トークン
- text/image入力
- tools
- reasoning対応
- 選択可能なreasoning effort
- 必要な固定sampling値

静的表にないモデルは、画像とreasoningを無効にした安全な既定値で扱う。protocolは`protocolOverrides`、既知のClaude ID判定、OpenAI形式の順で解決する。未知モデルについてAPI形式を推測できない場合は、チャット要求を送る前に明示的な設定を要求するか、APIの400をモデル形式エラーとして返す。モデルIDだけでGOAT契約を偽装する処理は行わない。

`resolveModel`は、広告用モデル一覧とは別に、選択された正確なprovider/modelのcontext、modality、reasoning設定、protocolを返す。モデル選択の能力表とwire serializerのprotocol判定は同じ解決結果を使う。

## 7. リクエスト変換

DSHの`GenerateOptions`を各API形式へ変換する責任を分離する。

### 7.1 OpenAI Chat Completions

- system、user、assistant、toolメッセージをOpenAI rolesへ変換する
- assistantのツール呼び出しを`tool_calls`へ変換する
- tool結果を`role: tool`と`tool_call_id`へ変換する
- 画像を対応するモデルだけdata URLまたは許可された画像形式へ変換する
- DSHのtoolsをOpenAI function toolsへ変換する
- `reasoning_effort`は能力表が対応を明示したモデルだけ送る
- raw JSONのツール引数を文字列のまま保持する

### 7.2 Anthropic Messages

- systemメッセージをトップレベルの`system`へ分離する
- 連続する同じroleのメッセージを一つへ統合する
- assistantのツール呼び出しを`tool_use`へ変換する
- tool結果を`tool_result` content blockへ変換する
- 画像をbase64 image blockへ変換する
- DSHのtoolsをAnthropic toolsへ変換する
- Claude系モデルのAPI制約に合わない履歴は送信前に明示的なinvalid-request errorへ変換する

### 7.3 画像

画像は`resolveModel`が`image`入力を広告する場合だけ送信する。DSH attachment serviceが提供する参照は、providerが要求するdata URLまたはbase64 payloadへ解決する。サイズ上限と画像数上限は設定値で検証し、非対応モデルに対して黙って別モデルへ切り替えない。

## 8. ストリーミング

HTTP transport、SSEフレーム処理、OpenAIイベント処理、Anthropicイベント処理を分離する。チャンク境界がSSEデータ境界と一致することを前提にしない。

DSHの`StreamChunk`へ次の規則で変換する。

- それぞれのtext/reasoning/tool blockに安定したindexを割り当てる
- textは`text-delta`、reasoningは`reasoning-delta`へ変換する
- ツール引数は`tool-call-delta.argumentsDelta`のraw文字列で送る
- blockが閉じた時点で完全な`block-end`を送る
- 応答usageを`usage` chunkへ変換する
- providerの終了理由をDSHの`finish`へ変換する
- `usage`は必ず`finish`より前に送る
- `finish`後は何も送らない
- 空の停止応答は`EMPTY_RESPONSE`エラーとして終了する

ストリーム中のproviderエラーは、送信前のHTTPエラーなら`LlmError`をthrowし、応答途中のエラーならDSHが扱えるterminal error finishへ変換する。利用者のAbortSignalはfetchとSSE readerへ伝播する。

## 9. エラーと再試行

エラー変換はprovider固有の本文をDSHの`LlmFailure`へ正規化する。

| Command Code | DSH分類 | 扱い |
| --- | --- | --- |
| `400 unsupported_model` | `INVALID_REQUEST`または`MODEL_NOT_FOUND` | モデルIDまたは契約対象を確認するよう案内 |
| `400 invalid_request_error` | `INVALID_REQUEST` | 変換したpayloadの不備として返す |
| `401 authentication_error` | `MISSING_CREDENTIAL`または認証エラー | APIキーの設定・更新を案内 |
| `403 upgrade_required` | 権限エラー | GOAT以上のProvider API契約が必要と案内 |
| `422 cmd_zdr_no_providers` | ZDR非対応 | ZDRを無効化するか対応モデルを選ぶよう案内 |
| `429 rate_limit_error` | `RATE_LIMIT` | `Retry-After`を`providerRetryAfterMs`へ変換 |
| `5xx` | provider/server error | DSHのretry policyへ委譲 |
| ストリーム停止 | `TIMEOUT` | `streamIdleTimeoutMs`超過として扱う |
| 呼び出しキャンセル | `ABORTED` | 利用者のキャンセルとして扱う |

adapter内部で透過的な再試行を実行しない。一回のadapter callは一回のprovider attemptとし、DSHの`llm-retry`がdurableなretry turnを管理する。retry policyは標準のDSH設定としてprovider登録へ渡す。

コンテキスト超過はprovider本文にかかわらず`CONTEXT_WINDOW_EXCEEDED`へ統一する。ストリームがreasoningだけで終わった場合や安全に実行できない途中のtool callが残った場合は、通常のassistant成功として扱わず、DSH retry policyへ渡せる失敗として分類する。

## 10. Web設定画面

client pluginは、DSHの`settings.plugin.item`スロットへ`llm-commandcode-goat`キーでカードを登録する。コンポーネントは`ctx`やDSH service objectを直接参照せず、inject面と設定・credential APIのcallbackだけをpropsとして受け取る。

カードの必須項目は次の通りとする。

- Command Code API keyのwrite-only入力
- APIキー設定済み／未設定の状態
- 保存・削除操作
- API base URLの詳細設定
- request timeoutとstream idle timeout
- ZDRの有効化
- 設定エラーと接続エラーの明示表示

APIキーが未設定でもモデル一覧の取得を試みる。チャット開始時にキーがなければ、設定画面へ戻るための明示的エラーを返す。使用量カードや残量バーは作らない。

Web clientのCSSはDSHの`--dsw-*` semantic tokenだけを使う。キーボード操作、visible focus、十分なコントラスト、`prefers-reduced-motion`を満たす。

## 11. プロジェクト構成

```text
commandcode-goat-dsh-provider/
├── cordis.patch.yml
├── package.json
├── tsconfig.json
├── tsdown.config.ts
├── bunfig.toml
├── README.md
├── LICENSE
├── src/
│   ├── index.ts
│   ├── adapter.ts
│   ├── config.ts
│   ├── types.ts
│   ├── catalog.ts
│   ├── errors.ts
│   ├── api/
│   │   ├── client.ts
│   │   └── requests.ts
│   ├── wire/
│   │   ├── sse.ts
│   │   ├── openai.ts
│   │   └── anthropic.ts
│   └── client/
│       ├── index.ts
│       ├── settings-card.tsx
│       └── locales.ts
└── tests/
    ├── api-client.test.ts
    ├── catalog.test.ts
    ├── conversion.test.ts
    ├── errors.test.ts
    ├── openai-stream.test.ts
    ├── anthropic-stream.test.ts
    ├── sse.test.ts
    ├── timeout.test.ts
    ├── settings.test.ts
    └── composition.test.ts
```

`src/types.ts`は型定義だけを持つ。Node側とWeb側の実装依存を混ぜず、client artifactはDSHのdynamic client module契約に従って別build faceで生成する。実行時依存は標準Web APIと、SSEを安全に分割するための最小の維持されたライブラリだけにする。

## 12. テスト方針

全自動テストはAPIキーなしで実行できるようにする。HTTPはモックサーバーまたはfetch差し替えで検証し、実アカウント情報をfixtureへ保存しない。

### 12.1 Unit tests

- URL、Bearer認証、content type、ZDRヘッダー
- OpenAI／Anthropicのメッセージ・tool・image変換
- Claudeのsystem分離とrole統合
- SSEの分割、複数event、終了event、異常JSON
- text、reasoning、tool-call、usage、finishの順序
- raw tool argumentsの断片化と再構成
- 空応答、途中エラー、context overflow
- 401、403、404、422、429、5xx、Retry-After
- AbortSignal、request timeout、stream idle timeout
- 動的一覧と静的能力表の統合、未知モデル、protocol override
- credential未設定と設定カードの保存・削除

### 12.2 DSH composition test

一時的なDSH compositionをLoaderで起動し、外部bundleのhost row、そこから検出されるclient artifact、provider directory、model discovery、mock HTTP streamを通して検証する。手作りの`ctx.plugin(...)`だけで成功したことをcomposition合格とはみなさない。

### 12.3 手動ライブ確認

ビルド・型検査・keylessテストが通った後、利用者が自分の環境でAPIキーを設定し、GOAT対象モデルで次を確認する。

1. Settings → Plugins → Configurableでキーを保存できる。
2. ModelsでCommand Code GOATのモデル一覧が表示される。
3. 通常モデルのテキスト応答がストリーミング表示される。
4. reasoningとtool callを使うモデルが動作する。
5. 画像対応モデルで添付画像を送信できる。
6. Claude系モデルでAnthropic Messages経路が動作する。
7. キーやAPIのエラーが秘密情報を含まず表示される。

## 13. 受け入れ条件

- `/home/pi/projects/commandcode-goat-dsh-provider`が独立したGit repositoryになっている。
- `dsh-commandcode-goat-provider`としてローカルbundleを生成できる。
- `commandcode-goat` provider routeがDSHに登録される。
- APIキーなしでもモデル一覧取得の失敗がクラッシュにならない。
- GOAT APIキー設定後にWebチャットを送信できる。
- OpenAIとAnthropicの両形式がストリーミングで表示される。
- ネイティブtool callとtool resultがDSH agent-loopへ戻る。
- 対応モデルで画像入力が送信でき、非対応モデルでは明示的に拒否される。
- DSHのchunk、error、retry、cancel契約をテストで固定している。
- `bun run typecheck`、`bun run lint`、`bun test`、`bun run build`が成功する。
- 実キーがソース、fixture、ログ、Git履歴に存在しない。
- 使用量・残量endpointを実装していない理由がREADMEに記載される。

## 14. リスクと保留事項

Command Code Provider APIのエンドポイントは公式公開仕様を使うが、モデル能力メタデータや一部のストリームフィールドが将来拡張される可能性がある。未知フィールドは無視し、必須フィールドの不備は明示的なprotocol errorにする。

Command Code側のClaude／非Claudeモデル判定がモデルID規則だけでは安定しない場合は、動的モデル一覧のprotocol metadataが公開されるまで、`protocolOverrides`で個別に補正する。誤った形式へ送るより、安全側で要求を拒否する。

DSHのclient module仕様や設定slotはDSH更新で変更される可能性がある。ローカルproviderはDSHの現在のreleaseへ合わせてpeer dependency範囲を固定し、DSH更新後はcomposition testとWeb smokeを再実行する。

## 15. 参照したDSH契約

実装時は、現在インストールされているDeepSeek Harness checkoutの次の契約を基準にする。

- `packages/llm/llm/src/types.ts`の`StreamChunk`、`GenerateOptions`、`LlmAdapter`
- `packages/llm/llm-deepseek`のhost adapter構成
- `packages/llm/llm-pi-ai`の設定・credential・model discovery登録
- `docs/cookbook/adding-an-llm-adapter.md`
- `docs/user/develop/basic/publish.md`
- `packages/client/ui-settings-plugins`の`settings.plugin.item` slot
- `packages/client/modules`の`dsh.client` manifestとclient artifact解決

これらは実装上の契約を確認するための参照であり、既存第三者providerのコードを派生元として扱わない。
