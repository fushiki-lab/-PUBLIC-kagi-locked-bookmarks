// アクセシビリティ：標準の alert を活用してスクリーンリーダー対応を自動化する仕組み
const originalAlert = window.alert;
window.alert = function (message) {
    const speaker = document.getElementById('globalAudioSpeaker');
    if (speaker) {
        // アラートのテキスト（翻訳後の文字）をそのまま見えない領域にコピー
        speaker.textContent = message;

        // 4秒後に空に戻す
        setTimeout(() => {
            speaker.textContent = '';
        }, 4000);
    }
    // これにより、ブラウザが「aria-live」の変更をスクリーンリーダーに伝える時間が生まれ、確実に音声がトリガーされます
    setTimeout(() => {
        // 本来のブラウザ標準ダイアログも同時に実行
        originalAlert(message);
    }, 100);
};



const DEFAULT_HASH = "9af15b336e6a9619928537df30b2e6a2376569fcf9d7e773eccede65606529a0";
let currentPasswordHash = DEFAULT_HASH;

let isUnlocked = false;
let loginPassword = ""; // リストの暗号化・復号化のため入力されたパスワードを一時的に保持する

// 起動時の処理
// 起動時にストレージから「保存されたパスワード」と「シークレット設定」を読み込む
chrome.storage.local.get(['savedPassword', 'savedPasswordHash', 'isSecret'], async (result) => {
// 1. もし「古い形式(平文)」のパスワードが残っていて、かつ「新しい形式」がまだ無い場合
    if (result.savedPassword && !result.savedPasswordHash) {
        // 古いパスワードをその場でハッシュ化して、新しいキーで保存し直す
        const convertedHash = await generateHash(result.savedPassword);
        
        chrome.storage.local.set({ 
            'savedPasswordHash': convertedHash 
        }, () => {
            // 移行が終わったら、古いデータは消しておく
            chrome.storage.local.remove('savedPassword');
            currentPasswordHash = convertedHash;
            alert(chrome.i18n.getMessage("i18n_alertUpdateSecure")); // 「セキュリティ向上のため、パスワードの保存形式を最新の状態にアップデートしました。」
        });
    } 
    // 2. すでにハッシュ形式がある場合は、それを使う
    else if (result.savedPasswordHash) {
        currentPasswordHash = result.savedPasswordHash; // 保存されていれば上書き
    }
    // シークレット設定（スイッチの状態）を復元
    if (result.isSecret !== undefined) {
        document.getElementById('secretModeSwitch').checked = result.isSecret;
    }
});

// 解除ボタンの処理
document.getElementById('unlockBtn').addEventListener('click', async () => {
    const inputEl = document.getElementById('passInput');
    const errorEl = document.getElementById('errorMessage');
    const input = inputEl.value;

    const inputHash = await generateHash(input); // 入力をハッシュ化


    if (inputHash === currentPasswordHash) { // 変数と比較
        isUnlocked = true;
        loginPassword = input; // ★ログイン成功時にパスワードを記憶！(リストの暗号化・復号化のため)

        
        document.getElementById('first-section').style.display = 'none';
        document.getElementById('second-section').style.display = 'block';

        // アクセシビリティ：新しく表示された「このページを保存」ボタンにフォーカスを移す(パスワード認証が成功しsecond-sectionに移動した際)
        setTimeout(() => {
            const saveBtn = document.getElementById('myButton');
            if (saveBtn) saveBtn.focus();
        }, 50);

        if (currentPasswordHash === DEFAULT_HASH) {
            alert(chrome.i18n.getMessage("i18n_alertDefaultPassWarn")); // 「初期パスワードが使用されています。保護されていない状態です。\nパスワードを変更してください。」
        }

        // Proなら<span>にProと文字を追加
        const isProVerified = await checkProStatus();

        if (isProVerified) {
            const proBadge = document.getElementById('proStatus');
            proBadge.textContent = chrome.i18n.getMessage("i18n_proBadgeText"); // 「Pro版 (英語だとPro)」
            proBadge.style.display = 'inline-block';
        }else {
            // ★ここで区別している
            chrome.storage.local.get(['isPro'], (result) => {
                    if (result.isPro === true) {
                        alert(chrome.i18n.getMessage("i18n_alertProFraudDetect")); // 「不適切な変更を検知したため、Pro版を解除しました。\nライセンスコードを再入力してください。」

                        // falseに戻しておいて、無限に警告されるのを防ぐ
                        chrome.storage.local.set({ 'isPro': false });
                    }
                });
        }

        renderList();
    } else {

        errorEl.textContent = '';
        
        setTimeout(() => {
            errorEl.textContent = chrome.i18n.getMessage("i18n_errorWrongPass"); // 「パスワードが違います」

            // 入力欄をクリア
            inputEl.value = ""; 
        }, 50);

        // スクリーンリーダーがエラーを読み上げる時間を稼ぐため、フォーカス移動を少し遅らせる（500ms程度）
        setTimeout(() => {
            inputEl.focus(); 
        }, 500);

        // 2秒後に非表示に戻す
        setTimeout(() => {
            errorEl.textContent = '';
        }, 2000);
    }
});

