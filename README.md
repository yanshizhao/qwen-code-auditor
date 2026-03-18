# Qwen Code Auditor (7B-32K)
基于 Qwen2.5-Coder:7B 大模型的本地 C/C++ 代码漏洞检测 VS Code 插件，聚焦内存损坏、资源泄漏等核心安全问题，所有检测本地完成，保障代码隐私。

## 准备
插件默认连接本地 Ollama 服务。
1. 下载安装Ollama后，必须在终端运行以下命令拉取模型（否则插件无法工作）
    ollama pull qwen2.5-Coder:7B
2. 由于项目中使用的模型名字是qwen2.5-Coder:7B-32k-Final，所以
   拉取Qwen2.5-Coder:7B后，
   需要创建模型支持 32K 上下文，并命名为qwen2.5-Coder:7B-32k-Final, 
   并强制启用 32K 上下文窗口，以匹配代码中的默认配置


(注：请确保模型名称与代码中配置的一致)


## 📦 安装方式
### 方式1：本地安装 VSIX 包
1. 下载仓库中 `qwen-code-auditor-0.0.1.vsix` 文件；
2. 打开 VS Code → 扩展面板（Ctrl+Shift+X）→ 右上角「···」→ 从 VSIX 安装；
3. 选择下载的 VSIX 文件，重启 VS Code 即可。
4. 选中要检查的函数， 按 Ctrl+Shift+P 打开命令面板，输入「代码检查：漏洞扫描」即可调用插件

### 方式2：源码编译安装
1. 克隆仓库：
   ```bash
   git clone https://github.com/yanshizhao/qwen-code-auditor.git
   cd qwen-code-auditor
   npm install
   npm run compile