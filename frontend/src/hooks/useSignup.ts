// src/hooks/useLogin.ts
import { useMutation } from '@tanstack/react-query';
import { createUser } from '@/api/createUser';
import { useDispatch } from 'react-redux';
import { loginSuccess } from '@/store/slices/authSlice';

export const useSignup = () => {
    const dispatch = useDispatch();

    return useMutation({
        mutationFn: createUser,
        onSuccess: (data) => {
            // Update Redux state on successful login
            dispatch(loginSuccess(data.username));
            // Store the token or any other relevant info if needed
            localStorage.setItem('token', data.username); // Example for storing token
        },
        onError: (error) => {
            console.error("User creation failed", error);
        },
    });
};