// 【入力欄】でエンターキーが押された時の処理
document.getElementById('passInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        
        e.preventDefault();  // デフォルトの挙動（フォーム送信など）を防止する
        // 上で設定した「解除ボタンのクリック処理」をそのまま実行させる
        document.getElementById('unlockBtn').click();
    }
});


// 1. 最初にボタンを取得しておく
const btn = document.getElementById('myButton');

// 2. 保存ボタンのクリックイベント
btn.addEventListener('click', async () => {
    // 保存リストとPro状態を同時に取得
    chrome.storage.local.get(['myBookmarks'], async (result) => {
        let list = [];
        // 既存リストを復号して取得
        if (result.myBookmarks) {
            const decrypted = await decryptData(result.myBookmarks, loginPassword);
            list = JSON.parse(decrypted || "[]");
        }


        const isProVerified = await checkProStatus();

        // 【制限】無料版かつ5件以上なら保存させない
        if (!isProVerified && list.length >= 5) {
            alert(chrome.i18n.getMessage("i18n_errorFreeLimit")); // 「無料版の保存上限（5件）に達しました。Pro版へのアップグレードが必要です。」
            return;
        }

        chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
            const currentTab = tabs[0];
            
            // 保存するデータを「ペア」にする
            const newData = {
                title: currentTab.title, // サイトの名前
                url: currentTab.url      // サイトの住所
            };

            // 保存先を 'myBookmarks' に統一して保存
            list.push(newData); // ペアをリストに追加

            // リスト全体を暗号化してストレージへ
            const encryptedData = await encryptData(JSON.stringify(list), loginPassword);

            chrome.storage.local.set({ myBookmarks: encryptedData }, () => {
                renderList();
            });
        });
    });
});



// シークレットモード切り替えスイッチが操作された時の保存処理
document.getElementById('secretModeSwitch').addEventListener('change', (e) => {
    chrome.storage.local.set({ 'isSecret': e.target.checked });
});

