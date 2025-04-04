// content.js - 在B站视频页面上运行的内容脚本

// 自定义规则API
const customRules = {
    rules: [],
    
    // 添加自定义规则
    addRule(rule) {
        if (typeof rule.evaluate !== 'function') {
            throw new Error('规则必须包含evaluate函数');
        }
        this.rules.push(rule);
    },

    // 执行所有规则
    async evaluateAll(videoInfo) {
        const results = [];
        for (const rule of this.rules) {
            try {
                const result = await rule.evaluate(videoInfo);
                if (!result.isValuable) {
                    results.push({
                        isValuable: false,
                        confidence: result.confidence || 0.8,
                        reason: result.reason
                    });
                }
            } catch (error) {
                console.error('规则执行错误:', error);
            }
        }
        return results;
    }
};

// 暴露API给外部使用
window.bilibiliFilter = {
    addCustomRule: (rule) => customRules.addRule(rule)
};

// 等待页面加载完成
document.addEventListener('DOMContentLoaded', () => {
    // 确保在B站视频页面上运行
    if (window.location.href.includes('bilibili.com/video/')) {
        setTimeout(analyzeCurrentVideo, 2000); // 延迟2秒，确保页面元素加载完成
    }
});

// 监听来自popup的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'getVideoInfo') {
        const videoInfo = extractVideoInfo();
        sendResponse({ videoInfo });
        return true;
    }
});

/**
 * 分析当前正在播放的视频
 */
async function analyzeCurrentVideo() {
    // 获取视频信息
    const videoInfo = extractVideoInfo();

    if (!videoInfo) {
        console.error('无法获取视频信息');
        return;
    }

    // 检查是否在稍后观看列表中
    if (videoInfo.isWatchLater) {
        // 直接记录为有价值视频
        chrome.runtime.sendMessage({
            action: 'recordUserChoice',
            videoId: videoInfo.id,
            choice: true, // 标记为有价值
            videoInfo
        });
        return;
    }

    // 执行自定义规则
    const customResults = await customRules.evaluateAll(videoInfo);

    // 向background.js发送消息，检查视频价值
    chrome.runtime.sendMessage(
        { action: 'checkVideoValue', videoInfo },
        (response) => {
            if (chrome.runtime.lastError) {
                console.error('消息发送失败:', chrome.runtime.lastError);
                return;
            }

            // 如果视频被判断为无价值，显示提示框
            if (!response.isValuable) {
                // 合并系统判断和自定义规则的结果
                const allReasons = [
                    { reason: response.reason, confidence: response.confidence }
                ].concat(customResults);
                
                showWarningDialog(videoInfo, {
                    isValuable: false,
                    reasons: allReasons
                });
            }
        }
    );
}

/**
 * 从页面中提取视频信息
 * @returns {Object} 视频信息对象
 */
function extractVideoInfo() {
    try {
        // 获取视频ID (从URL中提取)
        const videoId = window.location.pathname.split('/').pop().split('?')[0];

        // 获取视频标题
        const title = document.querySelector('h1.video-title') ?
            document.querySelector('h1.video-title').title ||
            document.querySelector('h1.video-title').textContent : '';

        // 获取UP主信息
        const uploader = document.querySelector('.up-name') ?
            document.querySelector('.up-name').textContent : '';

        // 获取视频标签
        const tagElements = document.querySelectorAll('.tag-link');
        const tags = Array.from(tagElements).map(tag => tag.textContent);

        // 获取视频时长
        let duration = 0;
        const durationText = document.querySelector('.bilibili-player-video-time-total');
        if (durationText) {
            const timeParts = durationText.textContent.split(':');
            if (timeParts.length === 2) { // MM:SS 格式
                duration = parseInt(timeParts[0]) * 60 + parseInt(timeParts[1]);
            } else if (timeParts.length === 3) { // HH:MM:SS 格式
                duration = parseInt(timeParts[0]) * 3600 + parseInt(timeParts[1]) * 60 + parseInt(timeParts[2]);
            }
        }

        // 检查是否在稍后观看列表中
        const isWatchLater = document.querySelector('.watch-later-trigger.on') !== null;

        // 检查是否已收藏
        const isFavorite = document.querySelector('.collect-icon.on') !== null;

        return {
            id: videoId,
            title,
            uploader,
            tags,
            duration,
            isWatchLater,
            isFavorite,
            url: window.location.href
        };
    } catch (error) {
        console.error('提取视频信息时出错:', error);
        return null;
    }
}

/**
 * 显示警告对话框
 * @param {Object} videoInfo - 视频信息
 * @param {Object} analysisResult - 分析结果
 */
function showWarningDialog(videoInfo, analysisResult) {
    // 创建对话框容器
    const dialogContainer = document.createElement('div');
    dialogContainer.className = 'bilibili-filter-dialog';

    // 生成原因列表HTML
    const reasonsHtml = analysisResult.reasons
        .map(result => `
            <div class="reason-item">
                <p class="reason-text">🚫 ${result.reason}</p>
                <div class="confidence-bar">
                    <div class="confidence-level" style="width: ${Math.round(result.confidence * 100)}%"></div>
                    <span class="confidence-text">${Math.round(result.confidence * 100)}%</span>
                </div>
            </div>
        `)
        .join('');

    // 设置对话框内容
    dialogContainer.innerHTML = `
    <div class="dialog-content">
        <h3>⚠️ 视频价值提醒</h3>
        <p>当前视频可能是<strong>无价值视频</strong>，原因如下：</p>
        <div class="reasons-list">
            ${reasonsHtml}
        </div>
        <div class="dialog-buttons">
            <button class="continue-btn">继续观看</button>
            <button class="leave-btn">离开页面</button>
        </div>
    </div>
    `;

    // 添加到页面
    document.body.appendChild(dialogContainer);

    // 添加按钮事件监听
    const continueBtn = dialogContainer.querySelector('.continue-btn');
    const leaveBtn = dialogContainer.querySelector('.leave-btn');

    // 继续观看按钮
    continueBtn.addEventListener('click', () => {
        // 记录用户选择继续观看
        chrome.runtime.sendMessage({
            action: 'recordUserChoice',
            videoId: videoInfo.id,
            choice: true, // 标记为有价值
            videoInfo
        });

        // 移除对话框
        document.body.removeChild(dialogContainer);
    });

    // 离开页面按钮
    leaveBtn.addEventListener('click', () => {
        // 记录用户选择离开
        chrome.runtime.sendMessage({
            action: 'recordUserChoice',
            videoId: videoInfo.id,
            choice: false, // 标记为无价值
            videoInfo
        });

        // 跳转到B站稍后再看列表页面
        window.location.href = 'https://www.bilibili.com/watchlater/#/list';
    });
}

// 监听视频页面变化（B站是SPA应用，页面跳转不会触发完整的页面刷新）
let lastUrl = location.href;
new MutationObserver(() => {
    const currentUrl = location.href;
    if (currentUrl !== lastUrl && currentUrl.includes('bilibili.com/video/')) {
        lastUrl = currentUrl;
        setTimeout(analyzeCurrentVideo, 2000); // 延迟2秒，确保页面元素加载完成
    }
}).observe(document, { subtree: true, childList: true });