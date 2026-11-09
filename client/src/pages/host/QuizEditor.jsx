import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { errorMessage } from '../../api/client.js';
import { createQuiz, deleteQuiz, getQuiz, setPublished, updateQuiz } from '../../api/quizzes.js';
import PublishToggle from '../../components/PublishToggle.jsx';
import AiGeneratePanel from '../../components/AiGeneratePanel.jsx';
import LibrarySettings, { parseTags, validateLibrary } from '../../components/LibrarySettings.jsx';
import QuestionEditor from '../../components/QuestionEditor.jsx';

let keyCounter = 0;
const newKey = () => `q${++keyCounter}`; // stable React key; questions have no server id

const blankQuestion = () => ({
  key: newKey(),
  text: '',
  type: 'MCQ',
  options: ['', '', '', ''],
  correctIndex: 0,
  timeLimit: 20,
  points: 1000,
});

// Client-side checks mirror the server so most mistakes are caught before saving.
function validate(title, questions) {
  if (!title.trim()) return 'Please give your quiz a title.';
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const n = `Question ${i + 1}`;
    if (!q.text.trim()) return `${n}: enter the question text.`;
    if (q.options.some((o) => !o.trim())) return `${n}: fill in or remove empty options.`;
    if (q.timeLimit === '' || q.timeLimit < 5 || q.timeLimit > 120) return `${n}: time limit must be 5-120 seconds.`;
    if (q.points === '' || q.points < 0 || q.points > 10000) return `${n}: points must be 0-10000.`;
  }
  return '';
}

