import { v4 as uuidv4 } from 'uuid';
import XLSX from 'xlsx';
import { sqlite } from '../../db/connection.js';
import type { Room } from '../quiz/quiz.types.js';

// ── Save game results to database (called when room transitions to 'ended') ──
export function saveGameRoom(room: Room): string {
  const gameRoomId = uuidv4();
  const now = Date.now();

  const insertRoom = sqlite.prepare(`
    INSERT INTO game_rooms (id, host_id, question_set_id, question_set_title, pin, settings_json, question_count, player_count, started_at, ended_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertRoom.run(
    gameRoomId,
    room.hostId,
    room.questionSetId,
    room.questionSetTitle || '',
    room.pin,
    JSON.stringify(room.settings),
    room.questions.length,
    room.players.size,
    room.gameStartedAt || room.createdAt,
    now,
    room.createdAt,
  );

  // Build leaderboard for rankings
  const sorted = Array.from(room.players.values()).sort((a, b) => b.totalScore - a.totalScore);
  console.log(`[Persistence] Saving game room ${gameRoomId}: ${sorted.length} players, ${room.questions.length} questions`);

  // Use explicit transaction for atomicity
  sqlite.exec('BEGIN');
  try {
    for (let i = 0; i < sorted.length; i++) {
      const p = sorted[i];
      let correct = 0;
      let wrong = 0;
      let unanswered = 0;
      let maxStreak = 0;

      for (const q of room.questions) {
        const ans = p.answers.get(q.id);
        if (ans) {
          const opt = q.options.find(o => o.id === ans.optionId);
          if (opt?.isCorrect) {
            correct++;
            if (p.streak > maxStreak) maxStreak = p.streak;
          } else {
            wrong++;
          }
          // Save per-question answer record
          sqlite.prepare(`
            INSERT INTO game_answer_records (id, game_room_id, question_id, question_text, player_token, player_name, option_id, option_text, option_color, is_correct, score_earned, answer_time_ms)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            uuidv4(), gameRoomId, q.id, q.text, p.sessionToken, p.name,
            ans.optionId, opt?.text || '', opt?.color || '',
            opt?.isCorrect ? 1 : 0, ans.score, ans.answerTimeMs || null,
          );
        } else {
          unanswered++;
          // No answer submitted
          sqlite.prepare(`
            INSERT INTO game_answer_records (id, game_room_id, question_id, question_text, player_token, player_name, option_id, option_text, option_color, is_correct, score_earned, answer_time_ms)
            VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, 0, 0, NULL)
          `).run(
            uuidv4(), gameRoomId, q.id, q.text, p.sessionToken, p.name,
          );
        }
      }

      sqlite.prepare(`
        INSERT INTO game_player_results (id, game_room_id, player_name, session_token, total_score, correct_count, wrong_count, unanswered_count, final_rank, max_streak)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        uuidv4(), gameRoomId, p.name, p.sessionToken, p.totalScore,
        correct, wrong, unanswered, i + 1, maxStreak,
      );
    }
    sqlite.exec('COMMIT');
    console.log(`[Persistence] Game room ${gameRoomId} saved successfully`);
  } catch (err: any) {
    sqlite.exec('ROLLBACK');
    console.error(`[Persistence] Failed to save players — rolling back:`, err.message);
    throw err;
  }

  return gameRoomId;
}

// ── Query history ──
export interface GameRoomSummary {
  id: string;
  questionSetTitle: string;
  pin: string;
  questionCount: number;
  playerCount: number;
  startedAt: number;
  endedAt: number;
  createdAt: number;
  settings: any;
}

export function getRoomHistory(hostId: string): GameRoomSummary[] {
  const rows = sqlite.prepare(`
    SELECT id, question_set_title, pin, settings_json, question_count, player_count, started_at, ended_at, created_at
    FROM game_rooms WHERE host_id = ? ORDER BY ended_at DESC
  `).all(hostId) as any[];

  return rows.map(r => ({
    id: r.id,
    questionSetTitle: r.question_set_title,
    pin: r.pin,
    questionCount: r.question_count,
    playerCount: r.player_count,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    createdAt: r.created_at,
    settings: JSON.parse(r.settings_json || '{}'),
  }));
}

export interface GameRoomDetail {
  room: GameRoomSummary;
  players: any[];
  answers: any[];
}

export function getRoomDetail(gameRoomId: string): GameRoomDetail | null {
  const room = sqlite.prepare('SELECT * FROM game_rooms WHERE id = ?').get(gameRoomId) as any;
  if (!room) return null;

  const players = sqlite.prepare('SELECT * FROM game_player_results WHERE game_room_id = ? ORDER BY final_rank ASC').all(gameRoomId);
  const answers = sqlite.prepare('SELECT * FROM game_answer_records WHERE game_room_id = ? ORDER BY question_id, player_name').all(gameRoomId);

  return {
    room: {
      id: room.id,
      questionSetTitle: room.question_set_title,
      pin: room.pin,
      questionCount: room.question_count,
      playerCount: room.player_count,
      endedAt: room.ended_at,
      createdAt: room.created_at,
      settings: JSON.parse(room.settings_json || '{}'),
    },
    players,
    answers,
  };
}

// ── Export to Excel ──
export function exportRoomExcel(gameRoomId: string): Buffer | null {
  const detail = getRoomDetail(gameRoomId);
  if (!detail) return null;

  const wb = XLSX.utils.book_new();

  // Sheet 1: Player rankings
  const playerData = detail.players.map((p: any) => ({
    '排名': p.final_rank,
    '玩家名称': p.player_name,
    '总分': p.total_score,
    '正确题数': p.correct_count,
    '错误题数': p.wrong_count,
    '未答题数': p.unanswered_count,
    '最大连击': p.max_streak,
  }));
  const ws1 = XLSX.utils.json_to_sheet(playerData);
  XLSX.utils.book_append_sheet(wb, ws1, '玩家排名');

  // Sheet 2: Per-question answer statistics
  const questionMap = new Map<string, { text: string; total: number; correct: number; red: number; blue: number; yellow: number; green: number }>();
  for (const a of detail.answers as any[]) {
    if (!questionMap.has(a.question_id)) {
      questionMap.set(a.question_id, { text: a.question_text, total: 0, correct: 0, red: 0, blue: 0, yellow: 0, green: 0 });
    }
    const qs = questionMap.get(a.question_id)!;
    qs.total++;
    if (a.is_correct) qs.correct++;
    if (a.option_color === 'red') qs.red++;
    else if (a.option_color === 'blue') qs.blue++;
    else if (a.option_color === 'yellow') qs.yellow++;
    else if (a.option_color === 'green') qs.green++;
  }
  const statData = Array.from(questionMap.values()).map((qs, i) => ({
    '题号': i + 1,
    '题目': qs.text,
    '作答人数': qs.total,
    '正确人数': qs.correct,
    '正确率': qs.total > 0 ? `${Math.round(qs.correct / qs.total * 100)}%` : '0%',
    '🔴红': qs.red,
    '🔵蓝': qs.blue,
    '🟡黄': qs.yellow,
    '🟢绿': qs.green,
  }));
  const ws2 = XLSX.utils.json_to_sheet(statData);
  XLSX.utils.book_append_sheet(wb, ws2, '答题统计');

  // Sheet 3: Individual answer details
  const answerData = detail.answers.map((a: any) => ({
    '题目': a.question_text,
    '玩家': a.player_name,
    '选择': a.option_text || '(未作答)',
    '颜色': a.option_color || '-',
    '结果': a.is_correct ? '✅ 正确' : '❌ 错误',
    '得分': a.score_earned,
    '用时(ms)': a.answer_time_ms ?? '-',
  }));
  const ws3 = XLSX.utils.json_to_sheet(answerData);
  XLSX.utils.book_append_sheet(wb, ws3, '答题明细');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return buf;
}
