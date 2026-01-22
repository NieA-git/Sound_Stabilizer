// background.js 1.6.1 (Исправлено: подтверждение получения сообщения)
let currentVolumeData = {}; 
const DATA_TIMEOUT_MS = 1000; 

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const tabId = sender.tab ? sender.tab.id : request.tabId;

    if (request.action === "updateVolumeMeter") {
        if (tabId && request.instanceId) {
            if (!currentVolumeData[tabId]) currentVolumeData[tabId] = {};
            currentVolumeData[tabId][request.instanceId] = {
                postVolume: request.volume,
                preVolume: request.debugVolumePre !== undefined ? request.debugVolumePre : null,
                lastUpdate: Date.now()
            };
        }
        sendResponse({ status: "received" }); 

    } else if (request.action === "getVolume") {
        if (tabId && currentVolumeData[tabId]) {
            let activePlayer = null;
            let loudestVolume = -1; 

            for (const id in currentVolumeData[tabId]) {
                const data = currentVolumeData[tabId][id];
                if (Date.now() - data.lastUpdate > DATA_TIMEOUT_MS) {
                    delete currentVolumeData[tabId][id];
                    continue;
                }
                if (data.postVolume > loudestVolume) {
                    loudestVolume = data.postVolume;
                    activePlayer = data;
                }
            }
            if (activePlayer) {
                sendResponse({ volume: activePlayer.postVolume, debugVolumePre: activePlayer.preVolume });
                return;
            }
        }
        // ИСПРАВЛЕНИЕ: Вызываем sendResponse безусловно, если дошли до этого места
        sendResponse({ volume: 0, debugVolumePre: null }); 
    } else {
        if (tabId) {
            chrome.tabs.sendMessage(tabId, request)
                .then(res => { if (res) sendResponse(res); })
                .catch(() => {});
            return true; 
        }
    }
});

chrome.tabs.onRemoved.addListener(id => delete currentVolumeData[id]);
