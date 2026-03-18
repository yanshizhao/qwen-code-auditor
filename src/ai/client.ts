// src/ai/client.ts
import axios from 'axios';
import { ACTIVE_MODEL } from '../config';
import { OllamaChatResponse, AuditResult, Vulnerability } from '../types';

export async function callOllama(prompt: string, codeWithLineNumbers: string): Promise<Vulnerability[]> {
    const requestData = {
        model: ACTIVE_MODEL,
        format: "json",
        messages: [
            { role: "user", content: `${prompt}\n\n# Input Code:\n${codeWithLineNumbers}` }
        ],
        stream: false,
        options: { 
            temperature: 0.0, 
            num_predict: 512,
            repeat_penalty: 1.1
        }
    };

    try {
        const response = await axios.post<OllamaChatResponse>(
            'http://localhost:11434/api/chat',
            requestData,
            { timeout: 120000, headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' } }
        );

        const rawContent = response.data.message?.content?.trim() || '';
        if (!rawContent) return [];

        let cleanJson = rawContent.replace(/```json/g, '').replace(/```/g, '').trim();
        const startIdx = cleanJson.indexOf('{');
        const endIdx = cleanJson.lastIndexOf('}');
        
        if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
            const jsonStr = cleanJson.substring(startIdx, endIdx + 1);
            const result = JSON.parse(jsonStr) as AuditResult;
            
            if (result.vulnerabilities && Array.isArray(result.vulnerabilities)) {
                return result.vulnerabilities.map(v => ({
                    ...v,
                    line: typeof v.line === 'number' ? v.line : parseInt(String(v.line).replace(/[^0-9]/g, ''), 10) || 0
                }));
            }
        }
    } catch (error: any) {
        console.error(`AI Call Failed:`, error.message);
    }
    return [];
}