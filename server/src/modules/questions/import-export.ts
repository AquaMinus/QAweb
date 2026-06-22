import type { QuestionData, OptionColor } from '../../shared/types.js';

// ── Types for parsed question ──
export interface ParsedQuestion {
  text: string;
  options: { text: string; isCorrect: boolean; color: OptionColor }[];
}

export interface ParseResult {
  questions: ParsedQuestion[];
  errors: string[];
}

const DEFAULT_COLORS: OptionColor[] = ['red', 'blue', 'yellow', 'green'];

// ═══════════════════════════════════════════════════════════════
//  JSON Import
// ═══════════════════════════════════════════════════════════════

export function parseJSON(content: string): ParseResult {
  const errors: string[] = [];
  const questions: ParsedQuestion[] = [];

  try {
    let data = JSON.parse(content);

    // Support both array and { questions: [...] }
    if (!Array.isArray(data)) {
      if (Array.isArray(data.questions)) {
        data = data.questions;
      } else {
        return { questions: [], errors: ['JSON 格式错误：需要数组或包含 questions 数组的对象'] };
      }
    }

    for (let i = 0; i < data.length; i++) {
      try {
        const q = parseOneQuestion(data[i], i);
        if (q) questions.push(q);
      } catch (e: any) {
        errors.push(`第 ${i + 1} 题: ${e.message}`);
      }
    }
  } catch {
    errors.push('JSON 解析失败，请检查格式');
  }

  return { questions, errors };
}

// ═══════════════════════════════════════════════════════════════
//  CSV Import
// ═══════════════════════════════════════════════════════════════

export function parseCSV(content: string): ParseResult {
  const errors: string[] = [];
  const questions: ParsedQuestion[] = [];

  const lines = content.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) {
    return { questions: [], errors: ['CSV 至少需要表头 + 1行数据'] };
  }

  // Header line is skipped

  for (let i = 1; i < lines.length; i++) {
    try {
      const row = parseCSVLine(lines[i]);
      if (row.length < 3) {
        errors.push(`第 ${i} 行: 列数不足`);
        continue;
      }

      const text = row[0]?.trim();
      if (!text) {
        errors.push(`第 ${i} 行: 题干为空`);
        continue;
      }

      // Parse options from columns 1-4, * prefix = correct
      const opts: { text: string; isCorrect: boolean }[] = [];
      for (let j = 1; j <= 4 && j < row.length; j++) {
        let optText = row[j]?.trim() || '';
        let isCorrect = false;
        if (optText.startsWith('*')) { isCorrect = true; optText = optText.slice(1).trim(); }
        if (optText) opts.push({ text: optText, isCorrect });
      }

      if (opts.length < 2) {
        errors.push(`第 ${i} 行: 选项不足（至少2个）`);
        continue;
      }
      if (!opts.some(o => o.isCorrect)) {
        errors.push(`第 ${i} 行: 没有标记正确答案（用 * 前缀）`);
        continue;
      }

      questions.push({
        text,
        options: opts.map((o, idx) => ({ ...o, color: DEFAULT_COLORS[idx % 4], orderIndex: idx })),
      });
    } catch (e: any) {
      errors.push(`第 ${i} 行: ${e.message}`);
    }
  }

  return { questions, errors };
}

// ═══════════════════════════════════════════════════════════════
//  TXT Import (lightweight markup)
// ═══════════════════════════════════════════════════════════════
//
//  Format:
//    Question text (first line)
//    Option 1
//    *Correct Option 2   (starts with * = correct)
//    Option 3
//    *Correct Option 4
//    (blank line separates questions)
//

