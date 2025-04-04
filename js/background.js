// background.js - 插件的后台脚本

// 加载配置文件
async function loadConfig() {
    try {
        const configResponse = await fetch(chrome.runtime.getURL('JsonFiles/config.json'));
        const tagResponse = await fetch(chrome.runtime.getURL('JsonFiles/tag.json'));
        const config = await configResponse.json();
        const tags = await tagResponse.json();
        return { config, tags };
    } catch (error) {
        console.error('加载配置文件失败:', error);
        return null;
    }
}

// 初始化存储的默认值
chrome.runtime.onInstalled.addListener(async () => {
    const { config } = await loadConfig() || { config: { valueThreshold: 0.7 } };
    chrome.storage.local.get(['valueThreshold', 'watchHistory'], (result) => {
        // 如果没有设置阈值，使用配置文件中的默认值
        if (result.valueThreshold === undefined) {
            chrome.storage.local.set({ valueThreshold: config.valueThreshold });
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

    // 加载配置和标签
    const { config, tags } = await loadConfig() || {
        config: {
            durationRules: {
                shortVideo: { threshold: 180, score: 0.3 },
                longVideo: { threshold: 600, score: 0.7 },
                defaultScore: 0.5
            },
            keywordScores: {
                learning: 0.1,
                entertainment: -0.1,
                tagLearning: 0.15,
                tagEntertainment: -0.1
            }
        },
        tags: {
            learningKeywords: [],
            entertainmentKeywords: []
        }
    };

    // 检查视频时长
    let durationScore = config.durationRules.defaultScore;
    if (videoInfo.duration < config.durationRules.shortVideo.threshold) {
        durationScore = config.durationRules.shortVideo.score;
    } else if (videoInfo.duration > config.durationRules.longVideo.threshold) {
        durationScore = config.durationRules.longVideo.score;
    }

    // 基于标题、标签和UP主的分析
    let valueScore = durationScore; // 初始分数基于视频时长
    let reasons = [];
    
    if (videoInfo.duration < config.durationRules.shortVideo.threshold) {
        reasons.push('短视频(小于3分钟)');
    }

    // 从配置文件加载关键词
    const learningKeywords = tags.learningKeywords;
    const entertainmentKeywords = tags.entertainmentKeywords;

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

    // 检查标签，记录已经计算过的关键词类型
    const usedLearningKeywords = new Set();
    const usedEntertainmentKeywords = new Set();

    for (const tag of videoInfo.tags) {
        // 检查学习关键词
        for (const keyword of learningKeywords) {
            if (tag.includes(keyword) && !usedLearningKeywords.has(keyword)) {
                valueScore += config.keywordScores.tagLearning;
                reasons.push(`包含学习相关标签: ${tag}`);
                usedLearningKeywords.add(keyword);
            }
        }
        // 检查娱乐关键词
        for (const keyword of entertainmentKeywords) {
            if (tag.includes(keyword) && !usedEntertainmentKeywords.has(keyword)) {
                valueScore += config.keywordScores.tagEntertainment;
                reasons.push(`包含娱乐相关标签: ${tag}`);
                usedEntertainmentKeywords.add(keyword);
            }
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

    // 重新分析视频以获取完整的分析详情
    const analysis = await analyzeVideoValue(videoInfo);

    // 记录用户选择
    watchHistory[videoId] = {
        isValuable: choice,
        timestamp: Date.now(),
        videoInfo: videoInfo,
        analysisDetails: {
            confidence: analysis.confidence,
            reasons: analysis.reason.split(', '),
            userChoice: choice
        }
    };

    // 保存到存储
    await chrome.storage.local.set({ watchHistory });
}