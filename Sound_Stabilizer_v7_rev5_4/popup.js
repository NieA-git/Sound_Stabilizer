// popup.js v33 (Финальный рабочий код с исправленными ошибками и согласованным UI)

const DEFAULT_THRESHOLD = -25; 
const DEFAULT_RATIO = 15; 
const DEFAULT_GAIN = 0.5;      
let popupVolumeInterval = null; 
const debugModeCheckbox = document.getElementById('debugModeCheckbox');
const debugChartCanvas = document.getElementById('debugChart');
const debugCtx = debugChartCanvas ? debugChartCanvas.getContext('2d') : null;

let chartData = [];
const MAX_CHART_POINTS = 60;
let isChartPaused = false; 
let viewStart = 0;
let viewEnd = MAX_CHART_POINTS;
let isDragging = false;
let dragged = false; 
let dragStartX = 0;
let mouseDownTime = 0; 

function normalizeVolumeToDb(volumeRaw) {
    if (volumeRaw === 0) return -60;
    let db = 20 * Math.log10(volumeRaw / 255);
    return Math.max(-60, Math.round(db));
}

function drawDebugChart() {
    const chartWidth = debugChartCanvas.width;
    const chartHeight = debugChartCanvas.height;
    
    if (!debugCtx || !debugModeCheckbox.checked) return;
    
    // Очистка холста БЕЗ отрисовки сетки (сетка реализована в HTML/CSS)
    debugCtx.clearRect(0, 0, debugChartCanvas.width, chartHeight);
    
    // Отрисовка данных графика (Красный - до, Зеленый - после)
    const visibleData = chartData.slice(Math.floor(viewStart), Math.ceil(viewEnd));
    if (visibleData.length >= 2) {
        const widthStep = chartWidth / (visibleData.length - 1);
        visibleData.forEach((point, index) => {
            if (index === 0) return;
            const x1 = widthStep * (index - 1); const x2 = widthStep * index;
            const y1_pre = chartHeight * (1 - visibleData[index - 1].pre / 255); const y2_pre = chartHeight * (1 - point.pre / 255);
            const y1_post = chartHeight * (1 - visibleData[index - 1].post / 255); const y2_post = chartHeight * (1 - point.post / 255);
            debugCtx.strokeStyle = '#f44336'; debugCtx.beginPath(); debugCtx.moveTo(x1, y1_pre); debugCtx.lineTo(x2, y2_pre); debugCtx.stroke();
            debugCtx.strokeStyle = '#4CAF50'; debugCtx.beginPath(); debugCtx.moveTo(x1, y1_post); debugCtx.lineTo(x2, y2_post); debugCtx.stroke();
        });
    }
    
    // Отрисовка черной полупрозрачной иконки паузы
    if (isChartPaused && debugCtx) {
        debugCtx.save();
        debugCtx.globalAlpha = 0.8;
        debugCtx.fillStyle = '#000000';
        const iconX = 10; const iconY = 10; const barWidth = 8; const iconHeight = 30; const gap = 4;
        debugCtx.fillRect(iconX, iconY, barWidth, iconHeight);
        debugCtx.fillRect(iconX + barWidth + gap, iconY, barWidth, iconHeight);
        debugCtx.restore();
    }
}

function updateDebugChartData(preVolume, postVolume) {
    if (!debugModeCheckbox.checked) return;
    chartData.push({ pre: preVolume, post: postVolume });
    if (!isChartPaused) { if (chartData.length > MAX_CHART_POINTS) { viewStart += 1; viewEnd += 1; } }
    const maxDataHistory = 500;
    if (chartData.length > maxDataHistory) {
        const removeCount = chartData.length - maxDataHistory;
        chartData.splice(0, removeCount);
        viewStart = Math.max(0, viewStart - removeCount);
        viewEnd = Math.max(MAX_CHART_POINTS, viewEnd - removeCount);
    }
    drawDebugChart();
}

