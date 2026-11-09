import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { errorMessage } from '../../api/client.js';
import { createGame } from '../../api/games.js';
import { deleteQuiz, duplicateQuiz, listQuizzes, setPublished } from '../../api/quizzes.js';
import PublishToggle from '../../components/PublishToggle.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [quizzes, setQuizzes] = useState(null); // null = loading
  const [error, setError] = useState('');

  useEffect(() => {
    listQuizzes()
      .then(setQuizzes)
      .catch((e) => {
        setError(errorMessage(e));
        setQuizzes([]);
      });
  }, []);

  const replace = (q) => setQuizzes((list) => list.map((x) => (x.id === q.id ? { ...x, ...q, questionCount: x.questionCount } : x)));

  const togglePublish = async (quiz, value) => {
    setError('');
    try {
      replace(await setPublished(quiz.id, value));
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const hostLive = async (quiz) => {
    setError('');
    try {
      const { pin } = await createGame(quiz.id);
      navigate(`/host/game/${pin}`);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  // Copy one of your quizzes (as a private draft) and open the copy.
  const duplicate = async (quiz) => {
    setError('');
    try {
      const copy = await duplicateQuiz(quiz.id);
      navigate(`/host/quizzes/${copy.id}`);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const remove = async (quiz) => {
    if (!window.confirm(`Delete "${quiz.title}"? This cannot be undone.`)) return;
    setError('');
    try {
      await deleteQuiz(quiz.id);
      setQuizzes((list) => list.filter((x) => x.id !== quiz.id));
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Welcome, {user.name}</h1>
        <div className="flex items-center gap-2">
          <Link to="/explore" className="rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100">
            Explore
          </Link>
          <Link to="/host/reports" className="rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100">
            Reports
          </Link>
          <button onClick={logout} className="rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100">
            Log out
          </button>
        </div>
      </div>

      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-lg font-semibold">My quizzes</h2>
        <Link to="/host/quizzes/new" className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
          + New quiz
        </Link>
      </div>

      {error && <p className="mt-4 rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}

      {quizzes === null ? (
        <p className="mt-6 text-slate-500">Loading…</p>
      ) : quizzes.length === 0 ? (
        <p className="mt-6 rounded-lg border border-dashed border-slate-300 p-8 text-center text-slate-500">
          No quizzes yet. Create your first one!
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {quizzes.map((q) => (
            <li key={q.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white p-4 shadow-sm">
              <div className="min-w-0">
                <Link to={`/host/quizzes/${q.id}`} className="block truncate font-semibold hover:text-indigo-600">
                  {q.title}
                </Link>
                <p className="text-sm text-slate-500">
                  {q.questionCount} question{q.questionCount === 1 ? '' : 's'} · updated{' '}
                  {new Date(q.updatedAt).toLocaleDateString()}
                  {q.visibility === 'public' && (
                    <span
                      className={`ml-2 rounded px-1.5 py-0.5 text-xs font-medium ${q.isPublished ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}
                      title={q.isPublished ? 'Listed in Explore' : 'Public, but not listed until you publish it'}
                    >
                      {q.isPublished ? 'Public' : 'Public (publish to list)'}
                    </span>
                  )}
                  {q.clonedFrom && <span className="ml-2 text-xs text-slate-400">copied</span>}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <PublishToggle
                  isPublished={q.isPublished}
                  onChange={(v) => togglePublish(q, v)}
                  disabled={!q.isPublished && q.questionCount === 0}
                  title={q.questionCount === 0 ? 'Add a question first' : undefined}
                />
                <button
                  onClick={() => hostLive(q)}
                  disabled={!q.isPublished}
                  title={q.isPublished ? undefined : 'Publish the quiz to host it'}
                  className="rounded bg-green-600 px-3 py-1 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-40"
                >
                  Host live
                </button>
                <Link to={`/host/quizzes/${q.id}`} className="text-sm text-indigo-600 hover:underline">
                  Edit
                </Link>
                <button onClick={() => duplicate(q)} className="text-sm text-slate-600 hover:underline">
                  Duplicate
                </button>
                <button onClick={() => remove(q)} className="text-sm text-red-600 hover:underline">
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
