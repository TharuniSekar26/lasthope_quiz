// Accessible switch used on the dashboard and in the editor.
export default function PublishToggle({ isPublished, onChange, disabled, title }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isPublished}
      disabled={disabled}
      title={title}
      onClick={() => onChange(!isPublished)}
      className="flex items-center gap-2 text-sm disabled:opacity-50"
    >
      <span
        className={`relative inline-block h-5 w-9 rounded-full transition-colors ${
          isPublished ? 'bg-green-500' : 'bg-slate-300'
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
            isPublished ? 'left-4.5' : 'left-0.5'
          }`}
        />
      </span>
      <span className={isPublished ? 'font-medium text-green-700' : 'text-slate-600'}>
        {isPublished ? 'Published' : 'Draft'}
      </span>
    </button>
  );
}