debugModeCheckbox.addEventListener('change', async (e) => {
    const isEnabled = e.target.checked;
    const tabsArray = await chrome.tabs.query({active: true, currentWindow: true});

    if (tabsArray && tabsArray.length > 0) {
        const activeTab = tabsArray[0];
        const tabId = activeTab.id;

        if (activeTab.url.startsWith('chrome://') || activeTab.url.startsWith('chrome-extension://')) {
             if (!isEnabled) { updateUI('off'); } return; 
        }
        try {
            await chrome.runtime.sendMessage({ action: "setDebugMode", enabled: isEnabled, tabId: tabId }); 
        } catch (error) { console.warn("Ошибка при отправке setDebugMode (Async):", error.message); }
    }
    if (!isEnabled) {
        chartData = []; viewStart = 0; viewEnd = MAX_CHART_POINTS;
        if (debugCtx) debugCtx.clearRect(0, 0, debugChartCanvas.width, debugChartCanvas.height);
    }
});

debugChartCanvas.addEventListener('mousedown', (event) => { 
    if (debugModeCheckbox.checked) { 
        isDragging = true; dragged = false; 
        dragStartX = event.clientX; mouseDownTime = Date.now(); 
        debugChartCanvas.style.cursor = 'grabbing'; 
    } 
});

debugChartCanvas.addEventListener('mousemove', (event) => { 
    if (isDragging && isChartPaused) { 
        if (Math.abs(event.clientX - dragStartX) > 5) { dragged = true; }
        const dragDeltaX = event.clientX - dragStartX; const panSensitivity = (viewEnd - viewStart) / debugChartCanvas.width; 
        const panAmount = dragDeltaX * panSensitivity * -1; 
        viewStart += panAmount; viewEnd += panAmount; 
        if (viewStart < 0) { viewStart = 0; viewEnd = Math.min(chartData.length, MAX_CHART_POINTS); } 
        if (viewEnd > chartData.length) { viewEnd = chartData.length; viewStart = Math.max(0, viewEnd - MAX_CHART_POINTS); } 
        dragStartX = event.clientX;
        drawDebugChart(); 
    }
});

window.addEventListener('mouseup', () => { 
    if (isDragging) { 
        isDragging = false; debugChartCanvas.style.cursor = 'crosshair'; 
        const clickDuration = Date.now() - mouseDownTime; 
        const isQuickClick = clickDuration < 300; 

        if (isQuickClick && !dragged && debugModeCheckbox.checked) {
            isChartPaused = !isChartPaused; 
            if (!isChartPaused) { viewEnd = chartData.length; viewStart = Math.max(0, viewEnd - MAX_CHART_POINTS); } 
            drawDebugChart(); 
        }
    }
    dragged = false;
});

debugChartCanvas.addEventListener('wheel', (event) => { 
    if (debugModeCheckbox.checked) { 
        event.preventDefault(); 
        const zoomFactor = 0.1; const delta = event.deltaY < 0 ? (1 + zoomFactor) : (1 - zoomFactor); 
        const currentRange = viewEnd - viewStart; 
        let newRange = currentRange * delta; 
        newRange = Math.max(10, Math.min(chartData.length || MAX_CHART_POINTS, newRange)); 
        viewStart = viewEnd - newRange; 
        if (viewStart < 0) { viewStart = 0; viewEnd = Math.min(chartData.length, newRange); } 
        if (viewEnd > chartData.length) { viewEnd = chartData.length; viewStart = Math.max(0, viewEnd - newRange); } 
        drawDebugChart(); 
    } 
});

function updateUI(status) {
    const button = document.getElementById('toggleButton'); const statusArea = document.getElementById('statusArea');
    if (status === 'on') { button.textContent = 'Выключить'; statusArea.textContent = 'Статус: Включено'; statusArea.style.backgroundColor = '#e8f5e9'; statusArea.style.color = 'green'; startPopupVolumeMeter(); } else { button.textContent = 'Включить'; statusArea.textContent = 'Статус: Отключено'; statusArea.style.backgroundColor = '#ffebee'; statusArea.style.color = 'red'; updateVolumeBar(0); stopPopupVolumeMeter(); }
}

async function sendSettingsToContentScript() {
    const threshold = document.getElementById('thresholdSlider').value; const ratio = document.getElementById('ratioSlider').value; const gain = document.getElementById('gainSlider').value;
    const tabs = await chrome.tabs.query({active: true, currentWindow: true});
    if (tabs && tabs.length > 0) {
        try {
            await chrome.runtime.sendMessage({ action: "updateSettings", settings: { threshold: threshold, ratio: ratio, gain: gain }, tabId: tabs[0].id });
        } catch (error) { console.warn("Ошибка при отправке updateSettings (Async):", error.message); }
    }
}

