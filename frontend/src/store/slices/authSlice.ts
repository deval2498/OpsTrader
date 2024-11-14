// src/store/slices/authSlice.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface AuthState {
    isLoggedIn: boolean;
    username: string | null;
    isLoginModalOpen: boolean;
}

const initialState: AuthState = {
    isLoggedIn: false,
    username: null,
    isLoginModalOpen: false
    
};

const authSlice = createSlice({
    name: 'auth',
    initialState,
    reducers: {
        loginSuccess: (state, action: PayloadAction<string>) => {
            state.isLoggedIn = true;
            state.username = action.payload;
            state.isLoginModalOpen = false;
        },
        logout: (state) => {
            state.isLoggedIn = false;
            state.username = null;
        },
        openLoginModal: (state) => {
            state.isLoginModalOpen = true;
        },
        closeLoginModal: (state) => {
            state.isLoginModalOpen = false;
        },
    },
});

export const { loginSuccess, logout, openLoginModal, closeLoginModal } = authSlice.actions;
export default authSlice.reducer;
