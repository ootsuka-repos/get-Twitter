X Profile Scraper (No API)
=================================

Chrome拡張機能です。X (Twitter) のプロフィールページをスクロールしながら、
APIを使わずにツイート本文とメタデータ(いいね/リポスト/返信/表示回数 等)を収集し、
CSVでダウンロードします。

インストール手順
-----------------
- Chromeで `chrome://extensions/` を開き「デベロッパーモード」をONにします。
- 「パッケージ化されていない拡張機能を読み込む」から、このフォルダ(`extension/`)を選択します。

使い方
------
1) Xのプロフィールページ(例: https://x.com/ootsuka_techs) を開きます。
2) 拡張機能のアイコンをクリックし、
   - 取得上限(ツイート数)
   - スクロール間隔(ms)
   - 「このプロフィール本人のツイートのみ」
   を設定して「開始」。
3) 収集が進むと「収集数」が増えます。止める場合は「停止」。
4) 「CSV出力」で `x-<ユーザー>-tweets-<日時>.csv` をダウンロードします。

取得する列
----------
- tweet_id, url, author_handle, created_at, tweet_type
- like_count, retweet_count, reply_count, view_count, bookmark_count
- has_photo, has_video, text

注意・制限
----------
- 未ログインやUI変更により取得できないメタデータが出る可能性があります。
- XのDOMは頻繁に変わるため、将来的にセレクタ調整が必要になる場合があります。
- 利用規約と対象サイトのrobots/利用条件に従い、自己責任でご利用ください。