async function loadSettingsAndStatusFromContentScript() {
    const tabs = await chrome.tabs.query({active: true, currentWindow: true});
    if (tabs && tabs.length > 0) {
        const tabId = tabs[0].id;
        try {
            const settingsResponse = await chrome.tabs.sendMessage(tabId, {action: "getSettings"});
            if (settingsResponse && settingsResponse.settings) {
                document.getElementById('thresholdSlider').value = settingsResponse.settings.threshold; document.getElementById('thresholdValue').textContent = `${settingsResponse.settings.threshold} dB`;
                document.getElementById('ratioSlider').value = settingsResponse.settings.ratio; document.getElementById('ratioValue').textContent = `${settingsResponse.settings.ratio} : 1`;
                document.getElementById('gainSlider').value = settingsResponse.settings.gain; document.getElementById('gainValue').textContent = `${settingsResponse.settings.gain} x`;
            }
            const statusResponse = await chrome.tabs.sendMessage(tabId, {action: "getStatus"});
            if (statusResponse && statusResponse.status) { updateUI(statusResponse.status); }
        } catch (error) { 
            console.warn("Ошибка при запросе настроек/статуса (Async):", error.message); 
            updateUI('off');
        }
    }
}

function initializeUISettings() {
    document.getElementById('thresholdSlider').value = DEFAULT_THRESHOLD; document.getElementById('thresholdValue').textContent = `${DEFAULT_THRESHOLD} dB`;
    document.getElementById('ratioSlider').value = DEFAULT_RATIO; document.getElementById('ratioValue').textContent = `${DEFAULT_RATIO} : 1`;
    document.getElementById('gainSlider').value = DEFAULT_GAIN; document.getElementById('gainValue').textContent = `${DEFAULT_GAIN} x`;
}

document.getElementById('toggleButton').addEventListener('click', async () => {
    const tabs = await chrome.tabs.query({active: true, currentWindow: true});
    if (tabs && tabs.length > 0) {
        try {
            const response = await chrome.runtime.sendMessage({ action: "toggleStabilizer", tabId: tabs[0].id });
            if (response && response.status) {
                updateUI(response.status);
                if (response.status === 'on') { sendSettingsToContentScript(); }
            }
        } catch (error) { console.warn("Ошибка при отправке toggleStabilizer (Async):", error.message); }
    }
});

document.getElementById('resetButton').addEventListener('click', () => { 
    chrome.tabs.query({active: true, currentWindow: true}).then(tabs => {
        if (tabs && tabs.length > 0 && (tabs[0].url.startsWith('chrome://') || tabs[0].url.startsWith('chrome-extension://'))) return;
        initializeUISettings(); sendSettingsToContentScript(); 
    });
});
document.getElementById('thresholdSlider').addEventListener('input', (e) => { document.getElementById('thresholdValue').textContent = `${e.target.value} dB`; sendSettingsToContentScript(); });
document.getElementById('ratioSlider').addEventListener('input', (e) => { document.getElementById('ratioValue').textContent = `${e.target.value} : 1`; sendSettingsToContentScript(); });
document.getElementById('gainSlider').addEventListener('input', (e) => { document.getElementById('gainValue').textContent = `${e.target.value} x`; sendSettingsToContentScript(); });

function updateVolumeBar(volume) {
    const volumeBar = document.getElementById('volumeBar'); const volumeDbValue = document.getElementById('volumeDbValue');
    if (!volumeBar || !volumeDbValue) return;
    const percentage = (volume / 255) * 100; volumeBar.style.width = Math.min(percentage, 100) + '%'; volumeDbValue.textContent = `${normalizeVolumeToDb(volume)} dB`;
    if (percentage > 90) { volumeBar.style.backgroundColor = '#f44336'; } else if (percentage > 60) { volumeBar.style.backgroundColor = '#ffeb3b'; } else { volumeBar.style.backgroundColor = '#4CAF50'; }
}

