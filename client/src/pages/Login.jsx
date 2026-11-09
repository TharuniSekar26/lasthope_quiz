import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import AuthForm from '../components/AuthForm.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const dest = location.state?.from?.pathname || '/host';

  if (user) return <Navigate to={dest} replace />;

  return (
    <AuthForm
      title="Host login"
      submitLabel="Log in"
      fields={[
        { name: 'email', label: 'Email', type: 'email', autoComplete: 'email' },
        { name: 'password', label: 'Password', type: 'password', autoComplete: 'current-password' },
      ]}
      onSubmit={async (v) => {
        await login(v);
        navigate(dest, { replace: true });
      }}
      footer={{ text: 'New here?', to: '/register', link: 'Create an account' }}
    />
  );
}