//--- パスワード変更ボタンの処理 ---
// HTMLに追加した「changePassBtn」をクリックした時の動き
document.getElementById('changePassBtn').addEventListener('click', async () => {
    const newPass = document.getElementById('newPassInput').value;
    const confirmPass = document.getElementById('newPassConfirm').value; // 確認の方の値を取得
    
    // 1. 未入力チェック
    if (newPass.length < 1) {
        alert(chrome.i18n.getMessage("i18n_alertPassEmpty")); // 「新しいパスワードを入力してください」
        return;
    }

    // 2. 一致チェック
    if (newPass !== confirmPass) {
        alert(chrome.i18n.getMessage("i18n_alertPassMismatch")); // 「パスワードが一致しません。もう一度入力してください。」
        return;
    }


    // 1. 現在のデータを古いパスワードで復号して取得
    chrome.storage.local.get(['myBookmarks'], async (result) => {
        let list = [];
        if (result.myBookmarks) {
            const decrypted = await decryptData(result.myBookmarks, loginPassword);
            list = JSON.parse(decrypted || "[]");
        }

        // 2. 新しいパスワードで暗号化し直す
        const newEncryptedData = await encryptData(JSON.stringify(list), newPass);
        const newPassHash = await generateHash(newPass); // 新しいパスワードをハッシュ化


        // 3. 全てOKなら保存
        // 3. 新しいハッシュと、再暗号化されたデータを保存
        chrome.storage.local.set({ 
            'savedPasswordHash': newPassHash,
            'myBookmarks': newEncryptedData 
        }, () => {
            currentPasswordHash = newPassHash;
            loginPassword = newPass; // メモリ上のパスワードも更新！
            alert(chrome.i18n.getMessage("i18n_alertPassUpdateSuccess")); // 「パスワードと保存データを更新しました！」
            document.getElementById('newPassInput').value = "";
            document.getElementById('newPassConfirm').value = "";
        });
    }); // ← これで chrome.storage.local.get の処理がすべて完了
});// ← これで addEventListener の処理が完了


// 3. 画面に表示する関数
function renderList() {
    if (!isUnlocked) return; // ★絶対必要
    
    // 読み込み先を 'myBookmarks' に指定
    chrome.storage.local.get(['myBookmarks'], async (result) => {
        let list = [];
        if (result.myBookmarks) {
            // ストレージに保存されているのが「暗号文」なら復号を試みる
            // 文字列がJSON形式でない（暗号化されている）ことを前提に処理
            const decrypted = await decryptData(result.myBookmarks, loginPassword);
            if (decrypted) {
                list = JSON.parse(decrypted);
            } else {
                // 初回移行時などでまだ暗号化されていない場合
                try {
                    // 保存されているデータが「文字列」か「配列オブジェクト」かを確認してパース
                    const rawData = result.myBookmarks;
                    list = (typeof rawData === 'string') ? JSON.parse(rawData) : rawData;

                    // ★ここが移行の肝！
                    // 取得した「平文のリスト」を、今ログインに使ったパスワードで暗号化して上書き保存する
                    if (Array.isArray(list) && list.length > 0) {
                        const encryptedData = await encryptData(JSON.stringify(list), loginPassword);
                        chrome.storage.local.set({ myBookmarks: encryptedData }, () => {
                            alert(chrome.i18n.getMessage("i18n_alertMigrationSuccess")); // 「以前のブックマークが見つかりました。新しい暗号化形式へ安全に移行しました。」
                        });
                    }
                } catch(e) {
                    alert(chrome.i18n.getMessage("i18n_errorDecryptFailed")); // 「データの復号に失敗しました。セキュリティ設定の不整合が起きています。一度この拡張機能をアンインストールし、再度インストールすることを推奨します。（※保存されていたすべてのデータはリセットされます）」
                    list = [];
                }
            }
        }
        // const list = result.myBookmarks || [];
        const container = document.getElementById('list_container');
        
        // HTML側に要素がない場合のエラー防止
        if (!container) return;


        // ★毎回作り直す
        container.innerHTML = '<ul id="urlList"></ul>';

        const listEl = document.getElementById('urlList');

        // item（タイトルとURLのペア）形式に修正
        list.forEach((item, index) => {
            const li = document.createElement('li');
            
            // --- ロゴ（favicon）部分を追加 ---
            const icon = document.createElement('img');
            // Googleのファビコン取得サービスを利用（URLを最後につなげる）
            // item.url を使用
            icon.src = `https://www.google.com/s2/favicons?domain=${item.url}&sz=32`;
            icon.style.width = "16px";
            icon.style.height = "16px";
            icon.style.marginRight = "8px"; // 右側に少し隙間を作る
            icon.style.verticalAlign = "middle"; // テキストと高さを揃える

            // --- リンク部分 ---
            const a = document.createElement('a');
            a.href = item.url;
            a.textContent = item.title; // 表示をタイトルに
            

            // クリック時の動作をスイッチの状態に合わせて分岐させる
                a.addEventListener('click', (e) => {
                e.preventDefault();
                const url = item.url;
                const isSecretMode = document.getElementById('secretModeSwitch').checked;

                if (isSecretMode) {
                        // 1. まず、今開いているすべてのウィンドウを確認する
                        chrome.windows.getAll({ populate: true }, (windows) => {
                        // 2. その中から「シークレットモード」のウィンドウを1つ探す
                        const secretWindow = windows.find(win => win.incognito);

                        if (secretWindow) {
                                // 3. すでにシークレットウィンドウがあれば、そこに新しいタブを作る
                                chrome.tabs.create({ url: url, windowId: secretWindow.id });
                                // そのウィンドウを最前面に持ってくる（お好みで）
                                chrome.windows.update(secretWindow.id, { focused: true });
                        } else {
                                // 4. なければ、新しくシークレットウィンドウを作る（最初だけ）
                                chrome.windows.create({ url: url, incognito: true });
                        }
                        });
                } else {
                        // 通常モードはそのまま
                        chrome.tabs.create({ url: url });
                }
                });

            // --- 組み立て ---
            li.appendChild(icon); // ロゴを最初に入れる
            li.appendChild(a);
            // (削除ボタンを最後に入れる)
            const delBtn = document.createElement('button');
            delBtn.textContent = '×';
            delBtn.className = 'delete-btn';

            // messages.json からそれぞれの言語の読み上げ用テキストを取得して設定。右のデリートはフォールバック
            const ariaLabelText = chrome.i18n.getMessage("i18n_deleteBtnLabel") || "Delete";
            delBtn.setAttribute('aria-label', ariaLabelText);

            delBtn.addEventListener('click', () => {
                deleteItem(index); 
            });
            li.appendChild(delBtn);

            listEl.appendChild(li);
        });
    });
}

