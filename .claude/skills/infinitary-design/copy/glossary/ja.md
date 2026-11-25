# Japanese (`ja`)

The reader is a Japanese adult who uses a Mac or PC daily but has never opened a terminal, so every word follows Apple's and GitHub's own Japanese interfaces rather than developer slang.
Sentences use です・ます, calm and polite without keigo layers such as させていただきます, and labels and buttons are plain noun phrases or dictionary-form verbs (「設定を開く」, 「破棄」).
The person is addressed as 船長 where a name is needed and as あなた only where Japanese needs an explicit subject; most sentences drop the subject as natural Japanese does.
Punctuation is full-width: 。、「」（）：？, with 「」 for quoted titles and button names, while "·", "→", "›" and "/" stay as in English.
A half-width space separates Japanese from Latin words, product names and word placeholders such as {name}, {place} and {key}, as Apple's Japanese menus do (「Infinitary を開く」).
A number placeholder sits directly against its counter with no space (「{count}件」, 「{minutes}分前」, 「残り{percent}%」), while a unit written in Latin letters keeps a space (「1.6 GB」).

## Terms

| English | Japanese | Note |
| --- | --- | --- |
| a crewmate's notes | 乗組員のノート | Replaces the crewmate's session log. |
| a panel by <name> | <name> 作のパネル | 作 marks who made it. |
| A phone (the item under Devices) | 「スマートフォン」 |  |
| a stronger model | より強力なモデル | Replaces escalation. |
| account | アカウント | Standard. |
| address (of a computer) | アドレス | A computer's SSH address, and a browser page's address. |
| agent plugins | エージェントプラグイン | Only the plugins turned on in the person's coding agent; a panel stays パネル. |
| Always use | 常に使う | The setting that sends all crew work to one model; quoted as 「常に使う」 in sentences. |
| Appearance | 外観 | macOS Japanese. |
| Approves secret uses (switch) | シークレットの使用を承認 | The computer's Settings → Devices should show the same words. |
| Asks first | 先に確認 | Merge setting. |
| Automation | 自動化 | Settings section name. |
| backlog | バックログ | Common in Japanese project tools. |
| batch (your approved changes, combined) | 一括プルリクエスト | The batch is named by its pull request; バッチ is avoided as jargon. |
| batched pull request | 一括プルリクエスト | Delivery where approved changes merge together in a batch. |
| branch | ブランチ | GitHub Japanese docs. |
| bring up to date | 最新の状態に更新 | Replaces rebase; 競合 (conflict) is avoided and the clash is said as 食い違い. |
| built in place | その場で作成 | Delivery with no branch or pull request. |
| captain | 船長 | The usual word for a ship's captain, used as a form of address (「ようこそ、船長」). |
| card | カード | Plain loanword. |
| Careful | 慎重 | Rigor level. |
| certificate | 証明書 | Only where the person chooses an organization's CA certificate. |
| check (of a finding) | 検証 | 「検証済み」「再検証が必要」; チェック stays for a pull request's checks. |
| clipboard | クリップボード | Where Copy value puts a secret's value. |
| clone | クローン | 「クローン済み」, never コピー. |
| command (run in Terminal) | コマンド | Run in 「ターミナル」, macOS's own Japanese name for Terminal. |
| command search | コマンド検索 | Plain compound. |
| commit | コミット | GitHub Japanese docs. |
| computer | コンピューター | Every computer alike, with the long-vowel mark. |
| concept | 概念 | A Knowledge entry, as on cards. |
| conflict (avoided) | 食い違い | Vocabulary rule: the word conflict is not restored. |
| connection (between concepts) | つながり | Plain word for a graph link. |
| connection file | 接続ファイル | The file in Pi's models.json format that Settings → Intelligence reads custom connections from. |
| conversation | 会話 | Replaces session and transcript. |
| credits (a provider's, paid past the allowance) | クレジット | ChatGPT's Codex credits; Claude's are called extra usage. |
| crew | 乗組員 | The native ship word reads warmer than クルー and works for one or many. |
| crewmate | 乗組員 | Same word as crew; 担当の乗組員 when it means the crewmate assigned to a task. |
| custom API (a connection the person adds) | カスタム API | A saved one is a 接続, and Disconnect is 接続を解除. |
| decision (card kind) | 判断 | Short label for a card with choices. |
| decision model | 判断用モデル | The model that answers decision cards. |
| Default | 標準 | Rigor level. |
| default (a card question's option a skip sends) | 既定 | The option a skipped card question sends; 標準 stays the rigor level. |
| Delivery | 届け方 | Record label; 配信 or デプロイ would mislead. |
| demo | デモ | Plain loanword. |
| Devices | デバイス | Settings section name. |
| Diagnostics (Settings → Sharing) | 診断 | |
| Dictation | 音声入力 | macOS Japanese names the feature 音声入力. |
| direction (a standing direction) | 方針 | Kept apart from 指示, which is the Instruction kind. |
| discard | 破棄 | Standard for dropping unsaved work. |
| Done / Got it | 完了 / 了解 | Note card buttons, quoted as 「完了」 and 「了解」 in sentences. |
| draft (pull request) | ドラフト | GitHub's Japanese interface word. |
| drop (a task) | 取りやめ | Softer than 中止 and distinct from 破棄. |
| Dynamic routing | 動的な振り分け | Plain words for sending work to a level and then to the model with the most allowance left; ルーティング would be jargon. |
| estimate / estimated (cost) | 推定 | As in 推定値 and 推定（米ドル）; the command search keeps 見積もり as a search word. |
| evidence / source | 根拠 / 出典 | A finding's support and what it cites. |
| extra usage (Claude's credits past the allowance) | 追加使用量 | |
| feed / activity | アクティビティ | The pane's name. |
| feedback (/feedback, to Infinitary's maker) | フィードバック | 「フィードバックを送信」. |
| file (to the backlog) | バックログに登録 | 登録 for filing; a task that starts now is 開始, never 登録. |
| finding | 知見 | A recorded claim with evidence, as on cards. |
| fingerprint (a computer's key) | フィンガープリント | 指紋 would read as Touch ID. |
| first mate | 一等航海士 | The ship's officer term, a common noun; the thread's short author label is 航海士. |
| fold (where an iPhone Duo folds) | 折り目 | |
| folder picker | フォルダの選択画面 | The system window for choosing a folder, as the app's own message names it. |
| font (Settings → Appearance) | フォント | |
| forget (a computer, on the phone) | 登録を解除 | Kept apart from 削除 (Remove) and 離脱 (Leave). |
| gate | 関門 | The checks work passes before it merges; ゲート would read as a physical gate. |
| header (an extra request header) | ヘッダー | Long-vowel mark. |
| held (a batch that stopped) | 保留中 | The same word as a merge a rule holds (保留しています); 一時停止 stays for what a person pauses. |
| hold (on a task) | 保留 | 「保留が解ける」 for a hold ending. |
| How to get it (an ask for a secret) | 入手方法 | The heading over the steps a crewmate lays out for making or finding a secret. |
| Idle (a task's state) | アイドル | 待機中 is Queued; both appear in one list. |
| Infinitary | Infinitary | Never translated or written in katakana. |
| inspector | インスペクター | The Knowledge pane that reads one entry. |
| Integrations | 連携 | Settings section name. |
| Intelligence | インテリジェンス | Settings section name. |
| issue (where the project lives) | Issue | As GitHub's Japanese pages keep it. |
| join (the phone joins a computer) | 接続する | 「{computer} に接続しますか？」 |
| key (an integration's key) | キー | 「Linear キー」; never シークレット or トークン. |
| Knowledge (the panel) | ナレッジ | The panel's name; 知識 reads as schooling. |
| land / ship (avoided) | マージ | Never 反映 or 取り込み for a merge. |
| Leave (a device) | 離脱 | At a computer that controls the first mate. |
| level (a model's level; also "slot") | レベル | The Models board's Premium / High / Med / Low; "slot" and "slotted model" say the same thing. |
| link (to add a device) | リンク | The one-time link that adds a computer or phone. |
| live validation | 実地検証 | Trying the change for real; kept apart from チェック. |
| local merge | ローカルマージ | Delivery pill. |
| log (a check's kept output) | ログ | Plain loanword, distinct from the record, 記録. |
| log in (to a computer's user account) | ログイン | Kept apart from サインイン, which is for services. |
| machine (avoided) | コンピューター | Vocabulary rule; マシン appears only as a search word. |
| main message | メインのメッセージ欄 | Command label. |
| maintainer | プロジェクト管理者 | |
| mark (a place marked on a picture or a page) | マーク | 「マーク {mark}」, 「マーク付きの画像」. |
| median (Usage, Cost per task) | 中央値 | The middle task of a week's finished tasks; never "average". |
| merge | マージ | GitHub Japanese docs; 「マージ済み」 for the merged state. |
| merge queue (the host's own) | マージキュー | |
| Merges on its own | 自動でマージ | Merge setting. |
| message box | メッセージ欄 | 欄 is the standard word for a field. |
| middle half (Usage, Cost per task) | 中間の半分 | The band between the quarter and three-quarter marks of a week's tasks. |
| model | モデル | Standard. |
| Not now | 今はしない | Consent button. |
| note (a comment pointed at part of a card) | メモ | The queued comment, 「2件のメモを送信」; a note card stays お知らせ. |
| note (card kind) | お知らせ | A note card carries a fact for the person; メモ is kept for a crewmate's own notes and first mate's noted lines. |
| out of reach | 連絡がつきません | Replaces offline; the short label is the same phrase. |
| panel | パネル | Plain loanword. |
| part (of a program) | パート | A program's sub-task. |
| pause / paused | 一時停止 / 一時停止中 | Standard; 停止 stays for stop. |
| phone | スマートフォン | 電話 would read as a call. |
| pin (a task) | 固定 | 「タスクの先頭に固定」, as for a pinned model. |
| plan | プラン | Standard billing word. |
| plugin / extension (avoided) | パネル | Vocabulary rule. |
| Point at | 指し示す | The button, in dictionary form. |
| PR #N | PR #N | Kept as the identifier, in mono. |
| Premium / Hard / Normal / Simple (a task's level), Difficulty | プレミアム / 難しい / 普通 / 簡単, 難易度 | How hard the task is, never a reasoning word. |
| private network | プライベートネットワーク | A network that joins computers wherever they are. |
| project | プロジェクト | Standard. |
| provider | プロバイダー | Long-vowel mark per current Microsoft and Apple style. |
| pull request | プルリクエスト | GitHub's own Japanese interface says プルリクエスト. |
| purge (task data) | 消去 | Settings → General's button and its confirm; distinct from 削除 for a device. |
| push | プッシュ | 「ブランチをプッシュしました」. |
| queued | 待機中 | The Queued lane. |
| Quick | クイック | Rigor level. |
| Quick answer (a card's mark) | クイック回答 | The chip on a quick answer's card. |
| rail | パネル列 | The column of panels; レール would be opaque. |
| reading (of the allowance) | 読み取り | As in 「読み取り中…」 and 「利用枠の読み取りなし」. |
| Reasoning | 推論 | The fact strip's label. |
| rebase merges, merge commits (the host's settings) | リベースマージ、マージコミット | Named only as the settings where the project lives, as GitHub's Japanese docs say them; the app's own action stays 最新の状態に更新. |
| recording (the file) | 録画 | A demo's recording; a voice recording in progress is 録音中. |
| redacted (decision records) | 個人情報を伏せた | Plain phrase; 墨消し and リダクト read as jargon. |
| Reduce motion (macOS) | 視差効果を減らす | macOS's own Japanese setting name, used only in the path to it. |
| relay (Infinitary's push relay) | Infinitary の中継サーバー | It passes sealed notifications and notes it cannot read; a sealed note is 「封をしたメッセージ」. |
| Remote Login (macOS) | リモートログイン | macOS's own Japanese name in Sharing, quoted as 「リモートログイン」 in sentences. |
| Remove (a device) | 削除 | At the computer where the first mate lives. |
| repair (the task repairing a held batch) | 修復 | 「{key} が修復しています」 for the task at work; the change it makes stays 修正. |
| report | 報告 | 「報告：{summary}」. |
| repository (one of a project's) | リポジトリ | 「リポジトリを追加」「2 個のリポジトリ」. Names one of a project's repositories, or GitHub's own; what work belongs to stays プロジェクト. |
| reset (Infinitary on this computer) | リセット | Settings → General's row that deletes everything the app keeps on this computer; distinct from 消去, which clears tasks only. |
| revision (of a record) | 改訂 | 「改訂 {revision}」. |
| rigor (the level) | 慎重さ | 「慎重さ：{care}」 replaces "{care} rigor". |
| Runbooks | ランブック | Settings section name. |
| Runs on | 実行先 | Record label. |
| Save secret / Don't save (an ask for a secret) | シークレットを保存 / 保存しない | The ask card's buttons; never the word for keep. |
| saved reset (a provider's, refills the allowance) | 保存済みのリセット | ChatGPT's saved resets for Codex, counted with 回分; Infinitary uses one only when the person chooses Use a saved reset, through Codex. |
| Secrets (settings section) | シークレット | The section's own name. |
| send back (a change out of a batch) | 差し戻す | The usual word for returning work with a reason. |
| server (a custom API's) | サーバー | Long-vowel mark, as for コンピューター. |
| Settings | 設定 | macOS Japanese. |
| sign-in / sign in | サインイン / サインインする | Apple and GitHub Japanese use サインイン; never トークン or 認証情報. |
| standing reply (your words kept on a task, which pass its holds) | 有効な返信 | |
| start | 開始 | Standard. |
| starter | 書き出し | The welcome's sentence starters. |
| Steer (button) | 伝える | 指示 is the Instruction kind. |
| stop | 停止 | Standard. |
| story (a change's) | ストーリー | |
| subscription | サブスクリプション | The name on the bill. |
| System Settings (macOS) | システム設定 | macOS's own name. |
| tag (a project's name for a kind of task) | タグ | The app's own word and the standard loanword in Japanese software; no plural form. 「タグを付ける」 for tagging a task, 「タグ別」 for By tag. |
| task | タスク | Standard in Japanese software. |
| task board | タスクボード | The Tasks panel's board; 列 for its columns. |
| task key | タスクキー | The letters tasks are numbered with, such as {key}-1, as Japanese project tools say. |
| Text size; Text Size, Control Center (iOS's own names) | テキストサイズ; テキストサイズ, コントロールセンター | iOS's own Japanese names for the control. |
| the checks are running | チェック実行中 | Short state label. |
| the checks failed | チェックに失敗しました | GitHub's Japanese status wording. |
| the checks passed | チェックに合格しました | GitHub's Japanese status reads 「すべてのチェックに合格しました」. |
| the project's host | プロジェクトのホスト | Used where English says host. |
| the record (a task's record) | 記録 | 「タスクの記録」 for the pane's title. |
| Theme: Device / Dark / Light | テーマ: デバイスに合わせる / ダーク / ライト |  |
| this computer | このコンピューター | Never 本機 or ホスト. |
| time zone | タイムゾーン | The common software word; Apple's 時間帯 also means a time of day and would blur beside a schedule. |
| token (a custom API's token command and model sizes) | トークン | Only where the person chose a command that prints one, and for context and output sizes. |
| token (what Usage counts) | トークン | The same unit as the model sizes in the custom API row above; a sign-in or a key is never a トークン. |
| unsafe data reader | 安全でないデータの読み手 | A crewmate that reads words anyone can write. |
| Usage | 使用量 | Settings section name. |
| user (another user account on this computer) | ユーザー | "as {user}" is 「{user} として」, as in 「別のユーザーとして実行」. |
| version (for a SHA) | バージョン | Never ハッシュ or SHA in a sentence. |
| Where changes go | 変更の届け先 | Row title in Settings → Projects; pairs with 届け方 for Delivery. |
| where the project lives | プロジェクトの保管先 | Plain phrase for the remote; never リモート or オリジン. |
| window | ウインドウ | Apple's Japanese spelling. |
| working copy | 作業コピー | The isolated copy the app makes. |
| workspace (the personal workspace) | ワークスペース | Plain loanword, standard in Japanese software. |
| your plan's allowance | プランの利用枠 | Replaces quota and rate limit; 「残り{percent}%」 for allowance left. |
| your project | プロジェクト | The possessive is dropped as Japanese does; あなたのプロジェクト reads as translationese. |
