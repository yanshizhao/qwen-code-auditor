// src/utils/cache.ts
import * as md5 from 'md5';
import { CACHE_EXPIRE_TIME } from '../config';
import { AuditResult, CacheValue } from '../types';

const auditCache = new Map<string, CacheValue>();

export function getCache(codeBlock: string): AuditResult | undefined {
    const hash = md5.default(codeBlock);
    const cacheItem = auditCache.get(hash);
    if (!cacheItem) return undefined;
    if (Date.now() - cacheItem.timestamp > CACHE_EXPIRE_TIME) {
        auditCache.delete(hash);
        return undefined;
    }
    return cacheItem.data;
}

export function setCache(codeBlock: string, result: AuditResult): void {
    const hash = md5.default(codeBlock);
    auditCache.set(hash, { timestamp: Date.now(), data: result });
}

export function clearCache(): void {
    auditCache.clear();
}