// 4. 削除用の関数
function deleteItem(index) {
    // 削除対象も 'myBookmarks' に指定
    chrome.storage.local.get(['myBookmarks'], async (result) => {
        const decrypted = await decryptData(result.myBookmarks, loginPassword);
        let list = JSON.parse(decrypted || "[]");

        list.splice(index, 1);

        const encryptedData = await encryptData(JSON.stringify(list), loginPassword);

        chrome.storage.local.set({ myBookmarks: encryptedData }, () => {
            renderList();
        });
    });
}


// ポップアップが開いたときに、パスワード入力欄にカーソルを強制的に合わせる
// 100ミリ秒（0.1秒）だけ処理を遅らせて、スクリーンリーダーの混乱を防ぐ
setTimeout(() => {
    const passInput = document.getElementById('passInput');
    if (passInput) passInput.focus();
}, 100);

// --- テーマ切り替え処理 ---
// 各ボタンにクラスの付け替えを命じる
document.getElementById('setStandard').addEventListener('click', () => updateTheme(''));
document.getElementById('setDark').addEventListener('click', () => updateTheme('dark-theme'));
document.getElementById('setFlower').addEventListener('click', () => updateTheme('flower-theme'));

// クラスを付け替えて、設定を保存する関数
function updateTheme(themeName) {
    document.body.className = themeName;
    chrome.storage.local.set({ 'selectedTheme': themeName });
}

// 拡張機能を開いた時に、最後に選んだテーマを自動で適用する
chrome.storage.local.get('selectedTheme', (data) => {
    if (data.selectedTheme) {
        document.body.className = data.selectedTheme;
    }
});


/* --- ライセンス認証関連 --- */

