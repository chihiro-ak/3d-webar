# アクキー・アクスタ AR

iPhone を優先し、`model.glb` を 3D プレビューしたうえで「ARで見る」を押すと純正の AR Quick Look を開くミニマルな静的ページです。GitHub Pages のような静的ホスティングにそのまま置けます。

## できること

- 画面いっぱいの 3D プレビュー
- iPhone では Quick Look 経由で純正 AR を起動
- Android では対応ビューアに引き渡し
- Web UI は 3D オブジェクトと AR 起動導線だけ

## ローカル起動

静的ファイルなので、任意のローカルサーバーで配信すれば動きます。

```powershell
python -m http.server 4173
```

起動後に [http://localhost:4173](http://localhost:4173) を開いてください。

## GitHub Pages で使うとき

- `index.html`
- `model.glb`

この 2 ファイルをルートに置いたまま公開すれば動きます。GitHub Pages は HTTPS なので iPhone / Android ともに AR 起動条件を満たしやすいです。

## 補足

- iPhone ではブラウザ内カメラではなく、Quick Look 側で純正 AR 表示に切り替わります
- ブラウザ仕様上、AR 起動はユーザーのタップ操作が必要です
- `ios-src` は未指定です。`model-viewer` 側の Quick Look 連携を使う構成です
