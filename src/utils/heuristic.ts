// src/utils/heuristic.ts
import { Vulnerability, LinedCodeLine } from '../types';
import { RESOURCE_MAP } from '../config';
import { parseLinedCode } from './code-parser';

export function simpleHeuristicFallback(codeWithLineNumbers: string): Vulnerability[] {
    const lines = parseLinedCode(codeWithLineNumbers);
    const vulns: Vulnerability[] = [];

    interface ResPoint { var: string; line: number; }
    const memAllocs: ResPoint[] = [];
    const fileOpens: ResPoint[] = [];
    const fdOpens: ResPoint[] = [];
    
    const frees: string[] = [];
    const fcloses: string[] = [];
    const closes: string[] = [];
    
    // 记录首次解引用或使用该指针的行号
    const firstUseOfPtr: Record<string, number> = {};
    const firstUseOfFile: Record<string, number> = {};

    // --- 增强版：空指针检查检测 ---
    const hasNullCheckBeforeLine = (varName: string, lineNo: number): boolean => {
        // 转义变量名中的特殊字符（虽然 C 变量名通常不需要，但为了安全）
        const safeVar = varName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        
        // 构建更宽松的正则模式
        // 匹配模式:
        // 1. if (var)
        // 2. if (!var)
        // 3. if (var != NULL) / if (var != nullptr)
        // 4. if (var == NULL) (虽然这通常是检查是否为空，但如果后面跟着 else 使用，逻辑较复杂，这里简化处理：只要出现过比较 NULL 就算检查过)
        // 5. if (NULL != var) / if (NULL == var)
        // 6. assert(var)
        
        const patterns = [
            new RegExp(`\\bif\\s*\\(\\s*!\\s*${safeVar}\\s*\\)`),          // if (!ptr)
            new RegExp(`\\bif\\s*\\(\\s*${safeVar}\\s*\\)`),               // if (ptr)
            new RegExp(`\\bif\\s*\\(\\s*${safeVar}\\s*!=\\s*(NULL|nullptr)\\s*\\)`), // if (ptr != NULL)
            new RegExp(`\\bif\\s*\\(\\s*(NULL|nullptr)\\s*!=\\s*${safeVar}\\s*\\)`), // if (NULL != ptr)
            new RegExp(`\\bif\\s*\\(\\s*${safeVar}\\s*==\\s*(NULL|nullptr)\\s*\\)`), // if (ptr == NULL) (假设后续有 else 或 return)
            new RegExp(`\\bif\\s*\\(\\s*(NULL|nullptr)\\s*==\\s*${safeVar}\\s*\\)`), // if (NULL == ptr)
            new RegExp(`\\bassert\\s*\\(\\s*${safeVar}\\s*\\)`),           // assert(ptr)
            new RegExp(`\\bif\\s*\\(\\s*${safeVar}\\s*&&`),                // if (ptr && ...)
            new RegExp(`\\bif\\s*\\(\\s*.*\\s*&&\\s*${safeVar}\\s*`)       // if (... && ptr)
        ];

        for (const l of lines) {
            if (l.line >= lineNo) break; // 只检查当前行之前的代码
            
            const t = l.text;
            // 跳过注释行 (简单处理，实际可能需要更完善的注释移除逻辑)
            if (t.trim().startsWith('//')) continue;

            for (const regex of patterns) {
                if (regex.test(t)) {
                    return true;
                }
            }
        }
        return false;
    };

    for (const l of lines) {
        const t = l.text;

        // 1. 检测内存分配 (支持 int *p = malloc, int* p = malloc, p = malloc)
        let m = t.match(/\b([A-Za-z_]\w*)\s*\*+\s*([A-Za-z_]\w*)\s*=\s*(malloc|calloc|realloc|strdup)\s*\(/);
        if (m) memAllocs.push({ var: m[2], line: l.line });
        else {
            m = t.match(/\b([A-Za-z_]\w*)\s*=\s*(malloc|calloc|realloc|strdup)\s*\(/);
            if (m) memAllocs.push({ var: m[1], line: l.line });
        }

        // 2. 检测文件打开
        let f = t.match(/\b([A-Za-z_]\w*)\s*=\s*fopen\s*\(/);
        if (f) fileOpens.push({ var: f[1], line: l.line });

        // 3. 检测 FD/Socket 打开
        let fd = t.match(/\b([A-Za-z_]\w*)\s*=\s*open\s*\(/);
        if (fd) fdOpens.push({ var: fd[1], line: l.line });
        fd = t.match(/\b([A-Za-z_]\w*)\s*=\s*socket\s*\(/);
        if (fd) fdOpens.push({ var: fd[1], line: l.line });

        // 4. 检测释放操作
        if (t.match(/\bfree\s*\(/)) {
            const mm = t.match(/\bfree\s*\(\s*([A-Za-z_]\w*)\s*\)/);
            if (mm) frees.push(mm[1]);
        }
        if (t.match(/\bfclose\s*\(/)) {
            const mm = t.match(/\bfclose\s*\(\s*([A-Za-z_]\w*)\s*\)/);
            if (mm) fcloses.push(mm[1]);
        }
        if (t.match(/\bclose\s*\(/)) {
            const mm = t.match(/\bclose\s*\(\s*([A-Za-z_]\w*)\s*\)/);
            if (mm) closes.push(mm[1]);
        }

        // 5. 检测指针的首次使用 (解引用 或 作为参数传递)
        // 对每个已分配的内存指针
        for (const a of memAllocs) {
            if (firstUseOfPtr[a.var]) continue; // 已记录

            const varName = a.var;
            const lineText = t;

            // --- A. 检测显式解引用: *ptr, ptr->, ptr[] ---
            const regexDerefStar = new RegExp(`\\*\\s*${varName}\\b`); 
            const regexDerefArrow = new RegExp(`\\b${varName}\\s*->`);
            const regexDerefBracket = new RegExp(`\\b${varName}\\s*\\[`);

            const isExplicitDeref = regexDerefStar.test(lineText) || 
                                    regexDerefArrow.test(lineText) || 
                                    regexDerefBracket.test(lineText);

            // --- B. 检测隐式使用 ---
            // 条件: 行内有函数调用 + 包含变量名 + 不是赋值语句左边 + 不是取地址
            const hasFuncCall = /\w+\s*\(/.test(lineText);
            const hasVar = new RegExp(`\\b${varName}\\b`).test(lineText);
            
            // 排除: ptr = ...
            const isAssignmentTarget = new RegExp(`\\b${varName}\\s*=[^=]`).test(lineText); 
            // 排除: &ptr
            const isAddressOf = new RegExp(`&\\s*${varName}\\b`).test(lineText);
            // 排除: 本行就是定义行 (虽然理论上不会进这里，因为 memAllocs 是之前收集的，但防御性编程)
            const isDefinition = new RegExp(`${varName}\\s*=\\s*(malloc|calloc|realloc|strdup)`).test(lineText);

            const isImplicitUse = hasFuncCall && hasVar && !isAssignmentTarget && !isAddressOf && !isDefinition;

            if (isExplicitDeref || isImplicitUse) {
                // --- C. 最终确认：这行是不是 NULL 检查语句？ ---
                // 如果是 if (!ptr) 或 if (ptr == NULL)，则不算危险使用
                const isNullCheck = /\bif\s*\(/.test(lineText) && (
                    new RegExp(`\\b!\\s*${varName}\\b`).test(lineText) ||
                    new RegExp(`\\b${varName}\\s*==\\s*NULL\\b`).test(lineText) ||
                    new RegExp(`\\bNULL\\s*==\\s*${varName}\\b`).test(lineText) ||
                    new RegExp(`\\b${varName}\\s*!=\\s*NULL\\b`).test(lineText) ||
                    new RegExp(`\\bNULL\\s*!=\\s*${varName}\\b`).test(lineText) ||
                    new RegExp(`\\b${varName}\\s*&&`).test(lineText) || // if (ptr && ...)
                    new RegExp(`&&\\s*${varName}\\b`).test(lineText)    // if (... && ptr)
                );

                if (!isNullCheck) {
                    firstUseOfPtr[varName] = l.line;
                    // 调试用：console.log(`Found unsafe use of ${varName} at line ${l.line}: ${lineText.trim()}`);
                }
            }
        }

        // 对每个已打开的文件指针
        for (const fo of fileOpens) {
            if (firstUseOfFile[fo.var]) continue;
            
            // 检查是否调用了文件操作 API
            for (const api of RESOURCE_MAP.fileUseAPIs) {
                // 构造正则：api(..., var, ...) 或 api(var)
                if (new RegExp(`\\b${api}\\s*\\([^)]*\\b${fo.var}\\b`).test(t)) {
                    firstUseOfFile[fo.var] = l.line;
                    break;
                }
            }
            // 通用检测：如果这行有函数调用，且包含该变量名，且不是 fopen 本身，也不是 fclose
            if (!firstUseOfFile[fo.var]) {
                 const isArg = new RegExp(`\\b${fo.var}\\b`).test(t) && 
                               !t.includes(`${fo.var} = fopen`) &&
                               !t.includes(`fclose(${fo.var}`) &&
                               t.match(/\w+\s*\(/);
                 if (isArg) {
                     firstUseOfFile[fo.var] = l.line;
                 }
            }
        }
    }

    // --- 报告生成 ---
    
    // 内存泄漏 & 空指针解引用 (Memory)
    for (const a of memAllocs) {
        // 泄漏检查
        if (!frees.includes(a.var)) {
            vulns.push({
                type: 'MEMORY_LEAK', severity: 'High', line: a.line,
                reason: `Memory allocated to '${a.var}' at line ${a.line} is never freed.`,
                fix: `Add 'free(${a.var});' along all paths.`
            });
        }
        
        // 空指针检查
        if (firstUseOfPtr[a.var]) {
            const useLine = firstUseOfPtr[a.var];
            if (!hasNullCheckBeforeLine(a.var, useLine)) {
                vulns.push({
                    type: 'NULL_POINTER_DEREFERENCE', severity: 'Critical', line: useLine,
                    reason: `Pointer '${a.var}' (from malloc/calloc at line ${a.line}) is used without NULL check.`,
                    fix: `Insert 'if (${a.var} == NULL) {{ /* handle error */ }}' before line ${useLine}.`
                });
            }
        }
    }

    // 资源泄漏 & 空指针解引用 (File)
    for (const fo of fileOpens) {
        // 泄漏检查
        if (!fcloses.includes(fo.var)) {
            vulns.push({
                type: 'RESOURCE_LEAK', severity: 'High', line: fo.line,
                reason: `File handle '${fo.var}' opened at line ${fo.line} is never closed.`,
                fix: `Call 'fclose(${fo.var});'.`
            });
        }

        // 空指针检查
        if (firstUseOfFile[fo.var]) {
            const useLine = firstUseOfFile[fo.var];
            if (!hasNullCheckBeforeLine(fo.var, useLine)) {
                vulns.push({
                    type: 'NULL_POINTER_DEREFERENCE', severity: 'Critical', line: useLine,
                    reason: `File pointer '${fo.var}' (from fopen at line ${fo.line}) is used without NULL check.`,
                    fix: `Insert 'if (${fo.var} == NULL) {{ /* handle error */ }}' before line ${useLine}.`
                });
            }
        }
    }

    // FD 泄漏检查
    for (const fdo of fdOpens) {
        if (!closes.includes(fdo.var)) {
            vulns.push({
                type: 'RESOURCE_LEAK', severity: 'High', line: fdo.line,
                reason: `FD '${fdo.var}' opened at line ${fdo.line} is never closed.`,
                fix: `Call 'close(${fdo.var});'.`
            });
        }
        // FD 的空指针检查通常不是必须的 (open 返回 -1 而不是 NULL)，但可以检查返回值是否为 -1
        // 这里暂不添加，保持逻辑聚焦在 NULL 指针上
    }

    return vulns;
}