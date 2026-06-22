import { Hono } from 'hono';
import { authGuard } from '../auth/auth.guard.js';
import * as svc from './questions.service.js';
import { parseJSON, parseCSV, parseTXT, exportJSON, exportCSV, getTemplateJSON, getTemplateCSV, getTemplateTXT } from './import-export.js';
import { createShareToken, validateShareToken } from './share-tokens.js';
import { getSetById, getQuestions } from './questions.service.js';

export const questionRoutes = new Hono();
questionRoutes.use('*', authGuard);

// ═══════════════════════════════════════════════════
//  Question Sets
// ═══════════════════════════════════════════════════

// List all sets
questionRoutes.get('/sets', (c) => {
  const host = c.var.host;
  const sets = svc.listSets(host.id);
  return c.json({ sets });
});

// Create set
questionRoutes.post('/sets', async (c) => {
  const host = c.var.host;
  const { title, description, coverImageUrl } = await c.req.json();
  if (!title || !title.trim()) {
    return c.json({ error: 'VALIDATION', message: '题集名称不能为空' }, 400);
  }
  const set = svc.createSet(host.id, title, description, coverImageUrl);
  return c.json({ set }, 201);
});

// Get set with questions
questionRoutes.get('/sets/:id', (c) => {
  const host = c.var.host;
  const set = svc.getSet(c.req.param('id'), host.id);
  if (!set) return c.json({ error: 'NOT_FOUND', message: '题集不存在' }, 404);

  const questions = svc.getQuestions(set.id);
  return c.json({ set, questions });
});

// Update set
questionRoutes.patch('/sets/:id', async (c) => {
  const host = c.var.host;
  const body = await c.req.json();
  const set = svc.updateSet(c.req.param('id'), host.id, body);
  if (!set) return c.json({ error: 'NOT_FOUND', message: '题集不存在' }, 404);
  return c.json({ set });
});

// Delete set
questionRoutes.delete('/sets/:id', (c) => {
  const host = c.var.host;
  const ok = svc.deleteSet(c.req.param('id'), host.id);
  if (!ok) return c.json({ error: 'NOT_FOUND', message: '题集不存在' }, 404);
  return c.json({ success: true });
});

// Copy set
questionRoutes.post('/sets/:id/copy', (c) => {
  const host = c.var.host;
  const set = svc.copySet(c.req.param('id'), host.id);
  if (!set) return c.json({ error: 'NOT_FOUND', message: '题集不存在' }, 404);
  return c.json({ set }, 201);
});

// ═══════════════════════════════════════════════════
//  Questions within a set
// ═══════════════════════════════════════════════════

// Add question to set
questionRoutes.post('/sets/:setId/questions', async (c) => {
  const host = c.var.host;
  const setId = c.req.param('setId');

  // Verify ownership
  const set = svc.getSet(setId, host.id);
  if (!set) return c.json({ error: 'NOT_FOUND', message: '题集不存在' }, 404);

  const body = await c.req.json();
  if (!body.text || !body.text.trim()) {
    return c.json({ error: 'VALIDATION', message: '题干不能为空' }, 400);
  }
  if (!body.options || body.options.length < 2) {
    return c.json({ error: 'VALIDATION', message: '至少需要2个选项' }, 400);
  }
  if (!body.options.some((o: any) => o.isCorrect)) {
    return c.json({ error: 'VALIDATION', message: '至少需要1个正确答案' }, 400);
  }

  const question = svc.addQuestion(setId, body);
  return c.json({ question }, 201);
});

// Update question
questionRoutes.patch('/sets/:setId/questions/:questionId', async (c) => {
  const host = c.var.host;
  const { setId, questionId } = c.req.param();

  const set = svc.getSet(setId, host.id);
  if (!set) return c.json({ error: 'NOT_FOUND', message: '题集不存在' }, 404);

  const body = await c.req.json();
  const question = svc.updateQuestion(questionId, body);
  if (!question) return c.json({ error: 'NOT_FOUND', message: '题目不存在' }, 404);

  return c.json({ question });
});

// Delete question
questionRoutes.delete('/sets/:setId/questions/:questionId', (c) => {
  const host = c.var.host;
  const { setId, questionId } = c.req.param();

  const set = svc.getSet(setId, host.id);
  if (!set) return c.json({ error: 'NOT_FOUND', message: '题集不存在' }, 404);

  const ok = svc.deleteQuestion(questionId);
  if (!ok) return c.json({ error: 'NOT_FOUND', message: '题目不存在' }, 404);

  return c.json({ success: true });
});

