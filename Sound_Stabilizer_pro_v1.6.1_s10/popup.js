// popup.js 1.6.1 ULTIMATE FULL (All Features Restored)
(function() {
    "use strict";

    const DEFAULT_T = -25, DEFAULT_R = 15, DEFAULT_G = 0.5;
    const MAX_VISIBLE = 60, HISTORY_LIMIT = 500;

    let volInterval = null, chartData = [], isPaused = false;
    let vStart = 0, vEnd = MAX_VISIBLE, isDrag = false, dragX = 0, downTime = 0, dragged = false;

    const el = {
        tS: document.getElementById('thresholdSlider'), tV: document.getElementById('thresholdValue'),
        rS: document.getElementById('ratioSlider'), rV: document.getElementById('ratioValue'),
        gS: document.getElementById('gainSlider'), gV: document.getElementById('gainValue'),
        btn: document.getElementById('toggleButton'), reset: document.getElementById('resetButton'),
        status: document.getElementById('statusArea'), bar: document.getElementById('volumeBar'),
        db: document.getElementById('volumeDbValue'), debug: document.getElementById('debugModeCheckbox'),
        chart: document.getElementById('debugChart')
    };
    const ctx = el.chart?.getContext('2d');

    // --- СЛУЖЕБНЫЕ ФУНКЦИИ ---
    async function sendCmd(action, payload = {}) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) return null;
        try {
            return await chrome.runtime.sendMessage({ action, ...payload, tabId: tab.id });
        } catch (e) { 
            // ИСПРАВЛЕНИЕ ОШИБКИ: Выводим ошибку в консоль вместо пустого .catch()
            console.error(`Error sending command ${action}:`, e);
            return null; 
        }
    }

    async function saveSettings() {
        const settings = { threshold: el.tS.value, ratio: el.rS.value, gain: el.gS.value };
        await chrome.storage.local.set({ 'stabilizerSettings': settings });
    }

    // --- ОТРИСОВКА ГРАФИКА ---

    function draw() {
        if (!ctx || !el.debug.checked) return;
        const { width, height } = el.chart;
        ctx.clearRect(0, 0, width, height);
        
        //Сетка
        ctx.strokeStyle = "rgba(0, 0, 0, 0.05)";
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
            let y = (height / 4) * i;
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
        }

        //Подготовка данных
        const data = chartData.slice(Math.floor(vStart), Math.ceil(vEnd));
        if (data.length < 2) return;
        const step = width / (data.length - 1);

        //Отрисовка линий (Красная - до, Зеленая - после)
        const renderLine = (key, color, lw) => {
            ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineJoin = "round";
            data.forEach((p, i) => {
                const x = i * step, y = height * (1 - (p[key] || 0) / 255);
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.stroke();
        };

        renderLine('pre', '#f44336', 1.5);
        renderLine('post', '#4CAF50', 2.5);

        //курсор "Сейчас"
        if (!isPaused) {
            ctx.strokeStyle = "rgba(0, 0, 0, 0.7)"; // Темно-серый с прозрачностью
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(width - 0.5, 0); // Рисуем строго по правому краю
            ctx.lineTo(width - 0.5, height);
            ctx.stroke();
        }

        //Иконка паузы
        if (isPaused) {
            ctx.fillStyle = "rgba(0,0,0,0.5)";
            ctx.fillRect(width/2 - 8, height/2 - 10, 5, 20);
            ctx.fillRect(width/2 + 3, height/2 - 10, 5, 20);
        }
    }


    function updateBar(v) {
        const p = (v / 255) * 100; el.bar.style.width = Math.min(p, 100) + '%';
        // ИСПРАВЛЕНИЕ dB: Округляем до целых и ограничиваем диапазон для читаемости UI
        let db = v === 0 ? -60 : Math.max(-60, Math.min(0, Math.round(20 * Math.log10(v / 255))));
        el.db.textContent = `${db} dB`;
        el.bar.style.backgroundColor = p > 90 ? '#f44336' : (p > 60 ? '#ffeb3b' : '#4CAF50');
    }

    function startMeter() {
        if (volInterval) return;
        volInterval = setInterval(async () => {
            const res = await sendCmd("getVolume");
            if (res && res.volume !== undefined) {
                updateBar(res.volume);
                if (el.debug.checked && res.debugVolumePre !== null) {
                    chartData.push({ pre: res.debugVolumePre, post: res.volume });
                    if (chartData.length > HISTORY_LIMIT) {
                        chartData.shift();
                        if (isPaused) { vStart = Math.max(0, vStart - 1); vEnd = Math.max(10, vEnd - 1); }
                    }
                    if (!isPaused) {
                        vEnd = chartData.length;
                        vStart = Math.max(0, vEnd - MAX_VISIBLE);
                    }
                    draw();
                }
            }
        }, 50);
    }

    function stopMeter() { clearInterval(volInterval); volInterval = null; }

    // popup.js 1.6.1 ULTIMATE FULL (All Features Restored)
    // --- ПОДСКАЗКИ  ---
    function setupTooltips() {
        document.querySelectorAll('.tooltip-trigger').forEach(trig => {
            trig.onmouseenter = function() {
                const tip = this.closest('.tooltip-container').querySelector('.tooltip-text');
                if (!tip) return;
                
                //откат до fixed позиционирования как в версии 1.5.4
                tip.style.visibility = 'visible'; 
                tip.style.opacity = '1'; 
                tip.style.transform = 'translateY(0)';
                
                const r = this.getBoundingClientRect();
                const pR = document.body.getBoundingClientRect();
                
                // Базовые координаты (справа от иконки)
                let top = r.top;
                let left = r.right + 10;
                
                // Проверка границы
                if (left + tip.offsetWidth > pR.right - 5) {
                    left = r.left - tip.offsetWidth - 10;
                }
                if (left < pR.left + 5) {
                    left = pR.left + 5;
                }
                if (top + tip.offsetHeight > pR.bottom - 5) {
                    top = r.top - tip.offsetHeight - 10;
                }
                if (top < pR.top + 5) {
                    top = pR.top + 5;
                }

                tip.style.left = `${left}px`; 
                tip.style.top = `${top}px`;
            };
            trig.onmouseleave = function() {
                const tip = this.closest('.tooltip-container')?.querySelector('.tooltip-text');
                if (tip) { 
                    tip.style.visibility = 'hidden'; 
                    tip.style.opacity = '0'; 
                    tip.style.transform = 'translateY(10px)'; 
                }
            };
        });
    }

    // --- ИНИЦИАЛИЗАЦИЯ И ОБРАБОТЧИКИ ---
    document.addEventListener('DOMContentLoaded', async () => {
        const store = await chrome.storage.local.get(['stabilizerSettings']);
        const s = store.stabilizerSettings || { threshold: DEFAULT_T, ratio: DEFAULT_R, gain: DEFAULT_G };
        el.tS.value = s.threshold; el.rS.value = s.ratio; el.gS.value = s.gain;
        el.tV.textContent = s.threshold + ' dB'; el.rV.textContent = s.ratio + ' : 1'; el.gV.textContent = s.gain + ' x';

        const sRes = await sendCmd("getStatus");
        if (sRes && sRes.status === 'on') { updateUI('on'); }

        function updateUI(status) {
            if (status === 'on') {
                el.btn.textContent = 'Выключить'; el.status.textContent = 'Статус: Включено';
                el.status.style.backgroundColor = '#e8f5e9'; el.status.style.color = 'green';
                startMeter();
            } else {
                el.btn.textContent = 'Включить'; el.status.textContent = 'Статус: Отключено';
                el.status.style.backgroundColor = '#ffebee'; el.status.style.color = 'red';
                stopMeter(); updateBar(0);
            }
        }

        el.btn.onclick = async () => {
            el.btn.textContent = "Ждем...";
            const r = await sendCmd("toggleStabilizer");
            if (r && r.status) {
                updateUI(r.status);
            } else {
                 updateUI('off');
            }
        };

        const updateAll = () => {
            const settings = { threshold: el.tS.value, ratio: el.rS.value, gain: el.gS.value };
            sendCmd("updateSettings", { settings });
            saveSettings();
        };

        el.tS.oninput = (e) => { el.tV.textContent = e.target.value + ' dB'; updateAll(); };
        el.rS.oninput = (e) => { el.rV.textContent = e.target.value + ' : 1'; updateAll(); };
        el.gS.oninput = (e) => { el.gV.textContent = e.target.value + ' x'; updateAll(); };
        
        el.reset.onclick = async () => {
            el.tS.value = DEFAULT_T; el.rS.value = DEFAULT_R; el.gS.value = DEFAULT_G;
            el.tV.textContent = DEFAULT_T + ' dB'; el.rV.textContent = DEFAULT_R + ' : 1'; el.gV.textContent = DEFAULT_G + ' x';
            updateAll();
        };

        el.debug.onchange = (e) => {
            if(!e.target.checked) { chartData = []; ctx.clearRect(0,0,el.chart.width,el.chart.height); }
            sendCmd("setDebugMode", { enabled: e.target.checked });
        };

        // --- ИНТЕРАКТИВ ГРАФИКА ---
        el.chart.addEventListener('mousedown', (e) => {
            if (el.debug.checked) {
                isDrag = true; dragged = false;
                dragX = e.clientX; downTime = Date.now();
                el.chart.style.cursor = 'grabbing';
            }
        });

        window.addEventListener('mouseup', () => {
            if (isDrag) {
                isDrag = false; el.chart.style.cursor = 'crosshair';
                if (Date.now() - downTime < 250 && !dragged && el.debug.checked) {
                    isPaused = !isPaused;
                    if (!isPaused) { vEnd = chartData.length; vStart = Math.max(0, vEnd - MAX_VISIBLE); }
                    draw();
                }
            }
        });

        el.chart.addEventListener('mousemove', (e) => {
            if (isDrag && isPaused) {
                const dx = e.clientX - dragX;
                if (Math.abs(dx) > 2) {
                    dragged = true;
                    const range = vEnd - vStart;
                    const shift = (dx / el.chart.width) * range;
                    if (vStart - shift >= 0 && vEnd - shift <= chartData.length) {
                        vStart -= shift; vEnd -= shift; dragX = e.clientX; draw();
                    }
                }
            }
        });

        el.chart.addEventListener('wheel', (e) => {
            if (!el.debug.checked || chartData.length < 10) return;
            e.preventDefault();
            const zoom = e.deltaY < 0 ? 0.8 : 1.2;
            const range = vEnd - vStart;
            let nR = Math.max(10, Math.min(chartData.length, range * zoom));
            vStart = vEnd - nR;
            if (vStart < 0) { vStart = 0; vEnd = Math.min(chartData.length, nR); }
            draw();
        }, { passive: false });

        setupTooltips();
    });
})();
