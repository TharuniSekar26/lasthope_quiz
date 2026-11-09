import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { errorMessage } from '../api/client.js';
import { exploreQuizzes, getCategories } from '../api/explore.js';
import { duplicateQuiz } from '../api/quizzes.js';
import Pagination from '../components/Pagination.jsx';
import QuizPreviewModal from '../components/QuizPreviewModal.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const PAGE_SIZE = 12;

// Public page: anyone can browse and preview. Duplicating needs a (free) host account.
export default function Explore() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();

  // The URL is the source of truth, so a search or page can be bookmarked and shared.
  const q = params.get('q') ?? '';
  const category = params.get('category') ?? '';
  const sort = params.get('sort') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);

  const [text, setText] = useState(q); // what's typed; applied to the URL after a short pause
  const [categories, setCategories] = useState([]);
  const [data, setData] = useState(null); // null = loading
  const [error, setError] = useState('');
  const [previewId, setPreviewId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const requestId = useRef(0);

  const update = useCallback(
    (changes) =>
      setParams((current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(changes)) {
          if (value === '' || value === null || value === undefined || (key === 'page' && value === 1)) next.delete(key);
          else next.set(key, String(value));
        }
        return next;
      }, { replace: true }),
    [setParams]
  );

  useEffect(() => {
    getCategories().then(setCategories).catch(() => {});
  }, []);

  // Debounce typing into the URL (and go back to page 1 for a new search).
  useEffect(() => {
    if (text.trim() === q) return undefined;
    const t = setTimeout(() => update({ q: text.trim(), page: 1 }), 350);
    return () => clearTimeout(t);
  }, [text, q, update]);

  // Load results whenever the URL's filters change. Late responses from older requests are ignored.
  useEffect(() => {
    const id = ++requestId.current;
    setError('');
    exploreQuizzes({ q: q || undefined, category: category || undefined, sort: sort || undefined, page, limit: PAGE_SIZE })
      .then((res) => id === requestId.current && setData(res))
      .catch((e) => {
        if (id !== requestId.current) return;
        setError(errorMessage(e));
        setData((d) => d ?? { quizzes: [], total: 0, totalPages: 1 });
      });
  }, [q, category, sort, page]);

  const duplicate = async (quizId) => {
    if (!user) {
      // Send visitors to log in, then bring them back here.
      navigate('/login', { state: { from: location } });
      return;
    }
    setBusyId(quizId);
    setError('');
    try {
      const copy = await duplicateQuiz(quizId);
      navigate(`/host/quizzes/${copy.id}`); // open the new private draft in the editor
    } catch (e) {
      setError(errorMessage(e));
      setBusyId(null);
    }
  };

  const closePreview = useCallback(() => setPreviewId(null), []);
  const loading = data === null;
  const sortValue = sort || (q ? 'relevance' : 'popular');

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/" className="text-sm text-slate-500 hover:underline">← Home</Link>
          <h1 className="text-3xl font-extrabold text-indigo-700">Explore quizzes</h1>
          <p className="text-slate-600">Ready-made quizzes from the community. Duplicate one to make it your own.</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          {user ? (
            <Link to="/host" className="rounded border border-slate-300 bg-white px-3 py-1.5 hover:bg-slate-100">My quizzes</Link>
          ) : (
            <Link to="/login" className="rounded bg-indigo-600 px-3 py-1.5 font-semibold text-white hover:bg-indigo-700">Host login</Link>
          )}
        </div>
      </header>

      {/* Search + sort */}
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <input
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={100}
          placeholder="Search by title, topic or tag…"
          aria-label="Search quizzes"
          className="w-full flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2.5 focus:border-indigo-500 focus:outline-none"
        />
        <select
          value={sortValue}
          onChange={(e) => update({ sort: e.target.value, page: 1 })}
          aria-label="Sort"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 sm:w-48"
        >
          {q && <option value="relevance">Best match</option>}
          <option value="popular">Most played</option>
          <option value="newest">Newest</option>
        </select>
      </div>

      {/* Category chips */}
      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Categories">
        {[{ id: '', label: 'All' }, ...categories].map((c) => (
          <button
            key={c.id}
            onClick={() => update({ category: c.id, page: 1 })}
            aria-pressed={category === c.id}
            disabled={c.id !== '' && c.count === 0 && category !== c.id}
            className={`rounded-full border px-3 py-1 text-sm disabled:opacity-40 ${
              category === c.id ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white hover:bg-slate-100'
            }`}
          >
            {c.label}
            {c.count !== undefined && <span className="ml-1 opacity-70">{c.count}</span>}
          </button>
        ))}
      </div>

      {error && <p className="mt-4 rounded bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}

      {loading ? (
        <p className="mt-10 text-center text-slate-500">Loading…</p>
      ) : data.quizzes.length === 0 ? (
        <p className="mt-10 rounded-lg border border-dashed border-slate-300 p-10 text-center text-slate-500">
          {q || category ? 'No quizzes match your search. Try different words or clear the filters.' : 'No public quizzes yet.'}
        </p>
      ) : (
        <>
          <p className="mt-5 text-sm text-slate-500">
            {data.total.toLocaleString()} quiz{data.total === 1 ? '' : 'zes'}
            {q && <> for “{q}”</>} · page {data.page ?? page} of {data.totalPages}
          </p>
          <ul className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.quizzes.map((quiz) => (
              <QuizCard
                key={quiz.id}
                quiz={quiz}
                categoryLabel={categories.find((c) => c.id === quiz.category)?.label ?? quiz.category}
                busy={busyId === quiz.id}
                onPreview={() => setPreviewId(quiz.id)}
                onDuplicate={() => duplicate(quiz.id)}
                canDuplicate={!!user}
              />
            ))}
          </ul>
          <Pagination
            page={page}
            totalPages={data.totalPages}
            onChange={(p) => {
              update({ page: p });
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        </>
      )}

      {previewId && (
        <QuizPreviewModal
          quizId={previewId}
          onClose={closePreview}
          onDuplicate={duplicate}
          duplicating={busyId === previewId}
          canDuplicate={!!user}
        />
      )}
    </div>
  );
}

function QuizCard({ quiz, categoryLabel, busy, onPreview, onDuplicate, canDuplicate }) {
  return (
    <li className="flex flex-col rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="rounded-full bg-indigo-50 px-2 py-0.5 font-medium text-indigo-700">{categoryLabel}</span>
        {quiz.isOfficial && <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-800">✔ Official</span>}
      </div>
      <h2 className="mt-2 text-lg font-bold leading-snug">{quiz.title}</h2>
      {quiz.description && <p className="mt-1 line-clamp-2 text-sm text-slate-600">{quiz.description}</p>}
      <p className="mt-3 text-sm text-slate-500">
        {quiz.questionCount} question{quiz.questionCount === 1 ? '' : 's'} · played {quiz.playCount.toLocaleString()}×
      </p>
      <p className="text-sm text-slate-500">by {quiz.author.name}</p>
      {quiz.tags.length > 0 && (
        <p className="mt-2 flex flex-wrap gap-1">
          {quiz.tags.slice(0, 3).map((t) => (
            <span key={t} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">#{t}</span>
          ))}
        </p>
      )}
      <div className="mt-auto flex gap-2 pt-4">
        <button onClick={onPreview} className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100">
          Preview
        </button>
        <button
          onClick={onDuplicate}
          disabled={busy}
          className="flex-[2] rounded bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {busy ? 'Copying…' : canDuplicate ? 'Duplicate to my account' : 'Log in to duplicate'}
        </button>
      </div>
    </li>
  );
}
