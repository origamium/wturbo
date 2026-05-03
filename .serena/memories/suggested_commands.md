# Suggested Commands for wtb Development

## Development Commands
```bash
npm run dev          # 開発モードで実行 (tsx)
npm run build        # TypeScriptコンパイル
npm start            # コンパイル済みCLI実行
```

## Code Quality Commands
```bash
npm run lint         # Biomeでリント
npm run format       # Biomeでフォーマット
npm run check        # リント+フォーマット (--write)
npm run typecheck    # 型チェックのみ
```

## Testing Commands
```bash
npm test             # Vitestでテスト実行（ウォッチモード）
npm run test:run     # テスト一回実行
npm run test:ui      # Vitest UI
```

## CLI Usage
```bash
# 開発中
node dist/index.js create feature/xxx
node dist/index.js remove feature/xxx
node dist/index.js status

# グローバルインストール後
wtb create feature/xxx
wtb remove feature/xxx
wtb status
```

## Sample Project
```bash
cd sample
../dist/index.js create feature/test    # worktree作成テスト
../dist/index.js remove feature/test    # worktree削除テスト
docker compose up -d                    # サービス起動
docker compose down                     # サービス停止
```

## Task Completion Checklist
タスク完了時は以下の順序で実行：
1. `npm run typecheck` - TypeScriptエラーがないことを確認
2. `npm run check` - フォーマット・リント
3. `npm run build` - ビルド確認
4. `npm run test:run` - テスト実行
