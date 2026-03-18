// src/types.ts

export interface Vulnerability {
    type: string;
    severity: 'High' | 'Medium' | 'Low' | 'Critical';
    line: number;
    reason: string;
    fix: string;
}

export interface AuditResult {
    vulnerabilities: Vulnerability[];
}

export interface CacheValue {
    timestamp: number;
    data: AuditResult;
}

export interface OllamaChatResponse {
    message?: {
        content?: string;
    };
}

export interface CodeBlockWithLine {
    code: string;
    startLine: number;
}

export interface LinedCodeLine {
    line: number;
    text: string;
}