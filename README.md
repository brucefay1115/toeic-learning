# TOEIC AI Tutor — 你的 AI 多益家教

[English](./README.en.md) | 中文

> 零安裝、零月費、AI 驅動的多益學習神器。打開瀏覽器就能練，忙碌的你也能高效備考。

## Demo

[![Demo Video](https://img.youtube.com/vi/zNm1YYRIGrE/0.jpg)](https://youtube.com/shorts/zNm1YYRIGrE)

👆 點擊觀看 Demo 影片

---

## 👉 立即使用

**[https://brucefay1115.github.io/toeic-learning](https://brucefay1115.github.io/toeic-learning)**

不用下載、不用安裝，點開連結就能開始學習！

> 💡 **建議第一次使用時，將網頁加入手機主畫面，體驗如同原生 App：**
>
> - **iPhone (Safari)**：點底部「分享」按鈕 → 選擇「加入主畫面」
> - **Android (Chrome)**：點右上角「⋮」選單 → 選擇「加入主畫面」
>
> 加入後會以全螢幕模式開啟，使用體驗跟一般 App 完全一樣！

---

## 為什麼選擇 TOEIC AI Tutor？


| 痛點            | 我們的解法                              |
| ------------- | ---------------------------------- |
| 補習班太貴、時間對不上   | **免費 + 隨時隨地**，只需一個瀏覽器              |
| 背單字總是背了又忘     | 內建 **SRS 間隔重複記憶系統**，科學排程複習         |
| 教材千篇一律        | **Gemini / OpenAI 即時生成**，每次都是全新文章          |
| 想聽發音還要另外開 App | **AI 語音朗讀**內建，支援多種聲線與變速播放          |
| 想練口說但找不到對話對象  | **即時 AI 口說對話**，可選商務/生活主題自由開口       |
| 平常練很多但不知道考場表現 | **模擬考試模式**，交卷立刻看結果與錯題解說            |


---

## 核心亮點

### 🎯 AI 即時生成多益文章

根據你的目標分數（500–900）與自訂主題，AI 即時產出一篇符合多益情境的短文，附帶：

- **逐句中英對照翻譯**
- **核心單字卡**（含詞性、音標、中文釋義、例句）
- **常用片語解析**

### 🔊 AI 語音朗讀 + 逐句高亮追蹤

- 使用 Google Gemini TTS 或 OpenAI TTS 生成自然語音
- **6 種語音角色**可選：清晰女聲、柔和女聲、活潑男聲、沉穩男聲⋯⋯
- 播放時**逐句高亮同步顯示**，訓練聽讀能力
- 支援 **0.25x / 0.5x / 0.75x / 1.0x 變速播放**
- 每句話都可獨立重播

### 🗣️ AI 口說對話（新功能）

- 一鍵開始口說，直接和 AI 進行英文來回對話
- 內建多個多益情境主題（機場、會議、客服、面試等），也可自訂主題
- 對話紀錄自動保存，可隨時回看練習內容

### 📝 模擬考試（新功能）

- 依目標分數生成完整模擬題（聽力 / 閱讀 / 單字 / 文法）
- 可直接交卷，立即看到答題結果與錯題整理
- 支援「錯題解說」生成，快速抓出弱點

### 🧠 SRS 間隔重複記憶系統

這才是真正幫你「記住」的關鍵功能：

- 儲存單字後，系統自動依照 **0 → 1 → 3 → 7 → 14 → 30 天** 排程複習
- 三種題型交叉練習：**英翻中 / 中翻英 / 聽力選擇**
- 答對升級、答錯降級，精準鎖定你的弱點單字
- Lv.0 到 Lv.5 等級標籤，一目瞭然掌握進度

### 📖 長按查字典

文章中**任何單字長按即可查詢**，顯示詞性、音標、中文釋義與例句。找不到的字？一鍵呼叫 **AI 即時解析**。

### 🔀 雙 AI 供應商，自由切換

- 可在設定中選擇 **Google Gemini** 或 **OpenAI** 作為 API 供應商
- 內建常用模型清單（如 Gemini 2.5 Flash / Pro、GPT-4o mini / GPT-4o），也支援**手動輸入模型名稱**
- 文字生成、語音朗讀、模擬考試、口說對話皆可使用所選供應商
- 設定中提供「測試 API Key」按鈕，貼上後即可確認是否可用

### ☁️ Google 雲端備份

登入 Google 帳號即可將學習紀錄、單字本備份到 Google Drive，支援**立即備份 / 從雲端還原 / 登出**（不包含 API Key）。

---

## 免費使用怎麼做到的？

本專案支援 **Google Gemini** 與 **OpenAI** 兩種 AI 供應商，兩者都有免費使用的方式，你只需要自行申請 API Key 並填入設定即可開始學習。

> API Key 僅儲存在你的裝置本地（IndexedDB），不會備份到 Google Drive。

### 方案一：Google Gemini（完全免費）

[Google Gemini API](https://aistudio.google.com/app/apikey) 提供**每日免費額度**，個人學習完全夠用。

1. 用 Google 帳號前往 [Google AI Studio](https://aistudio.google.com/app/apikey) 申請免費 API Key
2. 在 App 設定中選擇供應商為 **Gemini**，貼上 API Key
3. 開始學習！

### 方案二：OpenAI（啟用資料共享可免費）

[OpenAI API](https://platform.openai.com/api-keys) 採量計費制，但若你允許 OpenAI 將輸入／輸出資料用於訓練與改善，即可獲得**每日免費 Complimentary Token**（詳細說明請見 [OpenAI 官方頁面](https://help.openai.com/zh-hant/articles/10306912-sharing-feedback-evaluation-and-fine-tuning-data-and-api-inputs-and-outputs-with-openai) 及[啟用步驟筆記](https://hyday.tw/s/mpi4rwcr6waw2k)）。

1. 前往 [OpenAI Platform](https://platform.openai.com/api-keys) 申請 API Key（需先儲值最低金額）
2. 至帳戶設定啟用「Share inputs and outputs with OpenAI」以獲得每日免費 Token
3. 在 App 設定中選擇供應商為 **OpenAI**，貼上 API Key
4. 開始學習！

---

## 快速開始

1. 打開 **[https://brucefay1115.github.io/toeic-learning](https://brucefay1115.github.io/toeic-learning)**
2. 將網頁加入手機主畫面，享受全螢幕 App 體驗
3. 選擇 API 供應商（Google Gemini 或 OpenAI），並設定對應的 API Key 及 Model
4. 開始學習！

---

## 使用教學

### Step 1 — 設定 API 供應商與 API Key

首次開啟會自動彈出設定視窗：

- 先選擇 **API 供應商**（Google Gemini 或 OpenAI）與**模型**（可從清單選取，或手動輸入模型名稱）
- 點選連結前往 [Google AI Studio](https://aistudio.google.com/app/apikey) 或 [OpenAI Platform](https://platform.openai.com/api-keys) 取得 API Key，貼上後儲存
- 可按「測試 API Key」確認金鑰是否有效；若要重設，可用輸入框旁的「一鍵清除」

### Step 2 — 到「練習」選擇模式

你可以在「文章練習 / 口說對話 / 模擬考試」三種模式間切換，依今天目標直接開始：

- **文章練習**：選目標分數 + 主題，點「開始學習」
- **口說對話**：選情境主題或自訂主題，點「開始口說對話」
- **模擬考試**：選目標分數，點「開始模擬考試」

### Step 3 — 文章模式：閱讀 + 聆聽

AI 生成文章後自動跳到「學習」頁面：

- 點播放鍵聆聽語音，觀察逐句高亮
- 切換「顯示中文」對照翻譯
- 切換「隱藏英文」練習純聽力
- 長按任何單字查詢詳細解釋

### Step 4 — 口說 / 模擬考：快速補弱

- **口說對話**：和 AI 即時來回對話，內容自動存成學習紀錄
- **模擬考試**：作答後可直接交卷看結果，並可一鍵生成錯題解說

### Step 5 — 儲存單字，開啟 SRS 複習

閱讀文章時看到不熟的單字？按下書籤圖示儲存到單字本。累積 3 個以上單字後，即可在「單字本」頁籤啟動 SRS 複習，透過三種題型反覆練習直到真正記住。

### Step 6 —（選用）雲端備份

到設定頁登入 Google 後，可使用：**立即備份 / 從雲端還原 / 登出**。換裝置也能延續你的學習紀錄與單字本。

---

## 功能一覽


| 功能      | 說明                           |
| ------- | ---------------------------- |
| AI 供應商切換 | 可選 Google Gemini 或 OpenAI，支援自訂模型名稱 |
| AI 文章生成 | 根據分數與主題即時產出多益情境短文            |
| AI 語音朗讀 | 6 種聲線、4 段變速、逐句高亮追蹤           |
| AI 口說對話 | 多益情境即時對話，支援主題預設與自訂主題         |
| 模擬考試    | 聽力/閱讀/單字/文法整合出題，交卷即評分        |
| 錯題解說    | 針對錯題自動生成重點解說，快速補弱            |
| 中英對照    | 逐句翻譯，可獨立顯示/隱藏                |
| 長按查字    | 任意單字長按查詢，支援 AI 即時解析          |
| 單字本     | 一鍵儲存，統一管理所有學習單字              |
| SRS 複習  | 間隔重複記憶，英翻中/中翻英/聽力三題型         |
| 核心單字卡   | 詞性、音標、釋義、例句一應俱全              |
| 片語解析    | 提取文章中的常用片語並附解釋               |
| 學習紀錄    | 自動儲存每次生成的內容，隨時回顧             |
| 雲端備份    | Google Drive 手動備份/還原，跨裝置延續進度 |
| 離線儲存    | IndexedDB 本地儲存，無網路也能回顧歷史內容   |
| 行動優先    | 專為手機設計，支援加入主畫面全螢幕使用          |


---

## 適合誰？

- 準備多益考試、時間有限的**上班族**
- 想利用零碎時間學英文的**通勤族**
- 不想花大錢補習的**學生族**
- 想要科學化記憶單字的**任何英文學習者**

---

## 技術架構

- **純前端單檔架構**（Single HTML File）— 零後端、零依賴
- **雙 AI 供應商** — 可切換 Google Gemini 或 OpenAI，並支援自訂模型名稱
- **Google Gemini 2.5 Flash / OpenAI GPT-4o mini** — 文字生成
- **Google Gemini TTS / OpenAI TTS（tts-1）** — AI 語音合成
- **IndexedDB** — 本地資料持久化
- **Google Drive appDataFolder** — 雲端備份
- **SRS 演算法** — 間隔重複記憶排程

---

## 支持這個專案

如果覺得這個工具對你有幫助，歡迎請我喝杯咖啡，支持我持續開發更多功能！

[![Facebook](https://img.shields.io/badge/Facebook-Bruce%20Yang-1877F2?logo=facebook&logoColor=white)](https://www.facebook.com/bruce.yang.94)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-Chun--Hsiang%20Yang-0A66C2?logo=linkedin&logoColor=white)](https://www.linkedin.com/in/chun-hsiang-yang-b17238165)
[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-Support-FFDD00?logo=buymeacoffee&logoColor=black)](https://buymeacoffee.com/brucefay110)

---

## 給開發者的提醒

- 本網站使用 **Google Analytics (GA)** 蒐集匿名流量數據，以協助了解使用者行為。若你 fork 或重新部署本專案，請記得**替換或移除** `index.html` 中的 GA 追蹤碼。
- 本專案使用 **Google Drive API** 進行登入與雲端備份功能，若你要自行部署，請記得在 [Google Cloud Console](https://console.cloud.google.com/) 建立自己的 GCP 專案並替換 OAuth Client ID。

---

## 授權

PolyForm Noncommercial 1.0.0

你可以自由使用、修改與分享本專案於非商業用途；任何商業化使用（包含但不限於付費服務、商業產品整合、企業內部營利用途）需先取得作者 Bruce Yang 的書面授權。

---

> **TOEIC AI Tutor** — 讓 AI 當你的多益家教，每天只要 5 分鐘，單字記得住、聽力聽得懂。

