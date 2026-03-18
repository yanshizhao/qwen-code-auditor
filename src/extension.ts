// src/extension.ts
import * as vscode from 'vscode';
import { analyzeCode } from './core/analyzer';
import { splitCodeIntoPureFunctionBlocks } from './utils/code-parser';
import { clearCache } from './utils/cache';
import { AuditResult, Vulnerability } from './types';

export function activate(context: vscode.ExtensionContext) {
    const auditCommand = vscode.commands.registerCommand('qwen-code-auditor.checkVulnerability', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('请先打开要检查的代码文件！');
            return;
        }

        const selection = editor.selection;
        if (selection.isEmpty) {
            vscode.window.showErrorMessage('请先选中要检查的代码段！');
            return;
        }

        const selectedText = editor.document.getText(selection);
        if (!selectedText.trim()) {
            vscode.window.showErrorMessage('选中的代码段为空！');
            return;
        }

        const globalStartLine = selection.start.line + 1;
        
        const functionBlocksInfo = splitCodeIntoPureFunctionBlocks(selectedText);
        
        const blocksToAnalyze = functionBlocksInfo.length > 0 
            ? functionBlocksInfo 
            : [{ code: selectedText, startLine: 1 }];

        vscode.window.showInformationMessage(`开始检查选中的 ${blocksToAnalyze.length} 个代码块（多阶段模式）...`);

        const result = await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "正在检查选中的代码",
            cancellable: false
        }, async (progress) => {
            progress.report({ message: "准备代码块...", increment: 0 });
            const allVulns: Vulnerability[] = [];
            let success = 0, fail = 0;
            const total = blocksToAnalyze.length;

            for (let i = 0; i < total; i++) {
                const block = blocksToAnalyze[i];
                progress.report({ message: `分析块 ${i + 1}/${total}`, increment: (1 / total) * 100 });
                vscode.window.setStatusBarMessage(`检查进度: ${i + 1}/${total}`);

                const blockGlobalStartLine = globalStartLine + (block.startLine - 1);
                
                try {
                    const auditResult = await analyzeCode(block.code, blockGlobalStartLine);
                    if (auditResult.vulnerabilities?.length) {
                        allVulns.push(...auditResult.vulnerabilities);
                    }
                    success++;
                } catch (e) {
                    fail++;
                    console.warn(`第 ${i + 1} 个块分析失败:`, e);
                }
            }
            progress.report({ message: "分析完成", increment: 100 });
            return { allVulns, success, fail };
        });

        const uniqueVulnerabilities = result.allVulns.filter(
            (vul, index, self) => index === self.findIndex(t => t.type === vul.type && t.line === vul.line && t.reason === vul.reason)
        );

        vscode.window.setStatusBarMessage('');
        if (result.fail > 0) {
            vscode.window.showWarningMessage(`检查完成：成功 ${result.success} 个块，失败 ${result.fail} 个`);
        }

        if (uniqueVulnerabilities.length === 0) {
            vscode.window.showInformationMessage('✅ 选中代码检查完成：未检测到明显漏洞！');
        } else {
            const report = uniqueVulnerabilities.map((vul, i) =>
                `\n${i + 1}. [${vul.severity}] ${vul.type}\n行号：${vul.line}\n原因：${vul.reason}\n修复建议：${vul.fix}`
            ).join('');

            vscode.window.showErrorMessage(`❌ 选中代码检查完成：发现 ${uniqueVulnerabilities.length} 个漏洞！\n${report}`);

            const outputChannel = vscode.window.createOutputChannel('选中代码检查报告');
            outputChannel.clear();
            outputChannel.appendLine('==================== 选中代码安全检查报告 ====================');
            outputChannel.appendLine(`检查时间：${new Date().toLocaleString()}`);
            outputChannel.appendLine(`发现漏洞总数：${uniqueVulnerabilities.length}`);
            outputChannel.appendLine('------------------------------------------------------------');
            uniqueVulnerabilities.forEach((vul, i) => {
                outputChannel.appendLine(`\n${i + 1}. 漏洞类型：${vul.type}`);
                outputChannel.appendLine(`   严重程度：${vul.severity}`);
                outputChannel.appendLine(`   疑似行号：${vul.line}`);
                outputChannel.appendLine(`   漏洞原因：${vul.reason}`);
                outputChannel.appendLine(`   修复建议：${vul.fix}`);
            });
            outputChannel.show();
        }
    });

    const clearCacheCommand = vscode.commands.registerCommand('qwen-code-auditor.clearCache', () => {
        clearCache();
        vscode.window.showInformationMessage('✅ 检查缓存已清空！');
    });

    context.subscriptions.push(auditCommand);
    context.subscriptions.push(clearCacheCommand);
    vscode.window.showInformationMessage('✅ 通用 C 语言代码检查插件已激活！');
}

export function deactivate() {}