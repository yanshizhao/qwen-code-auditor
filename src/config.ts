// src/config.ts

export const MODEL_CONFIGS = {
    default: "qwen2.5-coder:7b-32k-final",
    backup: "qwen2.5-coder:7b-32k-final"
};

export const ACTIVE_MODEL = MODEL_CONFIGS.default;

export const CACHE_EXPIRE_TIME = 3600 * 1000; // 1 hour

export const RESOURCE_MAP = {
    allocators: ['malloc', 'calloc', 'realloc', 'strdup'],
    deallocators: ['free'],
    fileOpen: ['fopen'],
    fileClose: ['fclose'],
    fdOpen: ['open', 'socket'],
    fdClose: ['close'],
    fileUseAPIs: ['fread', 'fwrite', 'fprintf', 'scanf', 'fgets', 'fputs', 'fseek', 'fflush', 'fgetc', 'fputc']
};

export const TYPE_NORMALIZATION: Record<string, string> = {
    'INTEGER': 'INTEGER_OVERFLOW', 'INT_OVERFLOW': 'INTEGER_OVERFLOW', 'OVERFLOW': 'INTEGER_OVERFLOW',
    'NULL_DERE': 'NULL_POINTER_DEREFERENCE', 'NULL_PTR': 'NULL_POINTER_DEREFERENCE',
    'MEM_LEAK': 'MEMORY_LEAK', 'RES_LEAK': 'RESOURCE_LEAK',
    'UAF': 'USE_AFTER_FREE', 'DBL_FREE': 'DOUBLE_FREE',
    'FORMAT': 'FORMAT_STRING_VULNERABILITY'
};