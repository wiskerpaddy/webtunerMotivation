// --- グローバル変数の整理（二重定義を防ぐ） ---
let mic, analyser, updateInterval;
let mode = 'piano'; 
let stableFrames = 0;
let lastNoteTime = 0;
let shoutTimer = null;
let currentBarWidth = 0;
let continuousSoundTime = 0; 
let hasShoutedFourBeats = false;
// テンポ80の4拍分 = 3.0秒 (3000ms)
const TARGETTIME = 3000; 

const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const messages = [
    "キレてる！", 
    "デカい！", 
    "腹筋板チョコ！", 
    "肩にちっちゃい重機乗せてんのかい！",
    "大胸筋が歩いてる！",
    "背中に鬼の顔が宿ってる！",
    "血管が地図帳！",
    "音が重戦車級！",
    "ナイスカッティング！",
    "パワー！！"
];
// モード切り替え
function setMode(m) {
    mode = m;
    document.getElementById('pianoBtn').className = (m === 'piano' ? 'active' : 'inactive');
    document.getElementById('saxBtn').className = (m === 'sax' ? 'active' : 'inactive');
}

// 速度（更新頻度）の変更
function changeSpeed() {
    if (updateInterval) {
        clearInterval(updateInterval);
        const speed = document.getElementById('speedSelect').value;
        updateInterval = setInterval(updateTuner, parseInt(speed));
    }
}

// --- チューナー開始・停止 ---
async function startTuner() {
    const btn = document.getElementById('startBtn');
    
    // activeクラスがあるかどうかでON/OFFを判断
    if (!btn.classList.contains('active')) {
        // --- START処理 ---
        btn.classList.add('active');
        btn.innerText = "STOP / ACTIVE";
        
        await Tone.start();
        mic = new Tone.UserMedia();
        analyser = new Tone.Analyser("waveform", 2048);

        try {
            await mic.open();
            mic.connect(analyser);
            const speed = document.getElementById('speedSelect').value;
            updateInterval = setInterval(updateTuner, parseInt(speed));
        } catch (e) {
            console.error(e);
            alert("マイクの使用が許可されませんでした。");
            btn.classList.remove('active');
            btn.innerText = "LISTEN / START";
        }
    } else {
        // --- STOP処理 ---
        btn.classList.remove('active');
        btn.innerText = "LISTEN / START";
        
        if (mic) {
            mic.close();
            clearInterval(updateInterval);
        }
        
        // 表示のリセット
        document.getElementById('note').innerText = "--";
        document.getElementById('freq').innerText = "0.00 Hz";
        const box = document.getElementById('shout-box');
        if (box) {
            box.innerText = "";
            box.style.opacity = "0";
        }
        updateVolumeMeter(-100);
        stableFrames = 0;
    }
}

