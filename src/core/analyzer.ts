// src/core/analyzer.ts
import { Vulnerability, AuditResult } from '../types';
import { TYPE_NORMALIZATION } from '../config';
import { getCache, setCache } from '../utils/cache';
import { addLineNumbers } from '../utils/code-parser';
import { simpleHeuristicFallback } from '../utils/heuristic';
import { callOllama } from '../ai/client';
import { PHASE_1_PROMPT, PHASE_2_PROMPT, PHASE_3_PROSECUTOR } from '../ai/prompts';

export async function analyzeCode(codeBlock: string, startLineOffset: number = 1): Promise<AuditResult> {
    const cachedResult = getCache(codeBlock);
    if (cachedResult) {
        console.log('[Cache Hit] 跳过重复分析');
        return cachedResult;
    }

    const codeWithLineNumbers = addLineNumbers(codeBlock, startLineOffset);
    const allVulnerabilities: Vulnerability[] = [];

    const phases = [
        { name: "Phase1_Corruption", prompt: PHASE_1_PROMPT },
        { name: "Phase2_Lifecycle", prompt: PHASE_2_PROMPT },
        { name: "Phase3_Prosecutor", prompt: PHASE_3_PROSECUTOR }
    ];

    for (const phase of phases) {
        console.log(`[${phase.name}] 调用 Ollama...`);
        const vulns = await callOllama(phase.prompt, codeWithLineNumbers);
        if (vulns.length > 0) {
            console.log(`[${phase.name}] 发现 ${vulns.length} 个问题`);
            allVulnerabilities.push(...vulns);
        }
    }

    try {
        const heuristicVulns = simpleHeuristicFallback(codeWithLineNumbers);
        if (heuristicVulns.length > 0) {
            console.log(`[Heuristics] 兜底补充 ${heuristicVulns.length} 个问题`);
            allVulnerabilities.push(...heuristicVulns);
        }
    } catch (e) {
        console.warn('[Heuristics] 兜底异常:', e);
    }

    if (allVulnerabilities.length === 0) {
        const emptyResult = { vulnerabilities: [] };
        setCache(codeBlock, emptyResult);
        return emptyResult;
    }

    // 去重与合并逻辑
    const groups = new Map<string, Vulnerability[]>();
    for (const vul of allVulnerabilities) {
        const normalizedType = TYPE_NORMALIZATION[vul.type] || vul.type;
        const key = `${normalizedType}|${vul.line}|${(vul.reason || '').slice(0, 80)}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push({ ...vul, type: normalizedType });
    }

    const merged: Vulnerability[] = [];
    const severityPriority: Record<string, number> = { 'Critical': 1, 'High': 2, 'Medium': 3, 'Low': 4 };

    for (const [, arr] of groups) {
        let best = arr[0];
        for (const v of arr) {
            if ((severityPriority[v.severity] ?? 99) < (severityPriority[best.severity] ?? 99)) {
                best = v;
            }
        }
        const reasons = Array.from(new Set(arr.map(v => v.reason).filter(Boolean)));
        const fixes = Array.from(new Set(arr.map(v => v.fix).filter(Boolean)));
        merged.push({ ...best, reason: reasons.join(' | '), fix: fixes.join(' | ') });
    }

    const finalUnique = merged.filter((v, idx, self) =>
        idx === self.findIndex(t => t.type === v.type && t.line === v.line)
    );

    const finalResult = { vulnerabilities: finalUnique };
    setCache(codeBlock, finalResult);
    return finalResult;
}