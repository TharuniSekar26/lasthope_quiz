const TIME_PRESETS = [5, 10, 20, 30, 60, 90, 120];

const inputCls =
  'w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none';

// One editable question card. `q` is controlled by the parent via onChange(patch).
export default function QuestionEditor({ q, index, total, onChange, onRemove, onMove }) {
  const isTF = q.type === 'TRUE_FALSE';

  const changeType = (type) => {
    if (type === 'TRUE_FALSE') {
      onChange({ type, options: ['True', 'False'], correctIndex: Math.min(q.correctIndex, 1) });
    } else {
      onChange({ type, options: ['', '', '', ''], correctIndex: 0 });
    }
  };

  const setOption = (i, value) => onChange({ options: q.options.map((o, j) => (j === i ? value : o)) });

  const addOption = () => onChange({ options: [...q.options, ''] });

  const removeOption = (i) => {
    // Keep the correct answer pointing at the same option after removal.
    let correctIndex = q.correctIndex;
    if (i < correctIndex) correctIndex -= 1;
    else if (i === correctIndex) correctIndex = 0;
    onChange({ options: q.options.filter((_, j) => j !== i), correctIndex });
  };

  return (
    <div className="rounded-lg bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-indigo-700">Question {index + 1}</span>
        <div className="flex items-center gap-1 text-sm">
          <button type="button" disabled={index === 0} onClick={() => onMove(-1)} className="rounded px-2 py-1 hover:bg-slate-100 disabled:opacity-30" aria-label="Move up">↑</button>
          <button type="button" disabled={index === total - 1} onClick={() => onMove(1)} className="rounded px-2 py-1 hover:bg-slate-100 disabled:opacity-30" aria-label="Move down">↓</button>
          <button type="button" onClick={onRemove} className="rounded px-2 py-1 text-red-600 hover:bg-red-50">Delete</button>
        </div>
      </div>

      <textarea
        rows={2}
        maxLength={300}
        placeholder="Type your question"
        value={q.text}
        onChange={(e) => onChange({ text: e.target.value })}
        className={inputCls}
      />

      <div className="mt-3 space-y-2">
        {q.options.map((opt, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="radio"
              name={`correct-${q.key}`}
              checked={q.correctIndex === i}
              onChange={() => onChange({ correctIndex: i })}
              className="h-4 w-4 accent-green-600"
              aria-label={`Mark option ${i + 1} as correct`}
            />
            {isTF ? (
              <span className={`flex-1 rounded px-3 py-2 text-sm ${q.correctIndex === i ? 'bg-green-50 font-medium text-green-800' : 'bg-slate-50'}`}>
                {opt}
              </span>
            ) : (
              <input
                maxLength={120}
                placeholder={`Option ${i + 1}`}
                value={opt}
                onChange={(e) => setOption(i, e.target.value)}
                className={`${inputCls} ${q.correctIndex === i ? 'border-green-500 bg-green-50' : ''}`}
              />
            )}
            {!isTF && q.options.length > 2 && (
              <button type="button" onClick={() => removeOption(i)} className="px-2 text-slate-400 hover:text-red-600" aria-label="Remove option">✕</button>
            )}
          </div>
        ))}
        {!isTF && q.options.length < 4 && (
          <button type="button" onClick={addOption} className="text-sm text-indigo-600 hover:underline">+ Add option</button>
        )}
        <p className="text-xs text-slate-500">Select the radio button next to the correct answer.</p>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="text-xs font-medium text-slate-600">
          Type
          <select value={q.type} onChange={(e) => changeType(e.target.value)} className={`${inputCls} mt-1`}>
            <option value="MCQ">Multiple choice</option>
            <option value="TRUE_FALSE">True / False</option>
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600">
          Time limit (seconds)
          <input
            type="number"
            min={5}
            max={120}
            list="time-presets"
            value={q.timeLimit}
            onChange={(e) => onChange({ timeLimit: e.target.value === '' ? '' : Number(e.target.value) })}
            className={`${inputCls} mt-1`}
          />
          <datalist id="time-presets">{TIME_PRESETS.map((t) => <option key={t} value={t} />)}</datalist>
        </label>
        <label className="text-xs font-medium text-slate-600">
          Points
          <input
            type="number"
            min={0}
            max={10000}
            step={100}
            value={q.points}
            onChange={(e) => onChange({ points: e.target.value === '' ? '' : Number(e.target.value) })}
            className={`${inputCls} mt-1`}
          />
        </label>
      </div>
    </div>
  );
}