// Reorder questions
questionRoutes.post('/sets/:setId/reorder', async (c) => {
  const host = c.var.host;
  const setId = c.req.param('setId');

  const set = svc.getSet(setId, host.id);
  if (!set) return c.json({ error: 'NOT_FOUND', message: '题集不存在' }, 404);

  const { orderedIds } = await c.req.json();
  if (!Array.isArray(orderedIds)) {
    return c.json({ error: 'VALIDATION', message: 'orderedIds 必须是数组' }, 400);
  }

  svc.reorderQuestions(setId, orderedIds);
  return c.json({ success: true });
});

// ═══════════════════════════════════════════════════
//  Import / Export
// ═══════════════════════════════════════════════════

// Import questions from uploaded file
questionRoutes.post('/sets/:setId/import', async (c) => {
  const host = c.var.host;
  const setId = c.req.param('setId');

  const set = svc.getSet(setId, host.id);
  if (!set) return c.json({ error: 'NOT_FOUND', message: '题集不存在' }, 404);

  const formData = await c.req.formData();
  const file = formData.get('file');

  if (!file || !(file instanceof File)) {
    return c.json({ error: 'VALIDATION', message: '请上传文件' }, 400);
  }

  const content = await file.text();
  const filename = file.name.toLowerCase();

  let result;
  if (filename.endsWith('.json')) {
    result = parseJSON(content);
  } else if (filename.endsWith('.csv')) {
    result = parseCSV(content);
  } else if (filename.endsWith('.txt')) {
    result = parseTXT(content);
  } else {
    return c.json({ error: 'VALIDATION', message: '不支持的文件格式，请使用 JSON/CSV/TXT' }, 400);
  }

  // Import valid questions
  const imported: any[] = [];
  for (const q of result.questions) {
    const question = svc.addQuestion(setId, q);
    imported.push(question);
  }

  return c.json({
    imported: imported.length,
    errors: result.errors,
    set: svc.getSet(setId, host.id),
  });
});

// Export question set
questionRoutes.get('/sets/:id/export', (c) => {
  const host = c.var.host;
  const id = c.req.param('id');
  const format = c.req.query('format') || 'json';

  const set = svc.getSet(id, host.id);
  if (!set) return c.json({ error: 'NOT_FOUND', message: '题集不存在' }, 404);

  const qs = svc.getQuestions(id);
  const content = format === 'csv' ? exportCSV(qs) : exportJSON(qs);
  const contentType = format === 'csv' ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8';
  const filename = `${set.title}.${format}`;

  return new Response(content, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
    },
  });
});

// Download template file
questionRoutes.get('/templates/:format', (c) => {
  const format = c.req.param('format');

  let content: string;
  let contentType: string;
  let filename: string;

  switch (format) {
    case 'json':
      content = getTemplateJSON();
      contentType = 'application/json; charset=utf-8';
      filename = 'template.json';
      break;
    case 'csv':
      content = getTemplateCSV();
      contentType = 'text/csv; charset=utf-8';
      filename = 'template.csv';
      break;
    case 'txt':
      content = getTemplateTXT();
      contentType = 'text/plain; charset=utf-8';
      filename = 'template.txt';
      break;
    default:
      return c.json({ error: 'VALIDATION', message: '不支持的格式' }, 400);
  }

  return new Response(content, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
});

// ═══════════════════════════════════════════════════
//  Share Tokens
// ═══════════════════════════════════════════════════

// Generate share link
questionRoutes.post('/sets/:id/share', async (c) => {
  const host = c.var.host;
  const id = c.req.param('id');

  const set = svc.getSet(id, host.id);
  if (!set) return c.json({ error: 'NOT_FOUND', message: '题集不存在' }, 404);

  const { expiresInHours } = await c.req.json();
  const hours = Math.min(expiresInHours || 24, 720); // max 30 days
  const { token, expiresAt } = createShareToken(id, hours);

  return c.json({
    token,
    expiresAt,
    url: `/api/questions/shared/${token}`,
  });
});

// ── Public: Download via share token (no auth required) ──
// This route is mounted outside the auth guard — see app.ts
export const publicShareRoute = new Hono();

publicShareRoute.get('/shared/:token', (c) => {
  const token = c.req.param('token');
  const setId = validateShareToken(token);

  if (!setId) {
    return c.json({ error: 'INVALID_TOKEN', message: '链接无效或已过期' }, 410);
  }

  const set = getSetById(setId);
  if (!set) return c.json({ error: 'NOT_FOUND', message: '题集不存在' }, 404);

  const qs = getQuestions(setId);
  const content = exportJSON(qs);

  return new Response(content, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(set.title)}.json"`,
    },
  });
});