export default function QuizEditor() {
  const { id } = useParams(); // undefined when creating
  const navigate = useNavigate();
  const isNew = !id;

  const [loading, setLoading] = useState(!isNew);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [questions, setQuestions] = useState([]);
  const [isPublished, setIsPublished] = useState(false);
  const [createdVia, setCreatedVia] = useState('manual'); // becomes "ai" once a draft is generated
  // Library settings (see LibrarySettings): where the quiz lives in Explore.
  const [library, setLibrary] = useState({ visibility: 'private', category: 'other', tagsText: '', language: 'en' });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    if (isNew) return;
    getQuiz(id)
      .then((quiz) => {
        setTitle(quiz.title);
        setDescription(quiz.description || '');
        setIsPublished(quiz.isPublished);
        setLibrary({
          visibility: quiz.visibility ?? 'private',
          category: quiz.category ?? 'other',
          tagsText: (quiz.tags ?? []).join(', '),
          language: quiz.language ?? 'en',
        });
        setQuestions(quiz.questions.map((q) => ({ ...q, key: newKey() })));
      })
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false));
  }, [id, isNew]);

  // Warn before closing the tab with unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e) => e.preventDefault();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const edit = (setter) => (value) => {
    setter(value);
    setDirty(true);
    setNotice('');
  };

  const patchQuestion = (key, patch) =>
    edit(setQuestions)(questions.map((q) => (q.key === key ? { ...q, ...patch } : q)));

  const move = (index, dir) => {
    const next = [...questions];
    [next[index], next[index + dir]] = [next[index + dir], next[index]];
    edit(setQuestions)(next);
  };

  const addQuestion = () => {
    edit(setQuestions)([...questions, blankQuestion()]);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  };

  // Merge an AI draft into the editor as unsaved changes so the host reviews it before saving.
  // Questions are appended; title/description only fill in blanks so nothing typed is overwritten.
  const applyGenerated = (draft) => {
    if (!title.trim()) edit(setTitle)(draft.title);
    if (!description.trim()) edit(setDescription)(draft.description);
    edit(setQuestions)([...questions, ...draft.questions.map((q) => ({ ...q, key: newKey() }))]);
    if (isNew) setCreatedVia('ai');
    setError('');
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  };

  const save = async () => {
    setError('');
    setNotice('');
    const problem = validate(title, questions) || validateLibrary(library);
    if (problem) return setError(problem);

    const body = {
      title: title.trim(),
      description: description.trim(),
      questions: questions.map(({ key, ...q }) => q),
      createdVia,
      visibility: library.visibility,
      category: library.category,
      tags: parseTags(library.tagsText),
      language: library.language.trim().toLowerCase(),
    };
    setSaving(true);
    try {
      if (isNew) {
        const quiz = await createQuiz(body);
        setDirty(false);
        navigate(`/host/quizzes/${quiz.id}`, { replace: true });
      } else {
        await updateQuiz(id, body);
        setDirty(false);
        setNotice('Saved.');
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const togglePublish = async (value) => {
    setError('');
    try {
      const quiz = await setPublished(id, value);
      setIsPublished(quiz.isPublished);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const remove = async () => {
    if (!window.confirm('Delete this quiz? This cannot be undone.')) return;
    try {
      await deleteQuiz(id);
      setDirty(false);
      navigate('/host', { replace: true });
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  if (loading) return <p className="p-8 text-center text-slate-500">Loading…</p>;
  // Loading failed (e.g. quiz not found): nothing to edit.
  if (!isNew && error && !title) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <p className="rounded bg-red-50 p-3 text-red-700">{error}</p>
        <Link to="/host" className="mt-4 inline-block text-indigo-600 hover:underline">← Back to dashboard</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl p-6 pb-28">
      <Link
        to="/host"
        onClick={(e) => dirty && !window.confirm('Discard unsaved changes?') && e.preventDefault()}
        className="text-sm text-indigo-600 hover:underline"
      >
        ← Dashboard
      </Link>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{isNew ? 'New quiz' : 'Edit quiz'}</h1>
        {!isNew && (
          <PublishToggle
            isPublished={isPublished}
            onChange={togglePublish}
            disabled={dirty || (!isPublished && questions.length === 0)}
            title={dirty ? 'Save your changes first' : questions.length === 0 ? 'Add a question first' : undefined}
          />
        )}
      </div>

      <div className="mt-4 space-y-3 rounded-lg bg-white p-4 shadow-sm">
        <label className="block text-sm font-medium">
          Title
          <input
            maxLength={100}
            value={title}
            onChange={(e) => edit(setTitle)(e.target.value)}
            placeholder="e.g. World Capitals"
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 font-normal focus:border-indigo-500 focus:outline-none"
          />
        </label>
        <label className="block text-sm font-medium">
          Description <span className="font-normal text-slate-400">(optional)</span>
          <textarea
            rows={2}
            maxLength={500}
            value={description}
            onChange={(e) => edit(setDescription)(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 font-normal focus:border-indigo-500 focus:outline-none"
          />
        </label>
      </div>

      <LibrarySettings
        values={library}
        onChange={(patch) => edit(setLibrary)({ ...library, ...patch })}
        isPublished={isPublished}
        isNew={isNew}
      />

      <AiGeneratePanel onGenerated={applyGenerated} hasQuestions={questions.length > 0} />

      <div className="mt-6 space-y-4">
        {questions.map((q, i) => (
          <QuestionEditor
            key={q.key}
            q={q}
            index={i}
            total={questions.length}
            onChange={(patch) => patchQuestion(q.key, patch)}
            onRemove={() => edit(setQuestions)(questions.filter((x) => x.key !== q.key))}
            onMove={(dir) => move(i, dir)}
          />
        ))}
        {questions.length === 0 && (
          <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-slate-500">
            No questions yet.
          </p>
        )}
        <button
          type="button"
          onClick={addQuestion}
          className="w-full rounded-lg border-2 border-dashed border-indigo-300 py-3 font-medium text-indigo-600 hover:bg-indigo-50"
        >
          + Add question
        </button>
        <div ref={bottomRef} />
      </div>

      {/* Sticky action bar */}
      <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white/95 p-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <button
            onClick={save}
            disabled={saving || (!isNew && !dirty)}
            className="rounded bg-indigo-600 px-5 py-2 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : isNew ? 'Create quiz' : 'Save changes'}
          </button>
          {!isNew && (
            <button onClick={remove} className="text-sm text-red-600 hover:underline">Delete quiz</button>
          )}
          <div className="min-w-0 flex-1 text-sm">
            {error && <span className="text-red-700">{error}</span>}
            {!error && notice && <span className="text-green-700">{notice}</span>}
            {!error && !notice && dirty && <span className="text-slate-500">Unsaved changes</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
