// background.js v10 (Исправлено асинхронное получение ответа)

let currentVolumeData = {}; 

// УДАЛИТЕ КЛЮЧЕВОЕ СЛОВО 'async' из этой строки
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Добавьте эту строку, чтобы Chrome знал, что ответ будет асинхронным
    const handledAsync = true; 

    const tabId = sender.tab ? sender.tab.id : request.tabId;

    if (request.action === "updateVolumeMeter") {
        if (tabId) {
            currentVolumeData[tabId] = {
                postVolume: request.volume,
                preVolume: request.debugVolumePre !== undefined ? request.debugVolumePre : null
            };
        }
    } else if (request.action === "getVolume") {
        if (tabId && currentVolumeData[tabId] !== undefined) {
            sendResponse({ volume: currentVolumeData[tabId].postVolume, debugVolumePre: currentVolumeData[tabId].preVolume });
        } else {
            sendResponse({ volume: 0, debugVolumePre: null });
        }
    } else if (request.action === "toggleStabilizer") {
        if (tabId) {
            // Используйте .then() и .catch() для обработки промиса и вызова sendResponse
            chrome.tabs.sendMessage(tabId, { action: "toggleStabilizer" })
                .then(responseFromContent => sendResponse(responseFromContent))
                .catch(error => {
                    console.warn("Ошибка при отправке toggleStabilizer (background):", error.message);
                    sendResponse({ status: 'error', message: error.message });
                });
            return handledAsync; // Возвращаем true здесь
        }
    } else if (request.action === "setDebugMode" || request.action === "updateSettings") {
        if (tabId) {
             // Используйте .then() и .catch() для обработки промиса и вызова sendResponse
            chrome.tabs.sendMessage(tabId, request)
                 .then(responseFromContent => sendResponse(responseFromContent))
                .catch(error => {
                    console.warn("Ошибка при пересылке setDebugMode/updateSettings (background):", error.message);
                    sendResponse({ status: 'error', message: error.message });
                });
            return handledAsync; // Возвращаем true здесь
        }
    }
    
    // Для синхронных запросов (типа updateVolumeMeter) ничего возвращать не нужно.
    // Если вы не используете async, и нет return true, канал закрывается сразу.
});

chrome.tabs.onRemoved.addListener((tabId) => {
    delete currentVolumeData[tabId];
});
