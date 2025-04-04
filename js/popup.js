// popup.js - 插件弹出窗口的脚本

// 当弹出窗口加载完成时执行
document.addEventListener('DOMContentLoaded', () => {
    // 获取DOM元素
    const thresholdSlider = document.getElementById('threshold');
    const thresholdDisplay = document.getElementById('threshold-display');
    const saveButton = document.getElementById('save-settings');
    const analyzedCount = document.getElementById('analyzed-count');
    const skippedCount = document.getElementById('skipped-count');
    const watchedCount = document.getElementById('watched-count');

    // 从存储中加载设置
    loadSettings();

    // 加载统计数据
    loadStats();

    // 获取当前标签页的视频信息
    getCurrentTabVideoInfo();

    // 监听滑块值变化
    thresholdSlider.addEventListener('input', () => {
        thresholdDisplay.textContent = thresholdSlider.value;
    });

    // 监听保存按钮点击
    saveButton.addEventListener('click', saveSettings);
});

/**
 * 从存储中加载设置
 */
function loadSettings() {
    chrome.runtime.sendMessage({ action: 'getSettings' }, (response) => {
        if (chrome.runtime.lastError) {
            console.error('获取设置失败:', chrome.runtime.lastError);
            return;
        }

        // 更新UI
        const thresholdSlider = document.getElementById('threshold');
        const thresholdDisplay = document.getElementById('threshold-display');

        if (response && response.valueThreshold !== undefined) {
            thresholdSlider.value = response.valueThreshold;
            thresholdDisplay.textContent = response.valueThreshold;
        }
    });
}

/**
 * 保存设置到存储
 */
function saveSettings() {
    const thresholdSlider = document.getElementById('threshold');
    const threshold = parseFloat(thresholdSlider.value);

    chrome.runtime.sendMessage(
        { action: 'updateSettings', threshold },
        (response) => {
            if (chrome.runtime.lastError) {
                console.error('保存设置失败:', chrome.runtime.lastError);
                return;
            }

            // 显示保存成功提示
            const saveButton = document.getElementById('save-settings');
            const originalText = saveButton.textContent;

            saveButton.textContent = '已保存';
            saveButton.disabled = true;

            setTimeout(() => {
                saveButton.textContent = originalText;
                saveButton.disabled = false;
            }, 1500);
        }
    );
}

/**
 * 加载使用统计数据
 */
function loadStats() {
    chrome.storage.local.get(['watchHistory'], (result) => {
        if (chrome.runtime.lastError) {
            console.error('获取统计数据失败:', chrome.runtime.lastError);
            return;
        }

        const watchHistory = result.watchHistory || {};
        const videoIds = Object.keys(watchHistory);

        // 计算统计数据
        const analyzed = videoIds.length;
        let watched = 0;
        let skipped = 0;

        videoIds.forEach(id => {
            if (watchHistory[id].isValuable) {
                watched++;
            } else {
                skipped++;
            }
        });

        // 更新UI
        document.getElementById('analyzed-count').textContent = analyzed;
        document.getElementById('skipped-count').textContent = skipped;
        document.getElementById('watched-count').textContent = watched;
    });
}

/**
 * 获取当前标签页的视频信息
 */
async function getCurrentTabVideoInfo() {
    try {
        // 获取当前标签页
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        // 检查是否在B站视频页面
        if (tab.url.includes('bilibili.com/video/')) {
            // 显示视频信息区域
            document.getElementById('current-video').style.display = 'block';
            
            // 向content script发送消息获取视频信息
            chrome.tabs.sendMessage(tab.id, { action: 'getVideoInfo' }, async (response) => {
                if (chrome.runtime.lastError || !response || !response.videoInfo) {
                    console.error('获取视频信息失败:', chrome.runtime.lastError || '无视频信息');
                    document.getElementById('current-video').style.display = 'block';
                    document.getElementById('current-video').innerHTML = '<p class="error-message">无法获取视频信息，请确保在B站视频页面并刷新页面</p>';
                    return;
                }

                if (response && response.videoInfo) {
                    try {
                        // 获取视频分析结果
                        const result = await new Promise((resolve, reject) => {
                            chrome.runtime.sendMessage(
                                { action: 'checkVideoValue', videoInfo: response.videoInfo },
                                (response) => {
                                    if (chrome.runtime.lastError) {
                                        reject(chrome.runtime.lastError);
                                    } else {
                                        resolve(response);
                                    }
                                }
                            );
                        });

                        // 更新UI显示
                        updateVideoInfoUI(response.videoInfo, result);
                    } catch (error) {
                        console.error('获取视频分析结果失败:', error);
                        document.getElementById('current-video').style.display = 'block';
                        document.getElementById('current-video').innerHTML = '<p class="error-message">分析视频时出错，请刷新页面后重试</p>';
                    }
                }
            });
        } else {
            // 不在视频页面时隐藏视频信息区域
            document.getElementById('current-video').style.display = 'none';
        }
    } catch (error) {
        console.error('获取当前标签页信息失败:', error);
    }
}

/**
 * 更新视频信息UI
 * @param {Object} videoInfo - 视频信息
 * @param {Object} analysisResult - 分析结果
 */
function updateVideoInfoUI(videoInfo, analysisResult) {
    // 更新标题
    document.getElementById('video-title').textContent = 
        videoInfo.title.length > 30 ? videoInfo.title.substring(0, 30) + '...' : videoInfo.title;

    // 更新分数
    const scorePercentage = Math.round(analysisResult.confidence * 100);
    document.getElementById('value-score').textContent = `${scorePercentage}%`;
    document.getElementById('value-score-fill').style.width = `${scorePercentage}%`;
    document.getElementById('value-score-fill').style.backgroundColor = 
        analysisResult.isValuable ? '#4CAF50' : '#FF5722';

    // 更新类型
    document.getElementById('video-type').textContent = 
        analysisResult.isValuable ? '有价值视频' : '无价值视频';
    document.getElementById('video-type').style.color = 
        analysisResult.isValuable ? '#4CAF50' : '#FF5722';
}