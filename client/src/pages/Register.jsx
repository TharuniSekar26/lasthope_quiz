import { Navigate, useNavigate } from 'react-router-dom';
import AuthForm from '../components/AuthForm.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export default function Register() {
  const { user, register } = useAuth();
  const navigate = useNavigate();

  if (user) return <Navigate to="/host" replace />;

  return (
    <AuthForm
      title="Create host account"
      submitLabel="Sign up"
      fields={[
        { name: 'name', label: 'Name', type: 'text', autoComplete: 'name' },
        { name: 'email', label: 'Email', type: 'email', autoComplete: 'email' },
        { name: 'password', label: 'Password (min 8 chars)', type: 'password', autoComplete: 'new-password' },
      ]}
      onSubmit={async (v) => {
        await register(v);
        navigate('/host', { replace: true });
      }}
      footer={{ text: 'Already have an account?', to: '/login', link: 'Log in' }}
    />
  );
}