function startPopupVolumeMeter() {
    if (popupVolumeInterval) return;
    popupVolumeInterval = setInterval(async () => {
        const tabs = await chrome.tabs.query({active: true, currentWindow: true});
        if (tabs && tabs.length > 0) {
            try {
                const response = await chrome.runtime.sendMessage({ action: "getVolume", tabId: tabs[0].id });
                if (response && response.volume !== undefined) {
                    updateVolumeBar(response.volume);
                    if (response.debugVolumePre !== null && debugModeCheckbox.checked) {
                        updateDebugChartData(response.debugVolumePre, response.volume);
                    }
                }
            } catch (error) { console.warn("Ошибка при запросе getVolume (Async):", error.message); stopPopupVolumeMeter(); }
        }
    }, 50); 
}

function stopPopupVolumeMeter() {
    if (popupVolumeInterval) {
        clearInterval(popupVolumeInterval); popupVolumeInterval = null;
        updateVolumeBar(0); chartData = []; isChartPaused = false; viewStart = 0; viewEnd = MAX_CHART_POINTS;
        if (debugCtx) debugCtx.clearRect(0, 0, debugChartCanvas.width, debugChartCanvas.height);
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const tabs = await chrome.tabs.query({active: true, currentWindow: true});
    if (tabs && tabs.length > 0) {
        const activeTab = tabs[0];
        
        if (activeTab.url.startsWith('chrome://') || activeTab.url.startsWith('chrome-extension://')) {
            document.getElementById('statusArea').textContent = 'Статус: Недоступно на служебных страницах Chrome';
            updateUI('off');
            return;
        }

        try {
             await chrome.scripting.executeScript({
                target: { tabId: activeTab.id },
                files: ['injected_script.js']
            });
        } catch (error) {
            console.error("Критическая ошибка инжекции injected_script.js:", error);
            document.getElementById('statusArea').textContent = 'Ошибка инициализации скрипта';
            return;
        }
    }
    
    initializeUISettings(); 
    await loadSettingsAndStatusFromContentScript(); 
    setupTooltipPositioning(); 
});


// ИСПРАВЛЕННАЯ ФУНКЦИЯ ДЛЯ КОРРЕКТНОГО ОТОБРАЖЕНИЯ ПОДСКАЗОК С УЧЕТОМ ВСЕХ 4 КРАЕВ
function setupTooltipPositioning() {
    const tooltipTriggers = document.querySelectorAll('.tooltip-trigger'); 
    const TOOLTIP_OFFSET = 10; 

    tooltipTriggers.forEach(trigger => {
        trigger.addEventListener('mouseenter', function() {
            const tooltipContainer = this.closest('.tooltip-container');
            const tooltipText = tooltipContainer ? tooltipContainer.querySelector('.tooltip-text') : null;
            
            if (!tooltipText) return;

            tooltipText.style.visibility = 'visible'; 
            tooltipText.style.opacity = '1';
            tooltipText.style.transform = 'translateY(0)'; 

            const triggerRect = this.getBoundingClientRect(); 
            const popupRect = document.body.getBoundingClientRect();

            let top = triggerRect.top; 
            let left = triggerRect.right + TOOLTIP_OFFSET; 

            if (left + tooltipText.offsetWidth > popupRect.right - 5) {
                left = triggerRect.left - tooltipText.offsetWidth - TOOLTIP_OFFSET;
            }
            
            if (left < popupRect.left + 5) {
                 left = popupRect.left + 5;
            }

            if (top + tooltipText.offsetHeight > popupRect.bottom - 5) {
                top = triggerRect.top - tooltipText.offsetHeight - TOOLTIP_OFFSET;
            }

            if (top < popupRect.top + 5) {
                top = popupRect.top + 5;
            }
            
            tooltipText.style.left = `${left}px`; 
            tooltipText.style.top = `${top}px`; 
        });

        trigger.addEventListener('mouseleave', function() {
            const tooltipContainer = this.closest('.tooltip-container');
            const tooltipText = tooltipContainer ? tooltipContainer.querySelector('.tooltip-text') : null;

            if (!tooltipText) return;

            tooltipText.style.visibility = 'hidden'; 
            tooltipText.style.opacity = '0';
        });
    });
}
