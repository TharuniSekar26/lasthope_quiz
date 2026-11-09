import { Link } from 'react-router-dom';

export default function Landing() {
  return (
    <div className="mx-auto mt-24 max-w-md px-4 text-center">
      <h1 className="text-4xl font-extrabold text-indigo-700">Live Quiz</h1>
      <p className="mt-2 text-slate-600">Play along with your class in real time.</p>
      <div className="mt-8 space-y-3">
        <Link to="/join" className="block rounded bg-indigo-600 py-3 font-semibold text-white hover:bg-indigo-700">
          Join a game
        </Link>
        <Link to="/explore" className="block rounded border border-indigo-300 bg-indigo-50 py-3 font-semibold text-indigo-700 hover:bg-indigo-100">
          Explore ready-made quizzes
        </Link>
        <Link to="/login" className="block rounded border border-slate-300 bg-white py-3 font-semibold hover:bg-slate-100">
          Host login
        </Link>
      </div>
    </div>
  );
}
