// background.js

// 1. 拡張機能がインストール・更新された時の処理
chrome.runtime.onInstalled.addListener((details) => {

    // --- アップデート時のみアラートを出す ---
    if (details.reason === chrome.runtime.OnInstalledReason.UPDATE) {
        // ※ Service Worker内では alert() が直接使えないため、通知（notifications）を使用
        chrome.notifications.create({
            type: "basic",
            iconUrl: "img/icon128.png",
            title: chrome.i18n.getMessage("i18n_bgUpdateTitle"), // 「アップデート完了」
            message: chrome.i18n.getMessage("i18n_bgUpdateMessage") // 「「カギ付きブックマーク」がアップデートされました。うまく引き継げない場合は、再インストールを推奨します。（※再インストールした場合は、保存されていたすべてのデータはリセットされます）」
        });
    }
});