// 1. ハッシュ化を行う関数（Web Crypto APIを使用）
// 外部サーバーを使わず、ブラウザ内で安全にハッシュ計算を行います
async function generateHash(message) {
    const encoder = new TextEncoder();
    const data = encoder.encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// 2. ライセンス認証ボタンの処理
document.getElementById('activateBtn').addEventListener('click', async () => {
    const inputKey = document.getElementById('licenseInput').value.trim();
    if (!inputKey) return;

    const hashedInput = await generateHash(inputKey);

    // ハッシュ値をここに貼る
    const CORRECT_HASH = "7abd4f617ab217d17c4201d2450d725ddc40a61855cab8958e61b7dea1718606"; 

    if (hashedInput === CORRECT_HASH) {

// 現在の環境のユーザー固有ソルトを取得（なければその場で安全に自動生成）
        const saltUint8 = await getOrCreateSalt();
        // ハッシュ生成の文字列として結合するためにBase64形式に変換
        const userSaltStr = btoa(String.fromCharCode(...saltUint8));

        // 「ライセンスキーのハッシュ値 + ユーザー固有ソルト + 固定文字列」でこの環境専用のトークンを生成
        const proToken = await generateHash(CORRECT_HASH + userSaltStr + "pro_secure");


        chrome.storage.local.set({ 'isPro': true, 'proToken': proToken }, () => {
            alert(chrome.i18n.getMessage("i18n_alertLicenseSuccess")); // 「Pro版が有効になりました！」

            // alertがトリガーされる時間（100ms）より少し長く待ってからリロードする
            setTimeout(() => {
                location.reload(); // 画面を更新して制限を解除
            }, 200);
        });
    } else {
        alert(chrome.i18n.getMessage("i18n_alertLicenseInvalid")); // 「ライセンスキーが無効です。」
    }
});

// 拡張機能のバージョンを表示する処理
const manifestData = chrome.runtime.getManifest();
const versionDisplayEl = document.getElementById('versionDisplay');
if (versionDisplayEl) {
    versionDisplayEl.textContent = `Version ${manifestData.version}`;
}



// --- Pro版の不正書き換えをチェックする共通関数 ---
async function checkProStatus() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['isPro', 'proToken', 'userSalt'], async (result) => {
            // isProがtrueでも、proTokenやuserSaltが無ければ不正とみなす

            // どれか1つでも無い場合はそもそも計算せずfalseにする。無料版ユーザーはここではじかれる
            if (!result.isPro || !result.proToken || !result.userSalt) {
                resolve(false);
                return;
            }

            // 【改ざんチェック】
            // 現在の環境の userSalt（Base64文字列）と CORRECT_HASH を掛け合わせて、
            // この環境専用のトークンをその場で計算する
            const CORRECT_HASH = "7abd4f617ab217d17c4201d2450d725ddc40a61855cab8958e61b7dea1718606";
            const expectedToken = await generateHash(CORRECT_HASH + result.userSalt + "pro_secure");

            // ストレージに保存されているトークンが、今計算した正規トークンと一致するか
            if (result.proToken === expectedToken) {
                resolve(true); // 正真正銘のPro版
            } else {
                resolve(false); // デベロッパーツール等による書き換え、または別環境からのコピー
            }
        });
    });
}


// --- 暗号化・復号の共通処理 ---
// ストレージからソルトを取得し、なければ生成して保存する関数
async function getOrCreateSalt() {
    const result = await chrome.storage.local.get(['userSalt']);
    if (result.userSalt) {
        // 保存されているBase64形式をUint8Arrayに戻して返す
        return new Uint8Array(atob(result.userSalt).split("").map(c => c.charCodeAt(0)));
    } else {
        // 新しく16バイトのランダム値を生成
        const newSalt = crypto.getRandomValues(new Uint8Array(16));
        // 保存用にBase64に変換
        const saltBase64 = btoa(String.fromCharCode(...newSalt));
        await chrome.storage.local.set({ 'userSalt': saltBase64 });
        return newSalt;
    }
}

