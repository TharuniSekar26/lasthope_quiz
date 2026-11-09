import { useState } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../api/client.js';

// Shared form for login and register. `fields` is a list of { name, label, type }.
export default function AuthForm({ title, fields, submitLabel, onSubmit, footer }) {
  const [values, setValues] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await onSubmit(values);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto mt-16 w-full max-w-sm rounded-xl bg-white p-6 shadow">
      <h1 className="mb-4 text-2xl font-bold">{title}</h1>
      <form onSubmit={handleSubmit} className="space-y-3">
        {fields.map((f) => (
          <label key={f.name} className="block text-sm font-medium">
            {f.label}
            <input
              type={f.type}
              required
              autoComplete={f.autoComplete}
              value={values[f.name] || ''}
              onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 font-normal focus:border-indigo-500 focus:outline-none"
            />
          </label>
        ))}
        {error && <p className="rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}
        <button
          disabled={busy}
          className="w-full rounded bg-indigo-600 py-2 font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {busy ? 'Please wait…' : submitLabel}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-slate-600">
        {footer.text} <Link to={footer.to} className="text-indigo-600 hover:underline">{footer.link}</Link>
      </p>
    </div>
  );
}
