# B站防刷视频插件

## 功能介绍
这是一个Edge浏览器插件，旨在帮助用户避免在B站浪费时间观看无价值的视频。插件通过分析视频标题、标签和UP主等信息，自动识别视频类型，并在检测到可能是"无价值视频"时提醒用户。

### 主要特性
- 智能视频分类：将视频分为"有价值视频"和"无价值视频"。
- 用户行为记录：记录用户的观看习惯以便后续分析。

## 安装和使用
### 安装步骤
1. 打开Edge浏览器。
2. 进入管理扩展，在开发者模式下，点击加载已解压的扩展程序。
3. 选择插件的文件夹，点击选择此项目的文件夹。

### 使用方法
- 插件会在B站相关网页时自动触发，尤其是在视频播放页面。
- 当检测到"无价值视频"时，会弹出提示框询问是否继续观看。

## 项目结构
- JsonFiles：存储配置和用户行为数据。
- css：样式文件。
- images：图标文件。
- js：JavaScript脚本，包括background.js, content.js, popup.js, watchRecord.js。
- manifest.json：插件配置文件。
- popup.html：弹出窗口的HTML文件。

## 插件配置和自定义规则
- 用户可以根据自己的需求调整插件的行为，通过修改JsonFiles中的配置文件。