// 1. テキストを暗号化する
async function encryptData(text, password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const salt = await getOrCreateSalt();

    // 暗号化・復号のためのカギを導出---------------------------------------------------------------------------
    // 準備
    const keyMaterial = await crypto.subtle.importKey(
        "raw", encoder.encode(password), { name: "PBKDF2" }, false, ["deriveKey"]
    );

    // 実際にカギを導出
    const key = await crypto.subtle.deriveKey(
        { name: "PBKDF2", salt: salt, iterations: 100000, hash: "SHA-256" },
        keyMaterial, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
    );
    // カギ導出ここまで-----------------------------------------------------------------------------------

    // ランダムなivを作成（同じデータでもivが違えば違う暗号結果になる）
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // 暗号化ここから
    const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, data);
    // 暗号化ここまで

    // ivと暗号化したデータをくっつけて保存（復号時に必要だから）
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);

    // バイナリから文字列に変えて保存できる形式にする
    return btoa(String.fromCharCode(...combined));
}

// 2. 暗号化されたデータを復号する
async function decryptData(base64Data, password) {
    try {
        const encoder = new TextEncoder();
        const combined = new Uint8Array(atob(base64Data).split("").map(c => c.charCodeAt(0)));
        const iv = combined.slice(0, 12);
        const data = combined.slice(12);

        const salt = await getOrCreateSalt();

        // 暗号化・復号のためのカギを導出---------------------------------------------------------------------------
        // 準備
        const keyMaterial = await crypto.subtle.importKey(
            "raw", encoder.encode(password), { name: "PBKDF2" }, false, ["deriveKey"]
        );

        // 実際にカギを導出
        const key = await crypto.subtle.deriveKey(
            { name: "PBKDF2", salt: salt, iterations: 100000, hash: "SHA-256" },
            keyMaterial, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
        );
        // カギ導出ここまで-----------------------------------------------------------------------------------


        // 復号ここから（カギとivの2つを使い復号）
        const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, key, data);
        // 復号ここまで

        return new TextDecoder().decode(decrypted);
    } catch (e) {
        return null; // パスワード・IV・データのいずれかが不正な場合は復号失敗
    }
}

// 多言語化（国際化）の適用処理
function applyLocalization() {
    // ページ内にある「data-i18n」属性がついたタグをすべて引き連れてくる
    document.querySelectorAll('[data-i18n]').forEach(element => {
        // タグに書かれている固有の名前（"passAuth" や "unlock" など）を取得する
        const key = element.getAttribute('data-i18n');
        
        // messages.json から、その名前に対応する翻訳メッセージ（日本語か英語）を取ってくる
        const message = chrome.i18n.getMessage(key);
        
        // もし翻訳が見つかったら、タグの中身を書き換える
        if (message) {
            element.textContent = message;
            // 翻訳が見つかったときのみ、lang属性の切り替えを行う
            syncHtmlLang();
        }
    });

    // ページ内にある「data-i18n-placeholder」属性がついたタグをすべて引き連れてくる
    document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
        // タグに書かれている固有の名前（"i18n_placeholderPass" など）を取得する
        const key = element.getAttribute('data-i18n-placeholder');
        
        // messages.json から、その名前に対応する翻訳メッセージ（日本語か英語）を取ってくる
        const message = chrome.i18n.getMessage(key);
        
        // もし翻訳が見つかったら、入力欄のヒント文字を書き換える
        if (message) {
            element.placeholder = message;
            // 翻訳が見つかったときのみ、lang属性の切り替えを行う
            syncHtmlLang();
        }
    });
}

// アクセシビリティ：適切な HTML lang 属性を判定して切り替える補助関数
function syncHtmlLang() {
    // 現在のユーザーのブラウザ言語（ja, en, fr など）を取得
    const currentLocale = chrome.i18n.getMessage("@@ui_locale");
    
    // 基本は en にフォールバックする設定
    let targetLang = "en";
    if (currentLocale.startsWith("ja")) {
        targetLang = "ja";
    } else if (currentLocale.startsWith("en")) {
        targetLang = "en";
    }

    // ★ document.documentElement を使うことで、<html>タグの lang="~" を直接書き換えます
    if (document.documentElement.lang !== targetLang) {
        document.documentElement.lang = targetLang;
    }
}


// ポップアップが開いたときにapplyLocalization()を実行する
document.addEventListener('DOMContentLoaded', applyLocalization);
