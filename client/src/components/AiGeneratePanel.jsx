import { useState } from 'react';
import { errorMessage } from '../api/client.js';
import { generateQuiz } from '../api/quizzes.js';

const inputCls =
  'w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none';

// Collapsible "Generate with AI" form. Calls onGenerated(draft) with an unsaved quiz
// ({ title, description, questions }); the editor decides how to merge it for review.
export default function AiGeneratePanel({ onGenerated, hasQuestions }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('topic'); // topic | text
  const [topic, setTopic] = useState('');
  const [text, setText] = useState('');
  const [numQuestions, setNumQuestions] = useState(5);
  const [difficulty, setDifficulty] = useState('medium');
  const [questionTypes, setQuestionTypes] = useState('mixed');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    const n = Number(numQuestions);
    if (!Number.isInteger(n) || n < 1 || n > 20) return setError('Choose between 1 and 20 questions.');
    if (mode === 'topic' && topic.trim().length < 3) return setError('Enter a topic (at least 3 characters).');
    if (mode === 'text' && text.trim().length < 50) return setError('Paste at least 50 characters of text.');

    setBusy(true);
    try {
      const body = {
        numQuestions: n,
        difficulty,
        questionTypes,
        ...(mode === 'topic' ? { topic: topic.trim() } : { text: text.trim() }),
      };
      const { quiz, meta } = await generateQuiz(body);
      onGenerated(quiz);
      setNotice(
        `Added ${meta.returned} question${meta.returned === 1 ? '' : 's'}` +
          (meta.returned < meta.requested ? ` (of ${meta.requested} requested; some were discarded as invalid)` : '') +
          '. Review and edit them below, then save.'
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 rounded-lg border border-indigo-200 bg-indigo-50/60">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-3 text-left font-semibold text-indigo-700"
      >
        <span>✨ {hasQuestions ? 'Add questions with AI' : 'Generate with AI'}</span>
        <span className="text-sm">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <form onSubmit={submit} className="space-y-3 border-t border-indigo-200 px-4 pb-4 pt-3">
          <div className="inline-flex rounded border border-indigo-300 bg-white p-0.5 text-sm">
            {[
              ['topic', 'Topic'],
              ['text', 'Paste text'],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                className={`rounded px-3 py-1 ${mode === value ? 'bg-indigo-600 text-white' : 'text-indigo-700'}`}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === 'topic' ? (
            <input
              maxLength={200}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. The French Revolution, or Basic Python loops"
              className={inputCls}
            />
          ) : (
            <div>
              <textarea
                rows={6}
                maxLength={12000}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Paste an article, lesson notes or chapter. Questions will be based only on this text."
                className={inputCls}
              />
              <p className="mt-1 text-right text-xs text-slate-500">{text.length.toLocaleString()} / 12,000</p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="text-xs font-medium text-slate-600">
              Number of questions
              <input
                type="number"
                min={1}
                max={20}
                value={numQuestions}
                onChange={(e) => setNumQuestions(e.target.value)}
                className={`${inputCls} mt-1`}
              />
            </label>
            <label className="text-xs font-medium text-slate-600">
              Difficulty
              <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className={`${inputCls} mt-1`}>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </label>
            <label className="text-xs font-medium text-slate-600">
              Question types
              <select value={questionTypes} onChange={(e) => setQuestionTypes(e.target.value)} className={`${inputCls} mt-1`}>
                <option value="mixed">Mixed</option>
                <option value="mcq">Multiple choice only</option>
                <option value="true_false">True / False only</option>
              </select>
            </label>
          </div>

          {error && <p className="rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}
          {notice && !error && <p className="rounded bg-green-50 p-2 text-sm text-green-800">{notice}</p>}

          <div className="flex items-center gap-3">
            <button
              disabled={busy}
              className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {busy ? 'Generating…' : 'Generate'}
            </button>
            {busy && <span className="text-sm text-slate-500">This can take up to 30 seconds.</span>}
          </div>
          <p className="text-xs text-slate-500">
            AI can make mistakes. Check every question and answer before you host.
          </p>
        </form>
      )}
    </div>
  );
}
