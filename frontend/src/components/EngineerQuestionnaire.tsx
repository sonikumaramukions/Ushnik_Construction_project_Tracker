// ================================================================
// ENGINEER QUESTIONNAIRE (components/EngineerQuestionnaire.tsx)
// ================================================================
// PURPOSE: Q&A form for engineers to answer questions about
//          sheet data (the “Q&A Workflow” feature).
//
// HOW IT WORKS:
//   1. Admin creates questions linked to specific cells
//   2. Engineer opens this component
//   3. Engineer answers the questions with text/number input
//   4. Answers are saved as cell data in the sheet
//   5. Admin reviews and approves the answers
//
// USED BY: Junior/Senior Engineer dashboards
// ================================================================

import React, { useEffect, useState } from 'react';
import api from '../services/api';               // Axios instance for backend calls
import { Box, Button, TextField } from '@mui/material'; // MUI layout + input components

// ─── ENGINEER QUESTIONNAIRE COMPONENT ─────────────────────────────────
// This is a simple Q&A form shown to engineers.
// The admin creates "questions" linked to specific cells in a sheet.
// The engineer sees the questions here, types answers, and saves them.
// Each answer gets written into the corresponding cell in the sheet.
//
// Props:
//   sheetId (optional) — if provided, only loads questions for that sheet
// ──────────────────────────────────────────────────────────────────────
export default function EngineerQuestionnaire({ sheetId }: { sheetId?: string }) {
  // questions = list of { sheetId, cellId, sheetName } from the server
  const [questions, setQuestions] = useState<any[]>([]);
  // answers = a map of "sheetId:cellId" → user's typed answer text
  const [answers, setAnswers] = useState<Record<string, string>>({});

  // Reload questions whenever sheetId changes (or on first mount)
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetId]);

  // Fetch questions from backend — either for a specific sheet or all assigned questions
  async function load() {
    try {
      const q = sheetId
        ? await api.get(`/userSheets/questions?sheetId=${sheetId}`)  // GET questions for one sheet
        : await api.get('/userSheets/questions');                     // GET all my assigned questions
      setQuestions(q.data.questions || []);
    } catch (err) {
      console.error('Failed to load questions', err);
    }
  }

  // Save one answer — writes the value into the cell on the backend
  async function submit(q: any) {
    try {
      const value = answers[`${q.sheetId}:${q.cellId}`] ?? '';
      // PUT /api/userSheets/my-sheets/:sheetId/cells/:cellId — saves the answer as cell data
      await api.put(`/userSheets/my-sheets/${q.sheetId}/cells/${q.cellId}`, { value });
      alert('Saved');
    } catch (err) {
      alert('Save failed');
    }
  }

  // ─── RENDER ─────────────────────────────────────────────────────────
  return (
    <Box>
      {/* If no questions assigned, show a message */}
      {questions.length === 0 && <div>No assigned questions</div>}

      {/* Render one card per question */}
      {questions.map(q => (
        <Box key={`${q.sheetId}:${q.cellId}`} sx={{ mb: 2, p: 1, border: '1px solid #eee' }}>
          {/* Show which sheet and cell this question is for */}
          <div><strong>{q.sheetName || q.sheetId}</strong> — {q.cellId}</div>
          {/* Text input for the engineer's answer */}
          <TextField
            fullWidth
            size="small"
            value={answers[`${q.sheetId}:${q.cellId}`] ?? ''}
            onChange={e => setAnswers(a => ({ ...a, [`${q.sheetId}:${q.cellId}`]: e.target.value }))}
          />
          {/* Save button sends the answer to the backend */}
          <Box sx={{ mt: 1 }}>
            <Button variant="contained" onClick={() => submit(q)}>Save</Button>
          </Box>
        </Box>
      ))}
    </Box>
  );
}
