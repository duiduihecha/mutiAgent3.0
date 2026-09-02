/**
 * HSK 3.0 核心字表 — 按等级分层
 *
 * 数据来源：HSK 3.0 标准（2021版），从 hsk_word_new.jsonl 中提取单字
 *
 * 使用方式：
 *   import { getHSKCharWhitelist } from "@/data/hsk_vocabulary";
 *   const allowed = getHSKCharWhitelist(3); // HSK1+2+3 全部字符
 */

import * as fs from "fs";
import * as path from "path";

// ==================== JSONL 解析 ====================

function loadHSKCharsFromJSONL(): Record<number, Set<string>> {
  const charsByLevel: Record<number, Set<string>> = {};

  try {
    // 相对于项目根目录的路径
    const filePath = path.resolve(process.cwd(), "src/data/hsk_word_new.jsonl");
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const obj = JSON.parse(trimmed);
        const word: string = obj.word;
        const level: number = obj.hsk_level;

        // 提取词中所有中文字符（包括多字词的构成字）
        for (const ch of word) {
          if (/[一-鿿]/.test(ch)) {
            if (!charsByLevel[level]) {
              charsByLevel[level] = new Set();
            }
            charsByLevel[level].add(ch);
          }
        }
      } catch {
        // 跳过解析失败的行
      }
    }

    console.log(
      `[HSK字表] 已从JSONL加载，共 ${Object.keys(charsByLevel).length} 个等级`
    );
    for (const lvl of Object.keys(charsByLevel).sort((a, b) => Number(a) - Number(b))) {
      console.log(`  HSK${lvl}: ${charsByLevel[Number(lvl)].size} 个单字`);
    }
  } catch (err) {
    console.warn("[HSK字表] JSONL加载失败，使用空字表:", (err as Error).message);
  }

  return charsByLevel;
}

const HSK_CHARS_BY_LEVEL: Record<number, Set<string>> = loadHSKCharsFromJSONL();

// ==================== 公共 API ====================

// 始终包含的标点、数字、字母
const PUNCTUATION = "，。！？；：“”‘’（）【】《》、…—～·";
const DIGITS = "0123456789";
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

const ALWAYS_ALLOWED = new Set<string>([
  ...PUNCTUATION,
  ...DIGITS,
  ...LETTERS,
]);

/**
 * 获取指定 HSK 等级及以下所有字符的白名单
 * @param targetLevel 目标 HSK 等级 (1-9)
 * @returns 允许使用的字符集合
 */
export function getHSKCharWhitelist(targetLevel: number): Set<string> {
  const all = new Set<string>(ALWAYS_ALLOWED);

  const maxLevel = Object.keys(HSK_CHARS_BY_LEVEL)
    .map(Number)
    .sort((a, b) => b - a)[0] || 3;

  for (let level = 1; level <= Math.min(targetLevel, maxLevel); level++) {
    const chars = HSK_CHARS_BY_LEVEL[level];
    if (chars) {
      for (const ch of chars) {
        all.add(ch);
      }
    }
  }

  return all;
}

/**
 * 将 Set 转为数组（供 guardrail 调用）
 */
export function getHSKCharWhitelistArray(targetLevel: number): string[] {
  return Array.from(getHSKCharWhitelist(targetLevel));
}