// メインループ
function updateTuner() {
    if (!analyser) return;

    const buffer = analyser.getValue();
    const sampleRate = Tone.context.sampleRate;
    const frequency = autoCorrelate(buffer, sampleRate);
    const intervalMs = parseInt(document.getElementById('speedSelect').value);
    
    const canvas = document.getElementById('meter');
    const ctx = canvas.getContext('2d');
    
    // Canvasの解像度調整
    if (canvas.width !== canvas.clientWidth) {
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawScale(ctx, canvas.width, canvas.height);

if (frequency !== -1) {
        lastNoteTime = Date.now();
        continuousSoundTime += intervalMs; 

        // 1. テンポ80の4拍分(3秒)判定
        if (continuousSoundTime >= TARGETTIME && !hasShoutedFourBeats) {
            showShout("4拍完走！ナイスバルク！", true);
            hasShoutedFourBeats = true;
        }

        // 2. 【レア】超ロングトーン（5秒以上）
        if (continuousSoundTime >= 5000 && !hasShoutedLongTone) {
            showShout("肺が鉄鉄鋼の塊か！！", true);
            hasShoutedLongTone = true;
        }

        let midiNum = 12 * Math.log2(frequency / 440) + 69;
        let displayMidiNum = (mode === 'sax') ? midiNum - 3 : midiNum;
        const noteIndex = (Math.round(displayMidiNum) % 12 + 12) % 12;

        document.getElementById('note').innerText = noteNames[noteIndex];
        document.getElementById('freq').innerText = frequency.toFixed(2) + " Hz";

        const perfectPitch = 440 * Math.pow(2, (Math.round(midiNum) - 69) / 12);
        const diff = frequency - perfectPitch;

        drawNeedle(ctx, diff, canvas.width, canvas.height);

        // 3. 【レア】ピッチが完璧（1.0Hz以内を1秒キープ）
        if (Math.abs(diff) < 1.0) {
            perfectPitchTime += intervalMs;
            if (perfectPitchTime >= 1000 && !hasShoutedPerfect) {
                showShout("彫刻のような精密さ！", true);
                hasShoutedPerfect = true;
            }
        } else {
            perfectPitchTime = 0;
        }

        // 音量計算
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
        let db = 20 * Math.log10(Math.sqrt(sum / buffer.length) || 0.000001);
        updateVolumeMeter(db);

        // --- 通常の掛け声判定 ---
        if (Math.abs(diff) <= 10) {
            stableFrames++;
            if (stableFrames === 15) showShout("いいよ！");
            // messages配列からランダムに出る処理などはそのまま維持
        } else {
            stableFrames = 0;
        }

    } else {
        // 音が止まった時のリセット処理
        if (Date.now() - lastNoteTime > 800) {
            document.getElementById('note').innerText = "--";
            stableFrames = 0;
            continuousSoundTime = 0;
            perfectPitchTime = 0;
            hasShoutedFourBeats = false;
            hasShoutedLongTone = false;
            hasShoutedMaxVol = false;
            hasShoutedPerfect = false;
        }
        currentBarWidth = -100;
    }
}

// 以下、ヘルパー関数（autoCorrelate, drawScale, drawNeedle, showShout, updateVolumeMeter）
// ※前回の回答と同じ内容ですが、startTunerが動くようにこれらもJS内に含めてください。

function autoCorrelate(buffer, sampleRate) {
    let size = buffer.length;
    let rms = 0;
    for (let i = 0; i < size; i++) rms += buffer[i] * buffer[i];
    rms = Math.sqrt(rms / size);
    if (rms < 0.01) return -1;
    let r1 = 0, r2 = size - 1, thres = 0.2;
    for (let i = 0; i < size / 2; i++) { if (Math.abs(buffer[i]) < thres) { r1 = i; break; } }
    for (let i = 1; i < size / 2; i++) { if (Math.abs(buffer[size - i]) < thres) { r2 = size - i; break; } }
    let buf = buffer.slice(r1, r2);
    size = buf.length;
    let c = new Array(size).fill(0);
    for (let i = 0; i < size; i++) {
        for (let j = 0; j < size - i; j++) c[i] = c[i] + buf[j] * buf[j + i];
    }
    let d = 0;
    while (c[d] > c[d + 1]) d++;
    let maxval = -1, maxpos = -1;
    for (let i = d; i < size; i++) { if (c[i] > maxval) { maxval = c[i]; maxpos = i; } }
    return sampleRate / maxpos;
}

function drawScale(ctx, w, h) {
    ctx.strokeStyle = "#555";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w / 2, 10); ctx.lineTo(w / 2, h - 10);
    ctx.stroke();
    ctx.fillStyle = "#888";
    ctx.textAlign = "center";
    ctx.fillText("-10Hz", 30, h - 10);
    ctx.fillText("Center", w / 2, h - 10);
    ctx.fillText("+10Hz", w - 30, h - 10);
}

function drawNeedle(ctx, diff, w, h) {
    let ratio = (diff + 10) / 20;
    ratio = Math.max(0, Math.min(1, ratio));
    const x = ratio * w;
    ctx.strokeStyle = Math.abs(diff) <= 10 ? "#00ffcc" : "#ff4444";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x, 20); ctx.lineTo(x, h - 30);
    ctx.stroke();
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fillText((diff > 0 ? "+" : "") + diff.toFixed(1) + " Hz", x, 15);
}

function showShout(text, isBig = false) {
    const box = document.getElementById('shout-box');
    if (!box) return;
    box.innerText = text;
    box.style.fontSize = isBig ? "2.5rem" : "1.5rem";
    box.style.opacity = "1";
    if (shoutTimer) clearTimeout(shoutTimer);
    shoutTimer = setTimeout(() => {
        box.style.opacity = "0";
    }, 3000);
}

function updateVolumeMeter(db) {
    const bar = document.getElementById('volume-bar');
    const dbDisplay = document.getElementById('db-display');
    if (dbDisplay) dbDisplay.innerText = isFinite(db) ? db.toFixed(1) + " dB" : "-100.0 dB";
    if (!bar) return;

    let targetPercent = Math.min(100, Math.max(0, (db + 60) * 1.6));
    if (targetPercent < currentBarWidth) {
        currentBarWidth -= 1.0; 
    } else {
        currentBarWidth = targetPercent;
    }
    bar.style.width = currentBarWidth + "%";

    // --- 色の切り替え ＆ 【レア】最大音量判定 ---
    if (currentBarWidth >= 66.6) {
        bar.style.backgroundColor = "#ff4444";
        if (!hasShoutedMaxVol) {
            showShout("会場の屋根が吹き飛ぶぞ！！", true);
            hasShoutedMaxVol = true;
        }
    } else if (currentBarWidth >= 33.3) {
        bar.style.backgroundColor = "#ffcc00";
    } else {
        bar.style.backgroundColor = "#00ffcc";
    }
}