export function parseTXT(content: string): ParseResult {
  const errors: string[] = [];
  const questions: ParsedQuestion[] = [];

  // Split by blank lines
  const blocks = content.split(/\n\s*\n/).filter(b => b.trim());

  for (let i = 0; i < blocks.length; i++) {
    try {
      const lines = blocks[i].split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 3) {
        errors.push(`第 ${i + 1} 题: 内容不足（至少需要题干 + 2个选项）`);
        continue;
      }

      const text = lines[0].trim();
      const opts: { text: string; isCorrect: boolean }[] = [];

      for (let j = 1; j < lines.length; j++) {
        let optText = lines[j].trim();
        let isCorrect = false;
        if (optText.startsWith('*')) {
          isCorrect = true;
          optText = optText.slice(1).trim();
        }
        if (optText) {
          opts.push({ text: optText, isCorrect });
        }
      }

      if (opts.length < 2) {
        errors.push(`第 ${i + 1} 题: 有效选项不足（至少2个）`);
        continue;
      }

      if (!opts.some(o => o.isCorrect)) {
        // Default: first option is correct
        opts[0].isCorrect = true;
      }

      questions.push({
        text,
        options: opts.map((o, idx) => ({ ...o, color: DEFAULT_COLORS[idx % 4], orderIndex: idx })),
      });
    } catch (e: any) {
      errors.push(`第 ${i + 1} 题: ${e.message}`);
    }
  }

  return { questions, errors };
}

// ═══════════════════════════════════════════════════════════════
//  Export
// ═══════════════════════════════════════════════════════════════

export function exportJSON(questions: QuestionData[]): string {
  const data = questions.map(q => ({
    text: q.text,
    options: q.options.map(o => ({
      text: o.text,
      isCorrect: o.isCorrect,
      color: o.color,
    })),
  }));
  return JSON.stringify({ questions: data }, null, 2);
}

export function exportCSV(questions: QuestionData[]): string {
  const header = 'question,option1,option2,option3,option4';
  const rows = questions.map(q => {
    const opts = q.options.map(o => o.isCorrect ? `*${o.text}` : o.text);
    while (opts.length < 4) opts.push('');
    return [
      escapeCSV(q.text),
      ...opts.slice(0, 4).map(escapeCSV),
    ].join(',');
  });
  return [header, ...rows].join('\n');
}

// ═══════════════════════════════════════════════════════════════
//  Template generation
// ═══════════════════════════════════════════════════════════════

export function getTemplateJSON(): string {
  const sample = {
    questions: [{
      text: '以下哪个是正确的？',
      options: [
        { text: '错误选项A', isCorrect: false, color: 'red' },
        { text: '正确选项B', isCorrect: true, color: 'blue' },
        { text: '错误选项C', isCorrect: false, color: 'yellow' },
        { text: '错误选项D', isCorrect: false, color: 'green' },
      ],
    }],
  };
  return JSON.stringify(sample, null, 2);
}

export function getTemplateCSV(): string {
  return [
    'question,option1,option2,option3,option4',
    '法国的首都是？,伦敦,*巴黎,柏林,马德里',
    '哪个星球最大？,地球,火星,*木星,土星',
  ].join('\n');
}

export function getTemplateTXT(): string {
  return [
    '法国的首都是？',
    '伦敦',
    '*巴黎',
    '柏林',
    '马德里',
    '',
    '哪个星球最大？',
    '地球',
    '火星',
    '*木星',
    '土星',
  ].join('\n');
}

// ═══════════════════════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════════════════════

function parseOneQuestion(obj: any, index: number): ParsedQuestion | null {
  if (!obj || typeof obj !== 'object') throw new Error('不是有效的题目对象');

  const text = obj.text?.trim();
  if (!text) throw new Error('题干为空');

  const rawOpts = Array.isArray(obj.options) ? obj.options : [];
  if (rawOpts.length < 2) throw new Error('选项不足（至少2个）');

  const opts = rawOpts.map((o: any, i: number) => ({
    text: (o.text || '').trim(),
    isCorrect: !!o.isCorrect,
    color: (['red', 'blue', 'yellow', 'green'] as OptionColor[])[i % 4],
    orderIndex: o.orderIndex ?? i,
  }));

  if (!opts.some(o => o.isCorrect)) throw new Error('没有正确答案');

  return {
    text,
    options: opts,
  };
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function escapeCSV(str: string): string {
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
