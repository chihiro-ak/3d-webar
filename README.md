# アクキー・アクスタ AR プレビュー

3Dモデルをブラウザで確認し、対応端末ではARで実際のサイズ感を試せる静的アプリです。GitHub Pages のような静的ホスティングにそのまま配置できます。

## できること

- 同梱サンプルの `model.glb` を 3D 表示
- 手元の GLB / GLTF をその場で読み込んで確認
- 高さ(cm)を指定して実寸スケールに調整
- Android では WebXR / Scene Viewer、iPhone では Quick Look で AR 表示

## ローカル起動

静的ファイルなので、任意のローカルサーバーで配信すれば動きます。

```powershell
python -m http.server 4173
```

起動後に [http://localhost:4173](http://localhost:4173) を開いてください。

## GitHub Pages で使うとき

- `index.html`
- `model.glb`

この 2 ファイルをルートに置いたまま公開すれば動きます。

## 補足

- AR は HTTPS 配信と対応端末が必要です
- `ios-src` は未指定です。`model-viewer` 側で Quick Look 用 USDZ を自動生成するため、静的配信でも iPhone で試しやすい構成です
- ローカルで読み込んだモデルはブラウザ内だけで使われ、デプロイ内容には含まれません
