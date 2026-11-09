import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Explore from './pages/Explore.jsx';
import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Dashboard from './pages/host/Dashboard.jsx';
import QuizEditor from './pages/host/QuizEditor.jsx';
import Join from './pages/play/Join.jsx';
import Play from './pages/play/Play.jsx';
import HostGame from './pages/host/HostGame.jsx';
import ReportDetail from './pages/host/ReportDetail.jsx';
import Reports from './pages/host/Reports.jsx';

const PodiumPreview = import.meta.env.DEV ? lazy(() => import('./pages/dev/PodiumPreview.jsx')) : null;

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/join" element={<Join />} />
      <Route path="/explore" element={<Explore />} />
      <Route path="/play/:pin" element={<Play />} />
      {/* Dev-only: preview the podium reveal with fake players. Not registered in production builds. */}
      {PodiumPreview && (
        <Route path="/dev/podium" element={<Suspense fallback={null}><PodiumPreview /></Suspense>} />
      )}
      <Route element={<ProtectedRoute />}>
        <Route path="/host" element={<Dashboard />} />
        <Route path="/host/game/:pin" element={<HostGame />} />
        <Route path="/host/reports" element={<Reports />} />
        <Route path="/host/reports/:id" element={<ReportDetail />} />
        <Route path="/host/quizzes/new" element={<QuizEditor />} />
        <Route path="/host/quizzes/:id" element={<QuizEditor />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
