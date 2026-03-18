// src/utils/code-parser.ts
import { CodeBlockWithLine, LinedCodeLine } from '../types';

export function splitCodeIntoPureFunctionBlocks(code: string): CodeBlockWithLine[] {
    const trimmedCode = code.trim();
    if (!trimmedCode) return [];

    const functionBlocks: CodeBlockWithLine[] = [];
    const lines = code.split('\n');
    let inFunction = false;
    let funcStartLineIndex = -1;
    let braceCount = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const cleanLine = line.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/, '');

        if (!inFunction) {
            const match = cleanLine.match(/([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/);
            if (match) {
                const funcName = match[1];
                const keywordBlacklist = ['if', 'for', 'while', 'switch', 'do', 'else', 'case', 'return', 'sizeof', 'typeof', 'catch'];
                if (funcName && !keywordBlacklist.includes(funcName)) {
                    inFunction = true;
                    funcStartLineIndex = i;
                    braceCount = 0;
                }
            }
        }

        if (inFunction) {
            for (const char of line) {
                if (char === '{') braceCount++;
                if (char === '}') braceCount--;
            }

            if (braceCount === 0 && funcStartLineIndex !== -1) {
                const blockLines = lines.slice(funcStartLineIndex, i + 1);
                const blockContent = blockLines.join('\n');
                const openBrace = (blockContent.match(/{/g) || []).length;
                const closeBrace = (blockContent.match(/}/g) || []).length;

                if (openBrace > 0 && openBrace === closeBrace && blockContent.length > 20) {
                    functionBlocks.push({
                        code: blockContent,
                        startLine: funcStartLineIndex + 1
                    });
                    inFunction = false;
                    funcStartLineIndex = -1;
                }
            }
        }
    }
    return functionBlocks;
}

export function addLineNumbers(code: string, startOffset: number = 1): string {
    const lines = code.split('\n');
    return lines.map((line, index) => {
        const actualLineNumber = startOffset + index;
        return `/* L${actualLineNumber} */ ${line}`;
    }).join('\n');
}

export function parseLinedCode(codeWithLineNumbers: string): LinedCodeLine[] {
    const lines = codeWithLineNumbers.split('\n');
    const result: LinedCodeLine[] = [];
    for (const raw of lines) {
        const m = raw.match(/\/\*\s*L(\d+)\s*\*\/\s*(.*)$/);
        if (m) {
            result.push({ line: parseInt(m[1], 10), text: m[2] });
        }
    }
    return result;
}