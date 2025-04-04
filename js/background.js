// background.js - 插件的后台脚本

// 初始化存储的默认值
chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.get(['valueThreshold', 'watchHistory'], (result) => {
        // 如果没有设置阈值，默认设置为0.7
        if (result.valueThreshold === undefined) {
            chrome.storage.local.set({ valueThreshold: 0.7 });
        }

        // 如果没有观看历史记录，初始化为空对象
        if (result.watchHistory === undefined) {
            chrome.storage.local.set({ watchHistory: {} });
        }
    });
});

// 监听来自content script的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'checkVideoValue') {
        // 获取视频信息并进行分析
        analyzeVideoValue(message.videoInfo)
            .then(result => {
                sendResponse(result);
            });
        return true; // 异步响应需要返回true
    }

    if (message.action === 'recordUserChoice') {
        // 记录用户的选择
        recordUserWatchingChoice(message.videoId, message.choice, message.videoInfo);
        sendResponse({ success: true });
        return true;
    }

    if (message.action === 'getSettings') {
        // 获取插件设置
        chrome.storage.local.get(['valueThreshold'], (result) => {
            sendResponse(result);
        });
        return true;
    }

    if (message.action === 'updateSettings') {
        // 更新插件设置
        chrome.storage.local.set({ valueThreshold: message.threshold }, () => {
            sendResponse({ success: true });
        });
        return true;
    }
});

/**
 * 分析视频价值
 * @param {Object} videoInfo - 视频信息对象
 * @returns {Promise<Object>} - 分析结果
 */
async function analyzeVideoValue(videoInfo) {
    // 获取当前阈值设置
    const settings = await chrome.storage.local.get(['valueThreshold', 'watchHistory']);
    const threshold = settings.valueThreshold || 0.7;
    const watchHistory = settings.watchHistory || {};

    // 检查是否在稍后观看或收藏列表中
    if (videoInfo.isWatchLater || videoInfo.isFavorite) {
        return {
            isValuable: true,
            confidence: 1.0,
            reason: '用户已将此视频添加到稍后观看或收藏列表'
        };
    }

    // 检查历史记录中是否已标记为有价值
    if (watchHistory[videoInfo.id] && watchHistory[videoInfo.id].isValuable) {
        return {
            isValuable: true,
            confidence: 1.0,
            reason: '用户之前已将此视频标记为有价值'
        };
    }

    // 检查视频时长
    let durationScore = 0.5;
    if (videoInfo.duration < 180) { // 小于3分钟
        durationScore = 0.3; // 降低分数但不直接判定为无价值
    } else if (videoInfo.duration > 600) { // 大于10分钟
        durationScore = 0.7; // 较长视频可能更有价值
    }

    // 基于标题、标签和UP主的分析
    let valueScore = durationScore; // 初始分数基于视频时长
    let reasons = [];
    
    if (videoInfo.duration < 180) {
        reasons.push('短视频(小于3分钟)');
    }

    // 学习相关关键词
    const learningKeywords = ['教程', '学习', '课程', '讲解', '分析', '知识', '科普', '技术', '编程', '数学', '物理', '化学', '生物', '历史', '地理', '经济', '哲学', '文学'];

    // 娱乐相关关键词
    const entertainmentKeywords = ['搞笑', '娱乐', '游戏', 'vlog', '开箱', '测评', '挑战', '恶搞', '整蛊', '剧情', '短剧', '沙雕', '鬼畜'];

    // 检查标题中的关键词
    for (const keyword of learningKeywords) {
        if (videoInfo.title.includes(keyword)) {
            valueScore += 0.1;
            reasons.push(`标题包含学习关键词: ${keyword}`);
        }
    }

    for (const keyword of entertainmentKeywords) {
        if (videoInfo.title.includes(keyword)) {
            valueScore -= 0.1;
            reasons.push(`标题包含娱乐关键词: ${keyword}`);
        }
    }

    // 检查标签
    for (const tag of videoInfo.tags) {
        if (learningKeywords.some(keyword => tag.includes(keyword))) {
            valueScore += 0.05;
            reasons.push(`标签包含学习关键词`);
        }
        if (entertainmentKeywords.some(keyword => tag.includes(keyword))) {
            valueScore -= 0.05;
            reasons.push(`标签包含娱乐关键词`);
        }
    }

    // 限制分数范围在0-1之间
    valueScore = Math.max(0, Math.min(1, valueScore));

    // 根据阈值判断是否有价值
    const isValuable = valueScore >= threshold;

    return {
        isValuable,
        confidence: valueScore,
        reason: reasons.join(', ') || '基于综合因素分析'
    };
}

/**
 * 记录用户的观看选择
 * @param {string} videoId - 视频ID
 * @param {boolean} choice - 用户选择（true表示继续观看）
 * @param {Object} videoInfo - 视频信息
 */
async function recordUserWatchingChoice(videoId, choice, videoInfo) {
    const data = await chrome.storage.local.get(['watchHistory']);
    const watchHistory = data.watchHistory || {};

    // 记录用户选择
    watchHistory[videoId] = {
        isValuable: choice,
        timestamp: Date.now(),
        videoInfo: videoInfo
    };

    // 保存到存储
    await chrome.storage.local.set({ watchHistory });
}