// injected_script.js v13
(function() {
    // Проверка наличия флага window.hasRun предотвращает наложение скриптов
    if (window.hasRun) {
        return; 
    }
    window.hasRun = true; 
    window.volumeMeterInterval = null; // Перемещаем интервал в window для доступа из cleanup

    let audioContext = null;
    let sourceNode = null;
    let preAnalyserNode = null; 
    let compressorNode = null;
    let gainNode = null; 
    let postAnalyserNode = null; 
    let isStabilizerOn = false;
    let debugMode = false; 

    const DEFAULT_THRESHOLD = -25; 
    const DEFAULT_RATIO = 15; 
    const DEFAULT_GAIN = 0.5; 
    let currentThreshold = DEFAULT_THRESHOLD;
    let currentRatio = DEFAULT_RATIO;
    let currentGain = DEFAULT_GAIN;

    function updateCompressorSettings(settings) {
        if (compressorNode && audioContext && gainNode) {
            if (settings.threshold !== undefined) {
                currentThreshold = parseFloat(settings.threshold);
                compressorNode.threshold.setValueAtTime(currentThreshold, audioContext.currentTime);
            }
            if (settings.ratio !== undefined) {
                currentRatio = parseFloat(settings.ratio);
                compressorNode.ratio.setValueAtTime(currentRatio, audioContext.currentTime);
            }
            if (settings.gain !== undefined) {
                currentGain = parseFloat(settings.gain);
                gainNode.gain.setValueAtTime(currentGain, audioContext.currentTime);
            }
        }
    }

    function toggleStabilizer() {
        const videoElement = document.querySelector('video');
        if (!videoElement) {
            try {
                chrome.runtime.sendMessage({ action: "updateVolumeMeter", volume: 0 });
            } catch (e) { console.warn("Контекст недействителен при попытке выключить стабилизатор."); }
            return 'off';
        }

        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            if (audioContext.state === 'suspended') { audioContext.resume(); } 
            sourceNode = audioContext.createMediaElementSource(videoElement);
            videoElement.volume = 1.0; 
            compressorNode = audioContext.createDynamicsCompressor();
            gainNode = audioContext.createGain();
            
            preAnalyserNode = audioContext.createAnalyser();
            postAnalyserNode = audioContext.createAnalyser();

            compressorNode.threshold.setValueAtTime(currentThreshold, audioContext.currentTime); 
            compressorNode.ratio.setValueAtTime(currentRatio, audioContext.currentTime);     
            gainNode.gain.setValueAtTime(currentGain, audioContext.currentTime); 
            
            preAnalyserNode.fftSize = 256;
            postAnalyserNode.fftSize = 256; 
        }

        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }

        if (isStabilizerOn) {
            sourceNode.disconnect();
            preAnalyserNode.disconnect(); 
            compressorNode.disconnect();
            gainNode.disconnect();
            postAnalyserNode.disconnect();
            
            sourceNode.connect(audioContext.destination); 
            
            if (window.volumeMeterInterval) {
                clearInterval(window.volumeMeterInterval);
                window.volumeMeterInterval = null;
            }
            try { 
                chrome.runtime.sendMessage({ action: "updateVolumeMeter", volume: 0 });
            } catch (e) { console.warn("Контекст недействителен при попытке выключить стабилизатор."); }

            isStabilizerOn = false;
        } else {
            sourceNode.disconnect(); 

            sourceNode.connect(preAnalyserNode);
            sourceNode.connect(compressorNode);

            compressorNode.connect(gainNode); 
            gainNode.connect(postAnalyserNode); 
            
            postAnalyserNode.connect(audioContext.destination); 

            startVolumeMeter(); 
            isStabilizerOn = true;
        }
        
        return isStabilizerOn ? 'on' : 'off';
    }

    function measureAndSendVolume() {
        if (!postAnalyserNode || !isStabilizerOn) return;

        const postDataArray = new Uint8Array(postAnalyserNode.frequencyBinCount);
        postAnalyserNode.getByteFrequencyData(postDataArray); 
        let sumPost = 0;
        for (let i = 0; i < postDataArray.length; i++) { sumPost += postDataArray[i]; }
        let averageVolumePost = sumPost / postDataArray.length; 
        
        if (debugMode && preAnalyserNode) {
            const preDataArray = new Uint8Array(preAnalyserNode.frequencyBinCount);
            preAnalyserNode.getByteFrequencyData(preDataArray);
            let sumPre = 0;
            for (let i = 0; i < preDataArray.length; i++) { sumPre += preDataArray[i]; }
            let averageVolumePre = sumPre / preDataArray.length;

            try {
                chrome.runtime.sendMessage({ 
                    action: "updateVolumeMeter", 
                    volume: averageVolumePost, 
                    debugVolumePre: averageVolumePre
                });
            } catch (e) { /* error handling */ }

        } else {
            try {
                chrome.runtime.sendMessage({ action: "updateVolumeMeter", volume: averageVolumePost });
            } catch (e) { /* error handling */ }
        }
    }

    function startVolumeMeter() {
        if (window.volumeMeterInterval) return;
        window.volumeMeterInterval = setInterval(measureAndSendVolume, 30); 
    }

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        // Добавляем эту строку, чтобы сказать Chrome, что мы будем отвечать асинхронно
        const handledAsync = true;

        if (request.action === "toggleStabilizer") {
            const status = toggleStabilizer();
            // Используем явный вызов sendResponse вместо return
            sendResponse({status: status}); 
        } else if (request.action === "getStatus") {
            sendResponse({status: isStabilizerOn ? 'on' : 'off'}); 
        } else if (request.action === "updateSettings") {
            updateCompressorSettings(request.settings);
            // No return needed if sender doesn't expect a response
        } else if (request.action === "getSettings") { 
            sendResponse({ // Используем явный вызов sendResponse вместо return
                settings: {
                    threshold: currentThreshold,
                    ratio: currentRatio,
                    gain: currentGain
                }
            });
        } else if (request.action === "setDebugMode") { 
            debugMode = request.enabled;
            console.log(`Режим отладки ${debugMode ? 'включен' : 'выключен'}`);
             // No return needed if sender doesn't expect a response
        }
        
        // Возвращаем true только в тех ветках, где вызывали sendResponse
        if (request.action === "toggleStabilizer" || request.action === "getStatus" || request.action === "getSettings") {
            return handledAsync; 
        }
    });

    document.addEventListener('play', (event) => {
        if (isStabilizerOn && event.target.tagName.toLowerCase() === 'video') {
            toggleStabilizer(); 
            toggleStabilizer();
        }
    }, true);
})();
