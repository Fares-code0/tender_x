import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { fetchMe, login, logout, type AuthUser } from '../api/auth';

export function useMe() {
  return useQuery({ queryKey: ['me'], queryFn: fetchMe, staleTime: 5 * 60 * 1000 });
}

export function useLogin() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      login(email, password),
    onSuccess: (user: AuthUser) => {
      queryClient.setQueryData(['me'], user);
      navigate('/');
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.setQueryData(['me'], null);
      queryClient.clear();
      navigate('/login');
    },
  });
}
