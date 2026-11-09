import { useEffect, useState } from 'react';
import { getCategories } from '../api/explore.js';

const inputCls = 'w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none';
const LANGUAGES = [['en', 'English'], ['es', 'Spanish'], ['fr', 'French'], ['de', 'German'], ['pt', 'Portuguese'], ['hi', 'Hindi'], ['ar', 'Arabic'], ['zh', 'Chinese'], ['ja', 'Japanese']];

// Comma-separated text -> clean tag list (lower-case, unique, no blanks). Used when saving.
export const parseTags = (text) => [...new Set(text.split(/[,\n]/).map((t) => t.trim().toLowerCase()).filter(Boolean))];

// Returns an error message for the library settings, or '' if they are fine.
export function validateLibrary({ tagsText, language }) {
  const tags = parseTags(tagsText);
  if (tags.length > 10) return 'Use at most 10 tags.';
  if (tags.some((t) => t.length > 30)) return 'Each tag can be at most 30 characters.';
  if (!/^[a-z]{2,3}(-[a-z0-9]{2,8})?$/i.test(language.trim())) return 'Language must be a code like "en" or "pt-br".';
  return '';
}

/**
 * Where the quiz lives in the library: visibility, category, tags and language.
 * Controlled by the editor via `values` and `onChange(patch)`.
 */
export default function LibrarySettings({ values, onChange, isPublished, isNew }) {
  const [categories, setCategories] = useState([]);
  useEffect(() => {
    getCategories().then(setCategories).catch(() => {});
  }, []);

  const isPublic = values.visibility === 'public';

  return (
    <details open={isPublic} className="mt-4 rounded-lg bg-white shadow-sm">
      <summary className="cursor-pointer select-none px-4 py-3 font-semibold">
        Library settings
        <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${isPublic ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'}`}>
          {isPublic ? 'Public' : 'Private'}
        </span>
      </summary>

      <div className="space-y-4 border-t border-slate-100 px-4 pb-4 pt-3">
        <fieldset>
          <legend className="mb-1 text-sm font-medium">Who can find this quiz?</legend>
          <div className="inline-flex rounded border border-slate-300 p-0.5 text-sm">
            {[['private', 'Private (only me)'], ['public', 'Public (Explore)']].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => onChange({ visibility: value })}
                aria-pressed={values.visibility === value}
                className={`rounded px-3 py-1.5 ${values.visibility === value ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
              >
                {label}
              </button>
            ))}
          </div>
          {isPublic && (
            <p className="mt-2 rounded bg-amber-50 p-2 text-xs text-amber-900">
              Public quizzes are listed in Explore once published. Anyone can preview the questions (without answers) and duplicate the quiz
              to their own account, <b>including the correct answers</b>. They can't change your original.
              {!isPublished && !isNew && ' This quiz is not published yet, so it will not appear until you publish it.'}
              {isNew && ' Publish it after saving to list it.'}
            </p>
          )}
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">
            Category
            <select value={values.category} onChange={(e) => onChange({ category: e.target.value })} className={`${inputCls} mt-1 font-normal`}>
              {categories.length === 0 && <option value={values.category}>{values.category}</option>}
              {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium">
            Language
            <input
              list="quiz-languages"
              value={values.language}
              onChange={(e) => onChange({ language: e.target.value })}
              maxLength={12}
              placeholder="en"
              className={`${inputCls} mt-1 font-normal`}
            />
            <datalist id="quiz-languages">{LANGUAGES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</datalist>
          </label>
        </div>

        <label className="block text-sm font-medium">
          Tags <span className="font-normal text-slate-400">(comma separated, up to 10)</span>
          <input
            value={values.tagsText}
            onChange={(e) => onChange({ tagsText: e.target.value })}
            placeholder="e.g. space, planets, astronomy"
            className={`${inputCls} mt-1 font-normal`}
          />
        </label>
      </div>
    </details>
  );
}
