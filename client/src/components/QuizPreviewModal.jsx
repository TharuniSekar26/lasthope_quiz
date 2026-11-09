import { useEffect, useRef, useState } from 'react';
import { errorMessage } from '../api/client.js';
import { previewQuiz } from '../api/explore.js';
import { OPTION_STYLES } from './optionStyles.js';

/**
 * Public preview of a library quiz. The API sends a few sample questions with their options but
 * NEVER the correct answers, so nothing here can reveal them.
 */
export default function QuizPreviewModal({ quizId, onClose, onDuplicate, duplicating, canDuplicate }) {
  const [quiz, setQuiz] = useState(null);
  const [error, setError] = useState('');
  const closeRef = useRef(null);

  useEffect(() => {
    let live = true;
    previewQuiz(quizId)
      .then((q) => live && setQuiz(q))
      .catch((e) => live && setError(errorMessage(e)));
    return () => {
      live = false;
    };
  }, [quizId]);

  // Escape closes; focus starts on the close button; background doesn't scroll behind the modal.
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    closeRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  const more = quiz ? quiz.questionCount - quiz.sampleQuestions.length : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Quiz preview"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-4">
          <div className="min-w-0">
            <h2 className="truncate text-xl font-bold">{quiz?.title ?? 'Preview'}</h2>
            {quiz && (
              <p className="text-sm text-slate-500">
                by {quiz.author.name}
                {quiz.isOfficial && <span className="ml-2 rounded bg-indigo-100 px-1.5 py-0.5 text-xs font-semibold text-indigo-700">✔ Official</span>}
                {' · '}{quiz.questionCount} question{quiz.questionCount === 1 ? '' : 's'} · played {quiz.playCount.toLocaleString()} time{quiz.playCount === 1 ? '' : 's'}
              </p>
            )}
          </div>
          <button ref={closeRef} onClick={onClose} aria-label="Close preview" className="rounded px-2 py-1 text-xl leading-none text-slate-500 hover:bg-slate-100">
            ✕
          </button>
        </div>

        <div className="overflow-y-auto p-4">
          {error && <p className="rounded bg-red-50 p-3 text-red-700">{error}</p>}
          {!quiz && !error && <p className="text-center text-slate-500">Loading…</p>}
          {quiz && (
            <>
              {quiz.description && <p className="mb-4 text-slate-700">{quiz.description}</p>}
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Sample questions</h3>
              <ol className="space-y-4">
                {quiz.sampleQuestions.map((q, i) => (
                  <li key={i} className="rounded-lg border border-slate-200 p-3">
                    <p className="font-semibold"><span className="mr-1 text-indigo-600">{i + 1}.</span>{q.text}</p>
                    <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
                      {q.options.map((o, j) => (
                        <li key={j} className="flex items-center gap-2 rounded bg-slate-50 px-2 py-1.5 text-sm">
                          <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] text-white ${OPTION_STYLES[j]?.bg ?? 'bg-slate-400'}`}>{OPTION_STYLES[j]?.icon}</span>
                          <span className="min-w-0 break-words">{o}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-xs text-slate-400">{q.timeLimit}s · {q.points} points</p>
                  </li>
                ))}
              </ol>
              <p className="mt-4 text-center text-sm text-slate-500">
                {more > 0 ? `+ ${more} more question${more === 1 ? '' : 's'}. ` : ''}Correct answers are hidden. Duplicate the quiz to see and edit everything.
              </p>
              {quiz.tags.length > 0 && (
                <p className="mt-3 flex flex-wrap justify-center gap-1.5">
                  {quiz.tags.map((t) => <span key={t} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">#{t}</span>)}
                </p>
              )}
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 p-4">
          <button onClick={onClose} className="rounded border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100">Close</button>
          <button
            onClick={() => onDuplicate(quizId)}
            disabled={!quiz || duplicating}
            className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {duplicating ? 'Copying…' : canDuplicate ? 'Duplicate to my account' : 'Log in to duplicate'}
          </button>
        </div>
      </div>
    </div>
  );
}
