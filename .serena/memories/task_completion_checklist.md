# Task Completion Checklist for wtb

## Before Committing Changes

### 1. Type Checking
```bash
npm run typecheck
```
- TypeScriptコンパイルエラーがないことを確認
- 必須：エラーがあれば修正

### 2. Code Quality
```bash
npm run check
```
- Biomeでリント・フォーマット自動修正
- 警告がないことを確認

### 3. Build Verification
```bash
npm run build
```
- コンパイル成功を確認
- dist/ディレクトリに出力されることを確認

### 4. Test Execution
```bash
npm run test:run
```
- 全テストがパスすることを確認
- 新機能にはテストを追加

### 5. Functional Testing
```bash
# sampleディレクトリで動作確認
cd sample
../dist/index.js status
../dist/index.js create test-branch
../dist/index.js remove test-branch
```

## 変更時の注意事項

### 型定義を変更した場合 (src/types/index.ts)
- 関連するテストファイルの更新を忘れずに
- DEFAULT_CONFIG (constants/index.ts) の更新
- loader.ts の mergeWithDefaults 関数の更新
- validator.ts のバリデーション追加

### コマンドを追加/変更した場合 (src/cli/commands/)
- src/cli/index.ts でコマンド登録を確認
- README.md のコマンド説明を更新

### 設定項目を追加した場合
1. types/index.ts - WtbConfig に型追加
2. constants/index.ts - DEFAULT_CONFIG にデフォルト値追加
3. core/config/loader.ts - mergeWithDefaults 更新
4. core/config/validator.ts - バリデーション追加
5. テストファイルのモックデータ更新
