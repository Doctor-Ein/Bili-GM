// 用户观看记录管理模块

class WatchRecord {
    constructor() {
        this.watchHistory = [];
        this.rules = {};
        this.config = {};
        this.loadData();
    }

    // 加载用户数据
    async loadData() {
        try {
            const data = await chrome.storage.local.get(['watchHistory', 'rules', 'config']);
            this.watchHistory = data.watchHistory || [];
            this.rules = data.rules || {};
            this.config = data.config || {};
        } catch (error) {
            console.error('加载用户数据失败:', error);
        }
    }

    // 保存用户数据
    async saveData() {
        try {
            await chrome.storage.local.set({
                watchHistory: this.watchHistory,
                rules: this.rules,
                config: this.config
            });
        } catch (error) {
            console.error('保存用户数据失败:', error);
        }
    }

    // 记录视频观看
    async recordWatch(videoInfo, choice = null, analysisDetails = null) {
        const record = {
            timestamp: Date.now(),
            videoId: videoInfo.id,
            title: videoInfo.title,
            uploader: videoInfo.uploader,
            tags: videoInfo.tags,
            url: videoInfo.url,
            duration: videoInfo.duration,
            score: videoInfo.score,
            reasons: videoInfo.reasons,
            isValuable: choice !== null ? choice : videoInfo.isValuable,
            continued: videoInfo.continued,
            watchTime: videoInfo.watchTime || 0,
            isWatchLater: videoInfo.isWatchLater || false,
            isFavorite: videoInfo.isFavorite || false,
            customRuleResults: videoInfo.customRuleResults || [],
            analysisDetails: analysisDetails
        };
        
        // 更新观看历史
        this.watchHistory[videoInfo.id] = record;
        await this.saveData();
        
        if (choice !== null) {
            this.updateRuleWeights(videoInfo);
        }
    }

    // 更新规则权重
    updateRuleWeights(videoInfo) {
        if (!videoInfo.continued) return;

        // 更新关键词权重
        const uniqueTags = new Set(videoInfo.tags);
        uniqueTags.forEach(tag => {
            if (this.rules.keywords.negative.includes(tag)) {
                // 如果用户继续观看，可能这个标签不该被标记为负面
                const index = this.rules.keywords.negative.indexOf(tag);
                this.rules.keywords.negative.splice(index, 1);
            }
        });
    }

    // 获取视频历史记录
    getWatchHistory() {
        return this.watchHistory;
    }

    // 获取规则配置
    getRules() {
        return this.rules;
    }

    // 更新配置
    async updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        await this.saveData();
    }
}

export default WatchRecord;